-- O Módulo 1 assumiu que uma organização tem no máximo um time por jogo.
-- O dado real do PandaScore desmente isso: organizações com o mesmo nome
-- aparecem com times distintos no mesmo jogo (rebrand, academy, duplicata
-- da própria fonte). A constraint forçava sobrescrita silenciosa de um time
-- por outro e, pior, impedia upsert em lote — que é o que torna a sync
-- viável contra um banco remoto (cada round-trip custa ~160ms).
--
-- A identidade real do time é o pandascore_id, que já é UNIQUE.
ALTER TABLE teams DROP CONSTRAINT teams_organization_id_game_key;

-- Mantém a busca por (organização, jogo) rápida, sem exigir unicidade.
CREATE INDEX teams_organization_id_game_idx ON teams (organization_id, game);
