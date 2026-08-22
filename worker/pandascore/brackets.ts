import type { PoolClient } from "pg";
import { getPool } from "../../db/pool";
import { Counters } from "../lib/counters";
import {
  PandaScoreClient,
  type Game,
  type PsBracketMatch,
  type PsStanding,
} from "./client";
import { dedupe, tally, upsertMatches, upsertTeams } from "./sync";

/**
 * Chaveamento e classificação de torneio.
 *
 * Escopo Valorant, como o resto do Módulo 3.6. As duas rotas usadas aqui
 * NÃO levam prefixo de jogo (`/tournaments/{id}/…`) — ver `client.ts`.
 */
const GAME: Game = "valorant";

type TorneioAlvo = {
  id: number;
  pandascore_id: number;
  name: string;
  has_bracket: boolean | null;
};

/**
 * Torneios a consultar. São duas chamadas de API por torneio, então a
 * varredura é limitada aos mais recentes — o histórico antigo não muda e
 * não justifica gastar cota a cada sync.
 */
async function torneiosAlvo(db: PoolClient, limite: number) {
  const { rows } = await db.query<TorneioAlvo>(
    `SELECT id, pandascore_id, name, has_bracket
       FROM tournaments
      WHERE game = $1 AND pandascore_id IS NOT NULL
      ORDER BY start_date DESC NULLS LAST
      LIMIT $2`,
    [GAME, limite]
  );
  return rows;
}

/**
 * Classificação de um torneio.
 *
 * Upserta os times antes de gravar: a tabela referencia `teams`, e um time
 * da classificação pode não ter entrado pelas páginas normais da sync.
 */
async function gravarStandings(
  db: PoolClient,
  counters: Counters,
  torneio: TorneioAlvo,
  standings: PsStanding[]
) {
  const linhas = dedupe(
    standings.filter((s) => s.team?.id),
    (s) => s.team.id
  );
  if (linhas.length === 0) return;

  const times = await upsertTeams(
    db,
    counters,
    linhas.map((s) => s.team),
    GAME
  );

  const resolvidas = linhas.flatMap((s) => {
    const teamId = times.get(s.team.id);
    return teamId
      ? [{ teamId, rank: s.rank, lastMatch: s.last_match?.id ?? null }]
      : [];
  });
  if (resolvidas.length === 0) return;

  const { rows } = await db.query<{ inserted: boolean }>(
    `INSERT INTO tournament_standings
       (tournament_id, team_id, rank, last_match_pandascore_id, updated_at)
     SELECT $1, v.team_id, v.rank, v.last_match, now()
       FROM unnest($2::int[], $3::int[], $4::int[])
            AS v(team_id, rank, last_match)
     ON CONFLICT (tournament_id, team_id) DO UPDATE
       SET rank = EXCLUDED.rank,
           last_match_pandascore_id = EXCLUDED.last_match_pandascore_id,
           updated_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [
      torneio.id,
      resolvidas.map((r) => r.teamId),
      resolvidas.map((r) => r.rank),
      resolvidas.map((r) => r.lastMatch),
    ]
  );

  tally(counters, "tournament_standings", rows);

  // Time que caiu da classificação (desclassificado, torneio reformulado)
  // não pode ficar preso numa posição antiga.
  const removidas = await db.query(
    `DELETE FROM tournament_standings
      WHERE tournament_id = $1 AND team_id <> ALL($2::int[])`,
    [torneio.id, resolvidas.map((r) => r.teamId)]
  );
  if (removidas.rowCount) {
    console.log(`    ${removidas.rowCount} posição(ões) obsoleta(s) removida(s)`);
  }
}

/**
 * Arestas do chaveamento.
 *
 * As partidas do bracket são upsertadas primeiro: além de garantir a FK,
 * o endpoint devolve o objeto completo da partida, então isso enriquece o
 * banco com jogos que talvez não tenham vindo nas páginas normais.
 */
async function gravarBracket(
  db: PoolClient,
  counters: Counters,
  torneio: TorneioAlvo,
  partidas: PsBracketMatch[]
) {
  if (partidas.length === 0) return;

  // As partidas do bracket não trazem o objeto `tournament` aninhado, só
  // `tournament_id` — daí passar o id interno já resolvido.
  await upsertMatches(db, counters, partidas, GAME, torneio.id);

  const arestas = partidas.flatMap((m) =>
    (m.previous_matches ?? [])
      .filter((p) => p.type === "winner" || p.type === "loser")
      .map((p) => ({
        psId: m.id,
        anteriorPsId: p.match_id,
        tipo: p.type,
      }))
  );

  const unicas = dedupe(arestas, (a) => `${a.psId}:${a.anteriorPsId}`);
  if (unicas.length === 0) return;

  // Resolve as FKs numa consulta só, cobrindo tanto as partidas gravadas
  // agora quanto as que já estavam no banco de syncs anteriores.
  const psIds = [
    ...new Set(unicas.flatMap((a) => [a.psId, a.anteriorPsId])),
  ];
  const { rows: existentes } = await db.query<{ pandascore_id: number; id: number }>(
    `SELECT pandascore_id, id FROM matches WHERE pandascore_id = ANY($1::int[])`,
    [psIds]
  );
  const porPsId = new Map(existentes.map((r) => [r.pandascore_id, r.id]));

  const { rows } = await db.query<{ inserted: boolean }>(
    `INSERT INTO match_bracket_edges
       (tournament_id, match_pandascore_id, previous_match_pandascore_id,
        edge_type, match_id, previous_match_id, updated_at)
     SELECT $1, v.ps_id, v.prev_ps_id, v.tipo, v.match_id, v.prev_id, now()
       FROM unnest($2::int[], $3::int[], $4::text[], $5::int[], $6::int[])
            AS v(ps_id, prev_ps_id, tipo, match_id, prev_id)
     ON CONFLICT (match_pandascore_id, previous_match_pandascore_id) DO UPDATE
       SET edge_type = EXCLUDED.edge_type,
           tournament_id = EXCLUDED.tournament_id,
           -- COALESCE para não perder um vínculo já resolvido: a partida
           -- pode ter saído da janela de páginas desta sync.
           match_id = COALESCE(EXCLUDED.match_id, match_bracket_edges.match_id),
           previous_match_id = COALESCE(EXCLUDED.previous_match_id,
                                        match_bracket_edges.previous_match_id),
           updated_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [
      torneio.id,
      unicas.map((a) => a.psId),
      unicas.map((a) => a.anteriorPsId),
      unicas.map((a) => a.tipo),
      unicas.map((a) => porPsId.get(a.psId) ?? null),
      unicas.map((a) => porPsId.get(a.anteriorPsId) ?? null),
    ]
  );

  tally(counters, "match_bracket_edges", rows);
}

