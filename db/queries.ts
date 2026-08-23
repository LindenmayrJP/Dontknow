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
  image_url: string | null;
  dark_mode_image_url: string | null;
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

export async function listTeams(games: Game[], limit = 60) {
  const { rows } = await getPool().query<TeamSummary>(
    `SELECT t.id, t.name, t.acronym, t.game, o.name AS org_name, o.region,
            t.image_url, t.dark_mode_image_url,
            count(m.id)::int AS roster_size
       FROM teams t
       JOIN organizations o ON o.id = t.organization_id
       LEFT JOIN team_memberships m ON m.team_id = t.id AND m.left_at IS NULL
      WHERE t.game = ANY($1::text[])
      GROUP BY t.id, t.name, t.acronym, t.game, o.name, o.region
      -- times com roster conhecido primeiro: são os úteis para navegar
      ORDER BY count(m.id) DESC, t.name
      LIMIT $2`,
    [games, limit]
  );
  return rows;
}

export async function getTeam(id: number) {
  const { rows } = await getPool().query<
    TeamSummary & { slug: string | null; pandascore_id: number | null }
  >(
    `SELECT t.id, t.name, t.acronym, t.game, t.slug, t.pandascore_id,
            t.image_url, t.dark_mode_image_url,
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

export type ResultadoTime = TeamSummary & { partidas: number };
export type ResultadoJogador = PlayerSummary & {
  image_url: string | null;
  team_acronym: string | null;
};

export type SearchResults = {
  teams: ResultadoTime[];
  players: ResultadoJogador[];
};

/**
 * Busca por nome de time ou jogador. ILIKE simples: o volume atual
 * (centenas de linhas) não justifica full-text search ainda.
 *
 * **Não filtra por jogo, de propósito.** A busca é a porta de entrada da
 * wiki inteira, e é justamente entre jogos que mora a ambiguidade que
 * ela precisa resolver: "FURIA Esports" existe em LoL e em Valorant com
 * `pandascore_id` diferente, mesmo nome e mesma sigla. Esconder um dos
 * dois faria a busca mentir sobre o que o banco tem. Quem consome os
 * resultados mostra o jogo em cada linha (ver `app/busca`).
 */
export async function search(
  term: string,
  limitePorTipo = 25
): Promise<SearchResults> {
  const like = `%${term.trim()}%`;
  const pool = getPool();

  const teams = await pool.query<ResultadoTime>(
    `SELECT t.id, t.name, t.acronym, t.game, o.name AS org_name, o.region,
            t.image_url, t.dark_mode_image_url,
            count(DISTINCT m.id)::int AS roster_size,
            -- Quantas partidas o time tem: separa a entidade principal da
            -- homônima inativa quando nome e sigla não bastam.
            (SELECT count(*) FROM matches x
              WHERE x.team_a_id = t.id OR x.team_b_id = t.id)::int AS partidas
       FROM teams t
       JOIN organizations o ON o.id = t.organization_id
       LEFT JOIN team_memberships m ON m.team_id = t.id AND m.left_at IS NULL
      WHERE t.name ILIKE $1 OR t.acronym ILIKE $1 OR o.name ILIKE $1
      GROUP BY t.id, t.name, t.acronym, t.game, o.name, o.region
      ORDER BY (lower(t.name) = lower($2)) DESC,
               count(DISTINCT m.id) DESC,
               t.name
      LIMIT $3`,
    [like, term.trim(), limitePorTipo]
  );

  const players = await pool.query<ResultadoJogador>(
    `SELECT p.id, p.name, p.role, p.nationality, p.image_url,
            t.id AS team_id, t.name AS team_name, t.acronym AS team_acronym,
            t.game
       FROM players p
       LEFT JOIN team_memberships m ON m.player_id = p.id AND m.left_at IS NULL
       LEFT JOIN teams t ON t.id = m.team_id
      WHERE p.name ILIKE $1
      -- Jogador com time ativo antes do avulso: a tabela de players tem
      -- muito nome de coleção antiga sem vínculo nenhum.
      ORDER BY (lower(p.name) = lower($2)) DESC,
               (t.id IS NOT NULL) DESC,
               p.name
      LIMIT $3`,
    [like, term.trim(), limitePorTipo]
  );

  return { teams: teams.rows, players: players.rows };
}

export type AmostraAvatar = {
  id: number;
  name: string;
  acronym: string | null;
  image_url: string | null;
  dark_mode_image_url: string | null;
};

/**
 * Amostras reais para o showcase do sistema de design: times e jogadores
 * com e sem imagem, para conferir os dois estados do Avatar com dado de
 * verdade em vez de exemplo inventado.
 */
export async function getAmostrasAvatar() {
  const pool = getPool();

  const times = await pool.query<AmostraAvatar>(
    `(SELECT id, name, acronym, image_url, dark_mode_image_url
        FROM teams WHERE dark_mode_image_url IS NOT NULL
       ORDER BY id LIMIT 3)
     UNION ALL
     (SELECT id, name, acronym, image_url, dark_mode_image_url
        FROM teams WHERE image_url IS NOT NULL AND dark_mode_image_url IS NULL
       ORDER BY id LIMIT 2)`
  );

  const semImagem = await pool.query<AmostraAvatar>(
    `SELECT id, name, acronym, image_url, dark_mode_image_url
       FROM teams WHERE image_url IS NULL
      ORDER BY id LIMIT 3`
  );

  // Caso limite: logo desenhado para fundo claro e sem variante dark na
  // origem. É o único que precisa da faixa clara atrás.
  const lightmode = await pool.query<AmostraAvatar>(
    `SELECT id, name, acronym, image_url, dark_mode_image_url
       FROM teams
      WHERE image_url LIKE '%lightmode%' AND dark_mode_image_url IS NULL
      ORDER BY id LIMIT 2`
  );

  const jogadoresComFoto = await pool.query<AmostraAvatar>(
    `SELECT id, name, NULL AS acronym, image_url, NULL AS dark_mode_image_url
       FROM players WHERE image_url IS NOT NULL ORDER BY id LIMIT 3`
  );

  const jogadoresSemFoto = await pool.query<AmostraAvatar>(
    `SELECT id, name, NULL AS acronym, image_url, NULL AS dark_mode_image_url
       FROM players WHERE image_url IS NULL ORDER BY id LIMIT 3`
  );

  const cobertura = await pool.query<{
    times: number; times_com: number; times_dark: number;
    jogadores: number; jogadores_com: number;
  }>(
    `SELECT (SELECT count(*) FROM teams)::int AS times,
            (SELECT count(image_url) FROM teams)::int AS times_com,
            (SELECT count(dark_mode_image_url) FROM teams)::int AS times_dark,
            (SELECT count(*) FROM players)::int AS jogadores,
            (SELECT count(image_url) FROM players)::int AS jogadores_com`
  );

  return {
    timesComLogo: times.rows,
    timesSemLogo: semImagem.rows,
    timesLightmode: lightmode.rows,
    jogadoresComFoto: jogadoresComFoto.rows,
    jogadoresSemFoto: jogadoresSemFoto.rows,
    cobertura: cobertura.rows[0],
  };
}

/**
 * Contagens para a home, restritas aos jogos que a interface mostra.
 *
 * Sem o filtro os números ficariam maiores que tudo que o site deixa
 * navegar — o banco tem LoL sincronizado, mas nenhuma tela para ele.
 */
export async function getStats(games: Game[]) {
  const { rows } = await getPool().query<{
    teams: number; players: number; matches: number; tournaments: number;
  }>(
    `SELECT (SELECT count(*) FROM teams WHERE game = ANY($1::text[]))::int AS teams,
            (SELECT count(DISTINCT p.id)
               FROM players p
               JOIN team_memberships m ON m.player_id = p.id AND m.left_at IS NULL
               JOIN teams t ON t.id = m.team_id
              WHERE t.game = ANY($1::text[]))::int AS players,
            (SELECT count(*)
               FROM matches m JOIN tournaments t ON t.id = m.tournament_id
              WHERE t.game = ANY($1::text[]))::int AS matches,
            (SELECT count(*) FROM tournaments WHERE game = ANY($1::text[]))::int AS tournaments`,
    [games]
  );
  return rows[0];
}

/* ------------------------------------------------------------------ *
 * Home e navegação (Módulo 3.8)
 *
 * Todas as funções abaixo recebem a lista de jogos como parâmetro em vez
 * de filtrar por um jogo fixo. Hoje quem chama passa só Valorant (ver
 * `app/jogos.ts`), mas o SQL não sabe disso — ligar LoL é mexer na lista,
 * não aqui.
 * ------------------------------------------------------------------ */

export type TorneioResumo = {
  id: number;
  name: string;
  game: Game;
  league_name: string | null;
  serie_name: string | null;
  start_date: Date | null;
  end_date: Date | null;
  em_andamento: boolean;
  partidas: number;
  ao_vivo: number;
  encerradas: number;
};

/**
 * Torneios que ainda não acabaram: em andamento primeiro, depois os que
 * estão por começar. É o destaque principal da home.
 */
export async function listTorneiosAtivos(games: Game[], limit = 6) {
  const { rows } = await getPool().query<TorneioResumo>(
    `SELECT t.id, t.name, t.game, t.league_name, t.serie_name,
            t.start_date, t.end_date,
            (t.start_date IS NOT NULL AND t.start_date <= current_date) AS em_andamento,
            count(m.id)::int AS partidas,
            count(m.id) FILTER (WHERE m.status = 'live')::int AS ao_vivo,
            count(m.id) FILTER (WHERE m.status = 'finished')::int AS encerradas
       FROM tournaments t
       LEFT JOIN matches m ON m.tournament_id = t.id
      WHERE t.game = ANY($1::text[])
        AND (t.end_date IS NULL OR t.end_date >= current_date)
      GROUP BY t.id
      ORDER BY (t.start_date IS NOT NULL AND t.start_date <= current_date) DESC,
               t.start_date NULLS LAST
      LIMIT $2`,
    [games, limit]
  );
  return rows;
}

export type PartidaResumo = MatchRow & {
  game: Game;
  tournament_id: number;
  team_a_acronym: string | null;
  team_b_acronym: string | null;
  team_a_image: string | null;
  team_a_dark_image: string | null;
  team_b_image: string | null;
  team_b_dark_image: string | null;
};

/** Recorte temporal de partida. A home usa os três. */
export type SituacaoPartida = "ao-vivo" | "recentes" | "proximas";

const FILTRO_PARTIDA: Record<SituacaoPartida, { where: string; order: string }> = {
  "ao-vivo": { where: `m.status = 'live'`, order: `m.scheduled_at ASC NULLS LAST` },
  // `scheduled_at` no passado, não `status`: partida encerrada é o normal,
  // mas a fonte às vezes demora a virar o status de uma que já acabou.
  recentes: {
    where: `m.status = 'finished'`,
    order: `m.scheduled_at DESC NULLS LAST`,
  },
  proximas: {
    where: `m.status = 'scheduled' AND m.scheduled_at >= now()`,
    order: `m.scheduled_at ASC NULLS LAST`,
  },
};

export async function listPartidas(
  games: Game[],
  situacao: SituacaoPartida,
  limit = 8
) {
  const { where, order } = FILTRO_PARTIDA[situacao];
  const { rows } = await getPool().query<PartidaResumo>(
    `SELECT m.id, m.scheduled_at, m.status, m.team_a_id, m.team_b_id,
            a.name AS team_a_name, b.name AS team_b_name,
            a.acronym AS team_a_acronym, b.acronym AS team_b_acronym,
            a.image_url AS team_a_image, a.dark_mode_image_url AS team_a_dark_image,
            b.image_url AS team_b_image, b.dark_mode_image_url AS team_b_dark_image,
            m.team_a_score, m.team_b_score, m.winner_team_id,
            t.name AS tournament_name, t.id AS tournament_id, t.game
       FROM matches m
       JOIN teams a ON a.id = m.team_a_id
       JOIN teams b ON b.id = m.team_b_id
       JOIN tournaments t ON t.id = m.tournament_id
      WHERE t.game = ANY($1::text[]) AND ${where}
      ORDER BY ${order}
      LIMIT $2`,
    [games, limit]
  );
  return rows;
}

export type TimeDestaque = TeamSummary & {
  image_url: string | null;
  dark_mode_image_url: string | null;
  partidas_no_periodo: number;
};

/**
 * "Em destaque" com o dado que realmente temos: os times que mais
 * aparecem em torneios ainda abertos. Não é curadoria nem popularidade
 * — é quem está jogando agora, que é o que faz sentido oferecer como
 * atalho na home.
 */
export async function listTimesEmDestaque(games: Game[], limit = 8) {
  const { rows } = await getPool().query<TimeDestaque>(
    `SELECT t.id, t.name, t.acronym, t.game, t.image_url, t.dark_mode_image_url,
            o.name AS org_name, o.region,
            count(DISTINCT mem.id)::int AS roster_size,
            count(DISTINCT m.id)::int AS partidas_no_periodo
       FROM matches m
       JOIN tournaments tr ON tr.id = m.tournament_id
       JOIN teams t ON t.id IN (m.team_a_id, m.team_b_id)
       JOIN organizations o ON o.id = t.organization_id
       LEFT JOIN team_memberships mem
              ON mem.team_id = t.id AND mem.left_at IS NULL
      WHERE tr.game = ANY($1::text[])
        AND (tr.end_date IS NULL OR tr.end_date >= current_date)
      GROUP BY t.id, o.name, o.region
      ORDER BY count(DISTINCT m.id) DESC, t.name
      LIMIT $2`,
    [games, limit]
  );
  return rows;
}

export type JogadorResumo = PlayerSummary & {
  image_url: string | null;
  team_acronym: string | null;
};

/**
 * Jogadores com vínculo ativo em um time dos jogos habilitados.
 *
 * O recorte por vínculo é deliberado: a tabela `players` tem milhares de
 * nomes vindos de coleções antigas da fonte, muitos sem time nenhum.
 * Listar todos encheria a página de gente que o usuário não reconhece.
 */
export async function listJogadores(games: Game[], limit = 60) {
  const { rows } = await getPool().query<JogadorResumo>(
    `SELECT p.id, p.name, p.role, p.nationality, p.image_url,
            t.id AS team_id, t.name AS team_name, t.acronym AS team_acronym, t.game
       FROM players p
       JOIN team_memberships m ON m.player_id = p.id AND m.left_at IS NULL
       JOIN teams t ON t.id = m.team_id
      WHERE t.game = ANY($1::text[])
      ORDER BY t.name, p.name
      LIMIT $2`,
    [games, limit]
  );
  return rows;
}
