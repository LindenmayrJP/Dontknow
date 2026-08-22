import type { PoolClient } from "pg";
import { getPool } from "../../db/pool";
import { Counters } from "../lib/counters";
import {
  PandaScoreClient,
  type Game,
  type PsMatch,
  type PsPlayer,
  type PsTeam,
  type PsTournament,
} from "./client";

const GAMES: Game[] = ["lol", "valorant"];

/**
 * Todo upsert aqui é em lote (uma query por tabela, via `unnest`), não por
 * linha. Contra um Postgres remoto cada round-trip custa ~160ms: a versão
 * linha-a-linha levava ~37 minutos por sync, a em lote leva segundos.
 *
 * Consequência: nenhum lote pode conter a mesma chave de conflito duas
 * vezes — o Postgres recusa "ON CONFLICT DO UPDATE command cannot affect
 * row a second time". Daí o `dedupe` antes de cada gravação.
 */
export function dedupe<T>(rows: T[], key: (row: T) => string | number): T[] {
  const map = new Map<string | number, T>();
  for (const row of rows) map.set(key(row), row);
  return [...map.values()];
}

/** PandaScore usa not_started/running/finished; o banco usa scheduled/live/finished. */
function mapStatus(status: string): "scheduled" | "live" | "finished" {
  if (status === "running") return "live";
  if (status === "finished") return "finished";
  return "scheduled";
}

export function tally(counters: Counters, table: string, rows: { inserted: boolean }[]) {
  for (const row of rows) counters.record(table, row.inserted);
}

/**
 * Organizações, uma query. Conflito por nome — é assim que a linha do seed
 * é adotada em vez de duplicada. `region` usa COALESCE para preservar o
 * valor já gravado (o seed grava a liga, o PandaScore o país).
 */
async function upsertOrganizations(
  db: PoolClient,
  counters: Counters,
  teams: PsTeam[]
): Promise<Map<string, number>> {
  const rows = dedupe(teams, (t) => t.name);
  if (rows.length === 0) return new Map();

  const { rows: out } = await db.query<{
    id: number;
    name: string;
    inserted: boolean;
  }>(
    `INSERT INTO organizations (name, region, pandascore_id)
     SELECT v.name, v.region, v.ps_id
       FROM unnest($1::text[], $2::text[], $3::int[]) AS v(name, region, ps_id)
     ON CONFLICT (name) DO UPDATE
       SET region = COALESCE(organizations.region, EXCLUDED.region),
           pandascore_id = COALESCE(organizations.pandascore_id, EXCLUDED.pandascore_id)
     RETURNING id, name, (xmax = 0) AS inserted`,
    [rows.map((t) => t.name), rows.map((t) => t.location), rows.map((t) => t.id)]
  );

  tally(counters, "organizations", out);
  return new Map(out.map((r) => [r.name, r.id]));
}

/**
 * Times, duas queries: a primeira adota as linhas do seed (as que ainda não
 * têm pandascore_id), a segunda faz o upsert em lote por pandascore_id.
 */
export async function upsertTeams(
  db: PoolClient,
  counters: Counters,
  teams: PsTeam[],
  game: Game
): Promise<Map<number, number>> {
  const rows = dedupe(teams, (t) => t.id);
  if (rows.length === 0) return new Map();

  const orgs = await upsertOrganizations(db, counters, rows);
  const orgIds = rows.map((t) => orgs.get(t.name)!);

  // Adoção: reivindica a linha do seed daquela organização/jogo.
  await db.query(
    `UPDATE teams t
        SET pandascore_id = v.ps_id
       FROM unnest($1::int[], $2::int[]) AS v(org_id, ps_id)
      WHERE t.organization_id = v.org_id
        AND t.game = $3
        AND t.pandascore_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM teams x WHERE x.pandascore_id = v.ps_id)`,
    [orgIds, rows.map((t) => t.id), game]
  );

  const { rows: out } = await db.query<{
    id: number;
    pandascore_id: number;
    inserted: boolean;
  }>(
    `INSERT INTO teams (organization_id, game, name, slug, acronym, image_url, pandascore_id)
     SELECT v.org_id, $2, v.name, v.slug, v.acronym, v.image_url, v.ps_id
       FROM unnest($1::int[], $3::text[], $4::text[], $5::text[], $6::text[], $7::int[])
            AS v(org_id, name, slug, acronym, image_url, ps_id)
     ON CONFLICT (pandascore_id) DO UPDATE
       SET name = EXCLUDED.name,
           slug = EXCLUDED.slug,
           acronym = EXCLUDED.acronym,
           image_url = COALESCE(EXCLUDED.image_url, teams.image_url),
           organization_id = EXCLUDED.organization_id
     RETURNING id, pandascore_id, (xmax = 0) AS inserted`,
    [
      orgIds,
      game,
      rows.map((t) => t.name),
      rows.map((t) => t.slug),
      rows.map((t) => t.acronym),
      rows.map((t) => t.image_url),
      rows.map((t) => t.id),
    ]
  );

  tally(counters, "teams", out);
  return new Map(out.map((r) => [r.pandascore_id, r.id]));
}

