import type { PoolClient } from "pg";
import { pool } from "../../db/pool";
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

/** PandaScore usa not_started/running/finished; o banco usa scheduled/live/finished. */
function mapStatus(status: string): "scheduled" | "live" | "finished" {
  if (status === "running") return "live";
  if (status === "finished") return "finished";
  return "scheduled";
}

/**
 * Upsert de organização por nome (constraint UNIQUE do Módulo 1).
 * Isso "adota" a linha criada pelo seed em vez de duplicar: a org T1 do
 * seed vira a org T1 do PandaScore na primeira sync.
 *
 * `region` usa COALESCE para não sobrescrever o valor existente — o seed
 * grava a liga ("LCK") e o PandaScore o país ("KR"); o primeiro vence.
 */
async function upsertOrganization(
  client: PoolClient,
  counters: Counters,
  name: string,
  region: string | null,
  pandascoreId: number
): Promise<number> {
  const { rows } = await client.query<{ id: number; inserted: boolean }>(
    `INSERT INTO organizations (name, region, pandascore_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (name) DO UPDATE
       SET region = COALESCE(organizations.region, EXCLUDED.region),
           pandascore_id = COALESCE(organizations.pandascore_id, EXCLUDED.pandascore_id)
     RETURNING id, (xmax = 0) AS inserted`,
    [name, region, pandascoreId]
  );

  counters.record("organizations", rows[0].inserted);
  return rows[0].id;
}

/**
 * Upsert de time. Chave real é `pandascore_id`; o fallback por
 * (organization_id, game) adota a linha do seed, que tem pandascore_id NULL.
 */
export async function upsertTeam(
  client: PoolClient,
  counters: Counters,
  team: PsTeam,
  game: Game
): Promise<number> {
  const organizationId = await upsertOrganization(
    client,
    counters,
    team.name,
    team.location,
    team.id
  );

  const existing = await client.query<{ id: number }>(
    "SELECT id FROM teams WHERE pandascore_id = $1",
    [team.id]
  );

  if (existing.rows.length > 0) {
    await client.query(
      `UPDATE teams
          SET name = $2, slug = $3, acronym = $4,
              image_url = COALESCE($5, image_url),
              organization_id = $6
        WHERE id = $1`,
      [
        existing.rows[0].id,
        team.name,
        team.slug,
        team.acronym,
        team.image_url,
        organizationId,
      ]
    );
    counters.record("teams", false);
    return existing.rows[0].id;
  }

  const { rows } = await client.query<{ id: number; inserted: boolean }>(
    `INSERT INTO teams (organization_id, game, name, slug, acronym, image_url, pandascore_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (organization_id, game) DO UPDATE
       SET name = EXCLUDED.name,
           slug = EXCLUDED.slug,
           acronym = EXCLUDED.acronym,
           image_url = COALESCE(EXCLUDED.image_url, teams.image_url),
           pandascore_id = EXCLUDED.pandascore_id
     RETURNING id, (xmax = 0) AS inserted`,
    [
      organizationId,
      game,
      team.name,
      team.slug,
      team.acronym,
      team.image_url,
      team.id,
    ]
  );

  counters.record("teams", rows[0].inserted);
  return rows[0].id;
}

/**
 * Upsert de jogador por `pandascore_id`, com adoção das linhas do seed
 * (identificadas pelo sufixo `#SEED` no riot_id) para não duplicar.
 */
