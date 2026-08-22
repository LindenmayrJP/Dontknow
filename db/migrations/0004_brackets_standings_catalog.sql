-- Módulo 3.6: chaveamento e classificação de torneio, e o catálogo
-- estático de Valorant.

-- Vem do PandaScore e evita chamar /brackets em torneio que não publica
-- chave.
ALTER TABLE tournaments ADD COLUMN has_bracket BOOLEAN;

-- ------------------------------------------------------------------
-- Classificação (standings)
--
-- A origem devolve só rank, time e a última partida. NÃO há vitórias,
-- derrotas, saldo nem pontos no tier gratuito — por isso a tabela é
-- deliberadamente magra. Um torneio sem tabela responde 404, que é
-- estado normal (formato de chave direta), não erro.
-- ------------------------------------------------------------------
CREATE TABLE tournament_standings (
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  -- Guardado como id externo: a partida pode não estar no nosso banco.
  last_match_pandascore_id INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, team_id)
);

CREATE INDEX tournament_standings_rank_idx
  ON tournament_standings (tournament_id, rank);

-- ------------------------------------------------------------------
-- Arestas do chaveamento (brackets)
--
-- "Esta partida recebe o vencedor/perdedor daquela". A informação vem
-- APENAS de /tournaments/{id}/brackets — o endpoint de partidas
-- (/valorant/matches) não devolve `previous_matches`.
-- ------------------------------------------------------------------
-- A chave é identificada por id EXTERNO, não por FK para `matches`.
-- Motivo: as partidas que mais importam numa chave — semifinal, final —
-- ainda são "TBD vs TBD" enquanto não se conhece quem avança, e não
-- cabem em `matches`, que exige os dois times. Chavear por FK descartaria
-- justamente a parte futura do chaveamento (medido: 10 de 10 arestas
-- perdidas num torneio em andamento).
CREATE TABLE match_bracket_edges (
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  match_pandascore_id INTEGER NOT NULL,
  previous_match_pandascore_id INTEGER NOT NULL,
  -- 'winner' = recebe quem ganhou (avanço na chave superior)
  -- 'loser'  = recebe quem perdeu (queda para a chave inferior)
  edge_type TEXT NOT NULL CHECK (edge_type IN ('winner', 'loser')),
  -- Resolvidos quando (e se) a partida existir em `matches`. Ficam nulos
  -- para partidas ainda indefinidas, sem perder a aresta.
  match_id INTEGER REFERENCES matches(id) ON DELETE SET NULL,
  previous_match_id INTEGER REFERENCES matches(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (match_pandascore_id, previous_match_pandascore_id)
);

CREATE INDEX match_bracket_edges_tournament_idx
  ON match_bracket_edges (tournament_id);
CREATE INDEX match_bracket_edges_previous_idx
  ON match_bracket_edges (previous_match_pandascore_id);

-- ------------------------------------------------------------------
-- Catálogo estático de Valorant
--
-- Muda só quando a Riot lança patch, então tem rotina própria
-- (`npm run sync:catalog`), fora do `npm run sync`.
--
-- Prefixo `valorant_` porque o equivalente em LoL é outro domínio
-- (campeões, itens) e não caberia nas mesmas tabelas.
--
-- `videogame_versions` guarda em quais versões do jogo o registro
-- aparece — serve de gatilho para saber que houve patch.
-- ------------------------------------------------------------------
CREATE TABLE valorant_maps (
  pandascore_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT,
  image_url TEXT,
  videogame_versions TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE valorant_agents (
  pandascore_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  portrait_url TEXT,
  videogame_versions TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE valorant_weapons (
  pandascore_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  creds INTEGER,
  image_url TEXT,
  videogame_versions TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ATENÇÃO — NÃO EXISTE VÍNCULO HABILIDADE → AGENTE NA ORIGEM.
--
-- O objeto de habilidade do PandaScore traz apenas id, name,
-- ability_type, creds, videogame_versions e image_url. Não há
-- `agent_id` nem equivalente (verificado nas 116 habilidades, Módulo
-- 3.5). `ability_type` indica só o SLOT (ability_one, ability_two,
-- grenade_ability, ultimate), nunca o dono.
--
-- Por isso não há FK para valorant_agents aqui. Ligar as duas coleções
-- exigiria fonte externa ou mapeamento manual — decisão em aberto.
CREATE TABLE valorant_abilities (
  pandascore_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  ability_type TEXT,
  creds INTEGER,
  image_url TEXT,
  videogame_versions TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
