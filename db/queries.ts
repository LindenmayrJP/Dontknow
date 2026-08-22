import { getPool } from "./pool";

/**
 * Queries da camada de wiki. Tudo aqui lê SÓ do Postgres — o frontend
 * nunca fala com PandaScore ou Riot. O worker (`npm run sync`) é o único
 * que toca nas APIs externas.
 */

export type Game = "lol" | "valorant";

export const GAME_LABEL: Record<Game, string> = {
  lol: "League of Legends",
  valorant: "Valorant",
};

export type TeamSummary = {
  id: number;
  name: string;
  acronym: string | null;
  game: Game;
  org_name: string;
  region: string | null;
  roster_size: number;
};

export type PlayerSummary = {
  id: number;
  name: string;
  role: string | null;
  nationality: string | null;
  team_id: number | null;
  team_name: string | null;
  game: Game | null;
};

export type MatchRow = {
  id: number;
  scheduled_at: Date | null;
  status: "scheduled" | "live" | "finished";
  team_a_id: number;
  team_b_id: number;
  team_a_name: string;
  team_b_name: string;
  team_a_score: number | null;
  team_b_score: number | null;
  winner_team_id: number | null;
  tournament_name: string;
};

export type TrackedStatus = {
  puuid: string;
  riot_id: string;
  in_game: boolean;
  current_game_mode: string | null;
  current_game_queue_id: number | null;
  current_game_champion_id: number | null;
  current_game_started_at: Date | null;
  summoner_level: number | null;
  updated_at: Date;
};

export async function listTeams(game?: Game, limit = 60) {
  const { rows } = await getPool().query<TeamSummary>(
    `SELECT t.id, t.name, t.acronym, t.game, o.name AS org_name, o.region,
            count(m.id)::int AS roster_size
       FROM teams t
       JOIN organizations o ON o.id = t.organization_id
       LEFT JOIN team_memberships m ON m.team_id = t.id AND m.left_at IS NULL
      WHERE ($1::text IS NULL OR t.game = $1)
      GROUP BY t.id, t.name, t.acronym, t.game, o.name, o.region
      -- times com roster conhecido primeiro: são os úteis para navegar
      ORDER BY count(m.id) DESC, t.name
      LIMIT $2`,
    [game ?? null, limit]
  );
  return rows;
}

export async function getTeam(id: number) {
  const { rows } = await getPool().query<
    TeamSummary & { slug: string | null; pandascore_id: number | null }
  >(
    `SELECT t.id, t.name, t.acronym, t.game, t.slug, t.pandascore_id,
            o.name AS org_name, o.region, 0 AS roster_size
       FROM teams t
       JOIN organizations o ON o.id = t.organization_id
      WHERE t.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function getTeamRoster(teamId: number) {
  const { rows } = await getPool().query<
    PlayerSummary & { joined_at: Date }
  >(
    `SELECT p.id, p.name, p.role, p.nationality, m.joined_at,
            t.id AS team_id, t.name AS team_name, t.game
       FROM team_memberships m
       JOIN players p ON p.id = m.player_id
       JOIN teams t ON t.id = m.team_id
      WHERE m.team_id = $1 AND m.left_at IS NULL
      ORDER BY p.name`,
    [teamId]
  );
  return rows;
}

export async function getTeamMatches(teamId: number) {
  const { rows } = await getPool().query<MatchRow>(
    `SELECT m.id, m.scheduled_at, m.status, m.team_a_id, m.team_b_id,
            a.name AS team_a_name, b.name AS team_b_name,
            m.team_a_score, m.team_b_score, m.winner_team_id,
            t.name AS tournament_name
       FROM matches m
       JOIN teams a ON a.id = m.team_a_id
       JOIN teams b ON b.id = m.team_b_id
       JOIN tournaments t ON t.id = m.tournament_id
      WHERE m.team_a_id = $1 OR m.team_b_id = $1
      ORDER BY m.scheduled_at DESC NULLS LAST
      LIMIT 40`,
    [teamId]
  );
  return rows;
}

export async function getPlayer(id: number) {
  const { rows } = await getPool().query<{
    id: number;
    name: string;
    role: string | null;
    nationality: string | null;
    riot_id: string | null;
  }>(
    `SELECT id, name, role, nationality, riot_id FROM players WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

/** Vínculos do jogador, ativo primeiro — é o histórico de transferências. */
export async function getPlayerMemberships(playerId: number) {
  const { rows } = await getPool().query<{
    team_id: number;
    team_name: string;
    game: Game;
    org_name: string;
    joined_at: Date;
    left_at: Date | null;
  }>(
    `SELECT t.id AS team_id, t.name AS team_name, t.game, o.name AS org_name,
            m.joined_at, m.left_at
       FROM team_memberships m
       JOIN teams t ON t.id = m.team_id
       JOIN organizations o ON o.id = t.organization_id
      WHERE m.player_id = $1
      ORDER BY (m.left_at IS NULL) DESC, m.joined_at DESC`,
    [playerId]
  );
  return rows;
}

/** Status ao vivo vindo do worker Riot. Null quando o jogador não é rastreado. */
export async function getTrackedStatus(playerId: number) {
  const { rows } = await getPool().query<TrackedStatus>(
    `SELECT puuid, riot_id, in_game, current_game_mode, current_game_queue_id,
            current_game_champion_id, current_game_started_at, summoner_level,
            updated_at
       FROM tracked_player_status
      WHERE player_id = $1
      LIMIT 1`,
    [playerId]
  );
  return rows[0] ?? null;
}

export type SearchResults = {
  teams: TeamSummary[];
  players: PlayerSummary[];
};

/**
 * Busca por nome de time ou jogador. ILIKE simples: o volume atual
 * (centenas de linhas) não justifica full-text search ainda.
 */
export async function search(term: string): Promise<SearchResults> {
  const like = `%${term.trim()}%`;
  const pool = getPool();

  const teams = await pool.query<TeamSummary>(
    `SELECT t.id, t.name, t.acronym, t.game, o.name AS org_name, o.region,
            count(m.id)::int AS roster_size
       FROM teams t
       JOIN organizations o ON o.id = t.organization_id
       LEFT JOIN team_memberships m ON m.team_id = t.id AND m.left_at IS NULL
      WHERE t.name ILIKE $1 OR t.acronym ILIKE $1 OR o.name ILIKE $1
      GROUP BY t.id, t.name, t.acronym, t.game, o.name, o.region
      ORDER BY (lower(t.name) = lower($2)) DESC, count(m.id) DESC, t.name
      LIMIT 25`,
    [like, term.trim()]
  );

  const players = await pool.query<PlayerSummary>(
    `SELECT p.id, p.name, p.role, p.nationality,
            t.id AS team_id, t.name AS team_name, t.game
       FROM players p
       LEFT JOIN team_memberships m ON m.player_id = p.id AND m.left_at IS NULL
       LEFT JOIN teams t ON t.id = m.team_id
      WHERE p.name ILIKE $1
      ORDER BY (lower(p.name) = lower($2)) DESC, p.name
      LIMIT 25`,
    [like, term.trim()]
  );

  return { teams: teams.rows, players: players.rows };
}

/** Contagens para a home. */
export async function getStats() {
  const { rows } = await getPool().query<{
    teams: number; players: number; matches: number; tournaments: number;
  }>(
    `SELECT (SELECT count(*) FROM teams)::int AS teams,
            (SELECT count(*) FROM players)::int AS players,
            (SELECT count(*) FROM matches)::int AS matches,
            (SELECT count(*) FROM tournaments)::int AS tournaments`
  );
  return rows[0];
}
