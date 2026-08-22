-- Camada de wiki: organizações, times, jogadores, torneios e partidas.
-- Cobre LoL e Valorant na mesma estrutura via coluna `game`.

CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  region TEXT
);

CREATE TABLE teams (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  game TEXT NOT NULL CHECK (game IN ('lol', 'valorant')),
  name TEXT NOT NULL,
  UNIQUE (organization_id, game)
);

CREATE TABLE players (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  riot_id TEXT UNIQUE,
  puuid TEXT UNIQUE
);

-- Histórico de vínculo jogador-time: uma linha por passagem em um time.
-- left_at NULL = vínculo atual.
CREATE TABLE team_memberships (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  joined_at DATE NOT NULL,
  left_at DATE,
  CHECK (left_at IS NULL OR left_at >= joined_at)
);

-- Garante no máximo um vínculo aberto (left_at NULL) por jogador.
CREATE UNIQUE INDEX team_memberships_one_active_per_player
  ON team_memberships (player_id)
  WHERE left_at IS NULL;

CREATE TABLE tournaments (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  game TEXT NOT NULL CHECK (game IN ('lol', 'valorant')),
  start_date DATE,
  end_date DATE
);

CREATE TABLE matches (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  team_a_id INTEGER NOT NULL REFERENCES teams(id),
  team_b_id INTEGER NOT NULL REFERENCES teams(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  team_a_score INTEGER,
  team_b_score INTEGER,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'finished')),
  CHECK (team_a_id <> team_b_id)
);

CREATE INDEX matches_tournament_id_idx ON matches (tournament_id);
CREATE INDEX team_memberships_team_id_idx ON team_memberships (team_id);