/**
 * Jogadores, duas queries. A adoção casa por nome com as linhas do seed
 * (marcadas por `#SEED` no riot_id) — nunca toca em linha real.
 */
async function upsertPlayers(
  db: PoolClient,
  counters: Counters,
  players: PsPlayer[]
): Promise<Map<number, number>> {
  const rows = dedupe(players, (p) => p.id);
  if (rows.length === 0) return new Map();

  await db.query(
    `UPDATE players p
        SET pandascore_id = v.ps_id, riot_id = NULL
       FROM unnest($1::text[], $2::int[]) AS v(name, ps_id)
      WHERE p.name = v.name
        AND p.pandascore_id IS NULL
        AND p.riot_id LIKE '%#SEED'
        AND NOT EXISTS (SELECT 1 FROM players x WHERE x.pandascore_id = v.ps_id)`,
    [rows.map((p) => p.name), rows.map((p) => p.id)]
  );

  const { rows: out } = await db.query<{
    id: number;
    pandascore_id: number;
    inserted: boolean;
  }>(
    `INSERT INTO players (name, slug, role, nationality, image_url, pandascore_id)
     SELECT v.name, v.slug, v.role, v.nationality, v.image_url, v.ps_id
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[])
            AS v(name, slug, role, nationality, image_url, ps_id)
     ON CONFLICT (pandascore_id) DO UPDATE
       SET name = EXCLUDED.name,
           slug = EXCLUDED.slug,
           role = EXCLUDED.role,
           nationality = EXCLUDED.nationality,
           image_url = COALESCE(EXCLUDED.image_url, players.image_url)
     RETURNING id, pandascore_id, (xmax = 0) AS inserted`,
    [
      rows.map((p) => p.name),
      rows.map((p) => p.slug),
      rows.map((p) => p.role),
      rows.map((p) => p.nationality),
      rows.map((p) => p.image_url),
      rows.map((p) => p.id),
    ]
  );

  tally(counters, "players", out);
  return new Map(out.map((r) => [r.pandascore_id, r.id]));
}

/**
 * Reconcilia o histórico de vínculos com o roster recém-lido.
 *
 * Só mexe nos times efetivamente vistos nesta sync — um time fora das
 * páginas lidas não pode ter seu roster "esvaziado" por engano. Fecha antes
 * de abrir, porque o índice parcial do Módulo 1 permite só um vínculo ativo
 * por jogador.
 */
export async function reconcileMemberships(
  db: PoolClient,
  counters: Counters,
  seenTeamIds: number[],
  roster: { playerId: number; teamId: number }[]
) {
  if (seenTeamIds.length === 0) return;

  const fresh = dedupe(roster, (r) => `${r.playerId}:${r.teamId}`);
  const playerIds = fresh.map((r) => r.playerId);
  const teamIds = fresh.map((r) => r.teamId);

  const closed = await db.query(
    `UPDATE team_memberships m
        SET left_at = CURRENT_DATE
      WHERE m.left_at IS NULL
        AND m.team_id = ANY($1::int[])
        AND NOT EXISTS (
          SELECT 1
            FROM unnest($2::int[], $3::int[]) AS f(player_id, team_id)
           WHERE f.player_id = m.player_id AND f.team_id = m.team_id
        )`,
    [seenTeamIds, playerIds, teamIds]
  );

  if (closed.rowCount) {
    console.log(`  ${closed.rowCount} vínculos encerrados (saíram do roster)`);
  }

  // DISTINCT ON: um jogador listado em dois times no mesmo lote receberia
  // dois vínculos ativos, que o índice parcial recusa.
  const opened = await db.query(
    `INSERT INTO team_memberships (player_id, team_id, joined_at)
     SELECT DISTINCT ON (f.player_id) f.player_id, f.team_id, CURRENT_DATE
       FROM unnest($1::int[], $2::int[]) AS f(player_id, team_id)
      WHERE NOT EXISTS (
        SELECT 1 FROM team_memberships m
         WHERE m.player_id = f.player_id AND m.left_at IS NULL
      )
     ON CONFLICT (player_id) WHERE left_at IS NULL DO NOTHING`,
    [playerIds, teamIds]
  );

  for (let i = 0; i < (opened.rowCount ?? 0); i++) {
    counters.record("team_memberships", true);
  }
}