export async function upsertPlayer(
  client: PoolClient,
  counters: Counters,
  player: PsPlayer
): Promise<number> {
  const existing = await client.query<{ id: number }>(
    `SELECT id FROM players WHERE pandascore_id = $1
     UNION ALL
     SELECT id FROM players
      WHERE pandascore_id IS NULL AND name = $2 AND riot_id LIKE '%#SEED'
     LIMIT 1`,
    [player.id, player.name]
  );

  if (existing.rows.length > 0) {
    await client.query(
      `UPDATE players
          SET name = $2, slug = $3, role = $4, nationality = $5,
              image_url = COALESCE($6, image_url),
              pandascore_id = $7,
              riot_id = CASE WHEN riot_id LIKE '%#SEED' THEN NULL ELSE riot_id END
        WHERE id = $1`,
      [
        existing.rows[0].id,
        player.name,
        player.slug,
        player.role,
        player.nationality,
        player.image_url,
        player.id,
      ]
    );
    counters.record("players", false);
    return existing.rows[0].id;
  }

  const { rows } = await client.query<{ id: number; inserted: boolean }>(
    `INSERT INTO players (name, slug, role, nationality, image_url, pandascore_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (pandascore_id) DO UPDATE
       SET name = EXCLUDED.name,
           slug = EXCLUDED.slug,
           role = EXCLUDED.role,
           nationality = EXCLUDED.nationality,
           image_url = COALESCE(EXCLUDED.image_url, players.image_url)
     RETURNING id, (xmax = 0) AS inserted`,
    [
      player.name,
      player.slug,
      player.role,
      player.nationality,
      player.image_url,
      player.id,
    ]
  );

  counters.record("players", rows[0].inserted);
  return rows[0].id;
}

/**
 * Reconcilia o histórico de vínculos com o roster recém-lido.
 *
 * Só mexe nos times efetivamente vistos nesta sync — um time fora das
 * páginas lidas não pode ter seu roster "esvaziado" por engano. Fecha
 * antes de abrir, porque o índice parcial do Módulo 1 permite só um
 * vínculo ativo por jogador.
 */
export async function reconcileMemberships(
  client: PoolClient,
  counters: Counters,
  seenTeamIds: number[],
  roster: { playerId: number; teamId: number }[]
) {
  if (seenTeamIds.length === 0) return;

  const playerIds = roster.map((r) => r.playerId);
  const teamIds = roster.map((r) => r.teamId);

  const closed = await client.query(
    `UPDATE team_memberships m
        SET left_at = CURRENT_DATE
      WHERE m.left_at IS NULL
        AND m.team_id = ANY($1::int[])
        AND NOT EXISTS (
          SELECT 1
            FROM unnest($2::int[], $3::int[]) AS fresh(player_id, team_id)
           WHERE fresh.player_id = m.player_id AND fresh.team_id = m.team_id
        )`,
    [seenTeamIds, playerIds, teamIds]
  );

  if (closed.rowCount) {
    console.log(`  ${closed.rowCount} vínculos encerrados (saíram do roster)`);
  }

  const opened = await client.query(
    `INSERT INTO team_memberships (player_id, team_id, joined_at)
     SELECT fresh.player_id, fresh.team_id, CURRENT_DATE
       FROM unnest($1::int[], $2::int[]) AS fresh(player_id, team_id)
      WHERE NOT EXISTS (
        SELECT 1 FROM team_memberships m
         WHERE m.player_id = fresh.player_id
           AND m.team_id = fresh.team_id
           AND m.left_at IS NULL
      )
     ON CONFLICT (player_id) WHERE left_at IS NULL DO NOTHING`,
    [playerIds, teamIds]
  );

  for (let i = 0; i < (opened.rowCount ?? 0); i++) {
    counters.record("team_memberships", true);
  }
}

