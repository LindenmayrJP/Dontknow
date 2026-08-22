-- Módulo 2: colunas de ID externo (PandaScore) para upsert idempotente,
-- e tabela de status ao vivo dos jogadores rastreados via Riot API.

-- IDs externos: chave de upsert do worker. NULL nas linhas vindas do seed,
-- que são "adotadas" pelo worker na primeira sync em vez de duplicadas.
ALTER TABLE organizations
  ADD COLUMN pandascore_id INTEGER UNIQUE,
  ADD COLUMN slug TEXT;

ALTER TABLE teams
  ADD COLUMN pandascore_id INTEGER UNIQUE,
  ADD COLUMN slug TEXT,
  ADD COLUMN acronym TEXT,
  ADD COLUMN image_url TEXT;

ALTER TABLE players
  ADD COLUMN pandascore_id INTEGER UNIQUE,
  ADD COLUMN slug TEXT,
  ADD COLUMN role TEXT,
  ADD COLUMN nationality TEXT,
  ADD COLUMN image_url TEXT;

ALTER TABLE tournaments
  ADD COLUMN pandascore_id INTEGER UNIQUE,
  ADD COLUMN slug TEXT,
  ADD COLUMN league_name TEXT,
  ADD COLUMN serie_name TEXT;

ALTER TABLE matches
  ADD COLUMN pandascore_id INTEGER UNIQUE,
  ADD COLUMN name TEXT,
  ADD COLUMN number_of_games INTEGER,
  ADD COLUMN winner_team_id INTEGER REFERENCES teams(id),
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- matches.scheduled_at pode vir nulo no PandaScore (partida sem data definida).
ALTER TABLE matches ALTER COLUMN scheduled_at DROP NOT NULL;

CREATE INDEX matches_scheduled_at_idx ON matches (scheduled_at);
CREATE INDEX matches_status_idx ON matches (status);
CREATE INDEX teams_game_idx ON teams (game);

-- Estado ao vivo dos jogadores rastreados (Riot API).
-- Uma linha por puuid, sobrescrita a cada sync.
CREATE TABLE tracked_player_status (
  puuid TEXT PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  riot_id TEXT NOT NULL,
  game_name TEXT NOT NULL,
  tag_line TEXT NOT NULL,
  platform TEXT NOT NULL,
  summoner_id TEXT,
  summoner_level INTEGER,
  profile_icon_id INTEGER,
  in_game BOOLEAN NOT NULL DEFAULT FALSE,
  current_game_id BIGINT,
  current_game_mode TEXT,
  current_game_queue_id INTEGER,
  current_game_champion_id INTEGER,
  current_game_started_at TIMESTAMPTZ,
  current_game JSONB,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tracked_player_status_in_game_idx ON tracked_player_status (in_game);