async function upsertTournaments(
  db: PoolClient,
  counters: Counters,
  matches: PsMatch[],
  game: Game
): Promise<Map<number, number>> {
  const seen = new Map<
    number,
    { t: PsTournament; league: string | null; serie: string | null }
  >();
  for (const m of matches) {
    if (m.tournament) {
      seen.set(m.tournament.id, {
        t: m.tournament,
        league: m.league?.name ?? null,
        serie: m.serie?.full_name ?? m.serie?.name ?? null,
      });
    }
  }

  const rows = [...seen.values()];
  if (rows.length === 0) return new Map();

  const { rows: out } = await db.query<{
    id: number;
    pandascore_id: number;
    inserted: boolean;
  }>(
    `INSERT INTO tournaments
       (name, game, start_date, end_date, slug, league_name, serie_name,
        has_bracket, pandascore_id)
     SELECT v.name, $1, v.begin_at, v.end_at, v.slug, v.league, v.serie,
            v.has_bracket, v.ps_id
       FROM unnest($2::text[], $3::timestamptz[], $4::timestamptz[], $5::text[],
                   $6::text[], $7::text[], $8::boolean[], $9::int[])
            AS v(name, begin_at, end_at, slug, league, serie, has_bracket, ps_id)
     ON CONFLICT (pandascore_id) DO UPDATE
       SET name = EXCLUDED.name,
           start_date = EXCLUDED.start_date,
           end_date = EXCLUDED.end_date,
           slug = EXCLUDED.slug,
           league_name = EXCLUDED.league_name,
           serie_name = EXCLUDED.serie_name,
           has_bracket = COALESCE(EXCLUDED.has_bracket, tournaments.has_bracket)
     RETURNING id, pandascore_id, (xmax = 0) AS inserted`,
    [
      game,
      // Nome do PandaScore costuma ser genérico ("Group Stage"); prefixar com
      // liga e série deixa a wiki legível.
      rows.map(
        (r) => [r.league, r.serie, r.t.name].filter(Boolean).join(" ") || r.t.name
      ),
      rows.map((r) => r.t.begin_at),
      rows.map((r) => r.t.end_at),
      rows.map((r) => r.t.slug),
      rows.map((r) => r.league),
      rows.map((r) => r.serie),
      rows.map((r) => r.t.has_bracket ?? null),
      rows.map((r) => r.t.id),
    ]
  );

  tally(counters, "tournaments", out);
  return new Map(out.map((r) => [r.pandascore_id, r.id]));
}

/**
 * Devolve o mapa `pandascore_id → matches.id` das partidas gravadas.
 *
 * `tournamentIdPadrao` (id interno) é para quem chama com partidas que
 * não trazem o objeto `tournament` aninhado — é o caso de
 * `/tournaments/{id}/brackets`, que devolve só `tournament_id`.
 */