async function upsertTournament(
  client: PoolClient,
  counters: Counters,
  tournament: PsTournament,
  game: Game,
  leagueName: string | null,
  serieName: string | null
): Promise<number> {
  // Nome do PandaScore costuma ser genérico ("Group Stage"); prefixar com
  // liga e série deixa a wiki legível.
  const fullName = [leagueName, serieName, tournament.name]
    .filter(Boolean)
    .join(" ");

  const { rows } = await client.query<{ id: number; inserted: boolean }>(
    `INSERT INTO tournaments
       (name, game, start_date, end_date, slug, league_name, serie_name, pandascore_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (pandascore_id) DO UPDATE
       SET name = EXCLUDED.name,
           start_date = EXCLUDED.start_date,
           end_date = EXCLUDED.end_date,
           slug = EXCLUDED.slug,
           league_name = EXCLUDED.league_name,
           serie_name = EXCLUDED.serie_name
     RETURNING id, (xmax = 0) AS inserted`,
    [
      fullName || tournament.name,
      game,
      tournament.begin_at,
      tournament.end_at,
      tournament.slug,
      leagueName,
      serieName,
      tournament.id,
    ]
  );

  counters.record("tournaments", rows[0].inserted);
  return rows[0].id;
}

export async function upsertMatch(
  client: PoolClient,
  counters: Counters,
  match: PsMatch,
  game: Game
) {
  const opponents = (match.opponents ?? [])
    .map((o) => o.opponent)
    .filter((o): o is PsTeam => Boolean(o?.id));

  // Partida sem os dois lados definidos (TBD do chaveamento) ainda não
  // cabe no schema — entra numa sync futura, quando o PandaScore preencher.
  if (opponents.length !== 2 || !match.tournament) {
    counters.skip("matches");
    return;
  }

  const tournamentId = await upsertTournament(
    client,
    counters,
    match.tournament,
    game,
    match.league?.name ?? null,
    match.serie?.full_name ?? match.serie?.name ?? null
  );

  const teamAId = await upsertTeam(client, counters, opponents[0], game);
  const teamBId = await upsertTeam(client, counters, opponents[1], game);

  if (teamAId === teamBId) {
    counters.skip("matches");
    return;
  }

  const scoreOf = (psTeamId: number) =>
    match.results?.find((r) => r.team_id === psTeamId)?.score ?? null;

  const winnerTeamId =
    match.winner_id === opponents[0].id
      ? teamAId
      : match.winner_id === opponents[1].id
        ? teamBId
        : null;

  const { rows } = await client.query<{ inserted: boolean }>(
    `INSERT INTO matches
       (tournament_id, team_a_id, team_b_id, scheduled_at, team_a_score,
        team_b_score, status, name, number_of_games, winner_team_id, pandascore_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
     RETURNING (xmax = 0) AS inserted`,
    [
      tournamentId,
      teamAId,
      teamBId,
      match.scheduled_at,
      scoreOf(opponents[0].id),
      scoreOf(opponents[1].id),
      mapStatus(match.status),
      match.name,
      match.number_of_games,
      winnerTeamId,
      match.id,
    ]
  );

  counters.record("matches", rows[0].inserted);
}

export async function syncPandaScore(counters: Counters) {
  const apiKey = process.env.PANDASCORE_API_KEY;
  if (!apiKey) {
    throw new Error("PANDASCORE_API_KEY não definida no .env");
  }

  const maxPages = Number(process.env.PANDASCORE_MAX_PAGES ?? 3);
  const client = new PandaScoreClient(apiKey);
  const db = await pool.connect();

  try {
    for (const game of GAMES) {
      console.log(`\n[pandascore] ${game}: times e rosters`);
      const teams = await client.listTeams(game, maxPages);

      const seenTeamIds: number[] = [];
      const roster: { playerId: number; teamId: number }[] = [];

      // Uma transação por jogo: se o PandaScore cair no meio, o banco não
      // fica com meio roster aplicado.
      await db.query("BEGIN");
      try {
        for (const team of teams) {
          const teamId = await upsertTeam(db, counters, team, game);
          seenTeamIds.push(teamId);

          for (const player of team.players ?? []) {
            const playerId = await upsertPlayer(db, counters, player);
            roster.push({ playerId, teamId });
          }
        }

        await reconcileMemberships(db, counters, seenTeamIds, roster);
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
        for (const match of [...running, ...upcoming, ...past]) {
          await upsertMatch(db, counters, match, game);
        }
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