export async function syncTournamentStructure(counters: Counters) {
  const apiKey = process.env.PANDASCORE_API_KEY;
  if (!apiKey) throw new Error("PANDASCORE_API_KEY não definida no .env");

  const limite = Number(process.env.PANDASCORE_BRACKET_TOURNAMENTS ?? 15);
  const client = new PandaScoreClient(apiKey);
  const db = await getPool().connect();

  try {
    const torneios = await torneiosAlvo(db, limite);
    if (torneios.length === 0) {
      console.log("[brackets] nenhum torneio de Valorant no banco ainda");
      return;
    }

    console.log(`[brackets] ${torneios.length} torneio(s) de Valorant`);
    let semTabela = 0;

    for (const torneio of torneios) {
      // 404 aqui é "torneio sem tabela" (formato de chave direta), não
      // falha: o cliente devolve null e a sync segue.
      const standings = await client.getStandings(torneio.pandascore_id);

      // `has_bracket = false` é a própria origem dizendo que não há chave;
      // pular evita a chamada. `null` (desconhecido) tenta mesmo assim.
      const brackets =
        torneio.has_bracket === false
          ? null
          : await client.getBrackets(torneio.pandascore_id);

      // Torneio sem chave (fase de grupos) não teve partidas trazidas pelo
      // bracket. Busca pela rota filtrada — a aninhada
      // `/{game}/tournaments/{id}/matches` não existe.
      const partidasDoTorneio =
        !brackets?.length && standings?.length
          ? await client.listMatchesByTournament(GAME, torneio.pandascore_id)
          : [];

      if (!standings?.length && !brackets?.length) {
        semTabela++;
        continue;
      }

      await db.query("BEGIN");
      try {
        if (standings?.length) {
          await gravarStandings(db, counters, torneio, standings);
        }
        if (brackets?.length) {
          await gravarBracket(db, counters, torneio, brackets);
        }
        if (partidasDoTorneio.length) {
          await upsertMatches(db, counters, partidasDoTorneio, GAME, torneio.id);
        }
        await db.query("COMMIT");
      } catch (err) {
        await db.query("ROLLBACK");
        throw err;
      }

      const partes = [
        standings?.length ? `${standings.length} na tabela` : null,
        brackets?.length ? `${brackets.length} na chave` : null,
        partidasDoTorneio.length ? `${partidasDoTorneio.length} partida(s)` : null,
      ].filter(Boolean);
      console.log(`  ${torneio.name}: ${partes.join(", ")}`);
    }

    if (semTabela) {
      console.log(
        `[brackets] ${semTabela} torneio(s) sem tabela nem chave na origem (normal)`
      );
    }
  } finally {
    db.release();
  }
}