export async function upsertMatches(
  db: PoolClient,
  counters: Counters,
  matches: PsMatch[],
  game: Game,
  tournamentIdPadrao?: number
): Promise<Map<number, number>> {
  // Partida sem os dois lados definidos (TBD do chaveamento) ainda não cabe
  // no schema — entra numa sync futura, quando o PandaScore preencher.
  const usable = matches.filter(
    (m) =>
      (m.opponents ?? []).map((o) => o.opponent).filter((o) => o?.id).length === 2 &&
      (m.tournament || tournamentIdPadrao !== undefined)
  );
  counters.skip("matches", matches.length - usable.length);
  if (usable.length === 0) return new Map();

  // Só as que trazem o objeto completo alimentam o upsert de torneios —
  // as do bracket não têm datas e apagariam as já gravadas.
  const tournaments = await upsertTournaments(
    db,
    counters,
    usable.filter((m) => m.tournament),
    game
  );

  // Os adversários vêm sem roster; o upsert de time não mexe em vínculos.
  const teams = await upsertTeams(
    db,
    counters,
    usable.flatMap((m) => m.opponents.map((o) => o.opponent)),
    game
  );

  const rows = dedupe(usable, (m) => m.id)
    .map((m) => {
      const a = m.opponents[0].opponent;
      const b = m.opponents[1].opponent;
      const teamA = teams.get(a.id);
      const teamB = teams.get(b.id);
      if (!teamA || !teamB || teamA === teamB) return null;

      const tournamentId = m.tournament
        ? tournaments.get(m.tournament.id)
        : tournamentIdPadrao;
      if (!tournamentId) return null;

      const scoreOf = (id: number) =>
        m.results?.find((r) => r.team_id === id)?.score ?? null;

      return {
        tournamentId,
        teamA,
        teamB,
        scheduledAt: m.scheduled_at,
        scoreA: scoreOf(a.id),
        scoreB: scoreOf(b.id),
        status: mapStatus(m.status),
        name: m.name,
        games: m.number_of_games,
        winner: m.winner_id === a.id ? teamA : m.winner_id === b.id ? teamB : null,
        psId: m.id,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  counters.skip("matches", usable.length - rows.length);
  if (rows.length === 0) return new Map();

  const { rows: out } = await db.query<{
    id: number;
    pandascore_id: number;
    inserted: boolean;
  }>(
    `INSERT INTO matches
       (tournament_id, team_a_id, team_b_id, scheduled_at, team_a_score,
        team_b_score, status, name, number_of_games, winner_team_id, pandascore_id)
     SELECT v.tournament_id, v.team_a, v.team_b, v.scheduled_at, v.score_a,
            v.score_b, v.status, v.name, v.games, v.winner, v.ps_id
       FROM unnest($1::int[], $2::int[], $3::int[], $4::timestamptz[], $5::int[],
                   $6::int[], $7::text[], $8::text[], $9::int[], $10::int[], $11::int[])
            AS v(tournament_id, team_a, team_b, scheduled_at, score_a, score_b,
                 status, name, games, winner, ps_id)
     ON CONFLICT (pandascore_id) DO UPDATE
       SET tournament_id = EXCLUDED.tournament_id,
           team_a_id = EXCLUDED.team_a_id,
           team_b_id = EXCLUDED.team_b_id,
           scheduled_at = EXCLUDED.scheduled_at,
           team_a_score = EXCLUDED.team_a_score,
           team_b_score = EXCLUDED.team_b_score,
           status = EXCLUDED.status,
           name = EXCLUDED.name,
           number_of_games = EXCLUDED.number_of_games,
           winner_team_id = EXCLUDED.winner_team_id,
           updated_at = now()
     RETURNING id, pandascore_id, (xmax = 0) AS inserted`,
    [
      rows.map((r) => r.tournamentId),
      rows.map((r) => r.teamA),
      rows.map((r) => r.teamB),
      rows.map((r) => r.scheduledAt),
      rows.map((r) => r.scoreA),
      rows.map((r) => r.scoreB),
      rows.map((r) => r.status),
      rows.map((r) => r.name),
      rows.map((r) => r.games),
      rows.map((r) => r.winner),
      rows.map((r) => r.psId),
    ]
  );

  tally(counters, "matches", out);
  return new Map(out.map((r) => [r.pandascore_id, r.id]));
}

export async function syncPandaScore(counters: Counters) {
  const apiKey = process.env.PANDASCORE_API_KEY;
  if (!apiKey) {
    throw new Error("PANDASCORE_API_KEY não definida no .env");
  }

  const maxPages = Number(process.env.PANDASCORE_MAX_PAGES ?? 3);
  const client = new PandaScoreClient(apiKey);
  const db = await getPool().connect();

  try {
    for (const game of GAMES) {
      console.log(`\n[pandascore] ${game}: times e rosters`);
      const teams = await client.listTeams(game, maxPages);

      // Uma transação por fase: se o PandaScore cair no meio, o banco não
      // fica com meio roster aplicado.
      await db.query("BEGIN");
      try {
        const teamIds = await upsertTeams(db, counters, teams, game);
        const playerIds = await upsertPlayers(
          db,
          counters,
          teams.flatMap((t) => t.players ?? [])
        );

        const roster = teams.flatMap((t) =>
          (t.players ?? []).flatMap((p) => {
            const playerId = playerIds.get(p.id);
            const teamId = teamIds.get(t.id);
            return playerId && teamId ? [{ playerId, teamId }] : [];
          })
        );

        await reconcileMemberships(db, counters, [...teamIds.values()], roster);
        await db.query("COMMIT");
      } catch (err) {
        await db.query("ROLLBACK");
        throw err;
      }

      console.log(`[pandascore] ${game}: torneios e partidas`);
      const [past, upcoming, running] = await Promise.all([
        client.listPastMatches(game, maxPages),
        client.listUpcomingMatches(game, maxPages),
        client.listRunningMatches(game, 1),
      ]);

      await db.query("BEGIN");
      try {
        await upsertMatches(db, counters, [...running, ...upcoming, ...past], game);
        await db.query("COMMIT");
      } catch (err) {
        await db.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    db.release();
  }
}
