# Estado atual do projeto

Este arquivo é complementar ao `contexto-projeto.md` (visão estática do
produto). Aqui fica o que **já aconteceu de fato**: decisões técnicas
tomadas, o que já roda, e o que está pendente. Cole este arquivo junto
com o `contexto-projeto.md` no início de cada sessão do Claude Code —
evita repetir decisões já tomadas ou reabrir problema já resolvido.

Atualize este arquivo ao final de cada módulo.

---

## Módulos concluídos

- **Módulo 0** — Fundação técnica: Next.js + Postgres (driver `pg`, sem
  ORM), estrutura de pastas (`app/`, `worker/`, `db/`).
- **Módulo 1** — Schema inicial da wiki (Organization, Team, Player,
  Tournament, Match) + seed fictício de teste.
- **Módulo 2** — Worker de ingestão (PandaScore + Riot), rate limiter,
  retry com backoff. Reescrito depois para upsert em lote (ver
  "Decisões técnicas" abaixo).
- **Módulo 3** — Páginas de wiki (time, jogador, busca), lendo só do
  banco. Rotas `/`, `/times/[id]`, `/jogadores/[id]`, `/busca`.
- **Módulo 3.5** — Auditoria de dados (API PandaScore x banco), escopo
  Valorant. `npm run audit:pandascore` gera `auditoria-pandascore.md` e
  salva as respostas cruas em `db/api-samples/`.
- **Módulo 3.6** — Chaveamento, classificação e catálogo estático (ver
  seção própria abaixo).
- **Banco migrado para Neon** (Postgres gerenciado, região
  `us-east-2`/Ohio). `Iniciar.bat` sobe o site local automaticamente
  (checa Node/`.env`, instala dependências, roda migrations, abre
  `localhost:3000`, sincroniza em segundo plano).

## Módulos em andamento / próximos

- **Módulo 4** — Live tracker (ainda não iniciado).

## O que o Módulo 3.6 entregou

Migration `0004_brackets_standings_catalog.sql`. Escopo Valorant.

- **`tournament_standings`** — classificação por torneio
  (`tournament_id`, `team_id`, `rank`, `last_match_pandascore_id`). A
  origem só dá rank/time/última partida: **não há vitórias, derrotas nem
  pontos** no tier gratuito, por isso a tabela é magra de propósito.
- **`match_bracket_edges`** — topologia do chaveamento, com `edge_type`
  (`winner`/`loser`) distinguindo chave superior da inferior. Chaveada
  por `pandascore_id`, não por FK — ver "Decisões técnicas".
- **`tournaments.has_bracket`** — evita chamar `/brackets` em torneio que
  a origem já diz não ter chave.
- **Catálogo estático**: `valorant_maps` (13), `valorant_agents` (29),
  `valorant_weapons` (21), `valorant_abilities` (116). Comando próprio
  **`npm run sync:catalog`**, fora do `npm run sync`.
- Chaveamento e classificação entraram no `npm run sync`, depois do
  PandaScore. Falha ali não derruba a sync: a wiki já foi gravada.
- `PANDASCORE_BRACKET_TOURNAMENTS` (default 15) limita quantos torneios
  recentes são varridos — são 2 chamadas de API por torneio.

**Não havia bug de rota a corrigir no worker.** As rotas erradas
apontadas pelo Módulo 3.5 nunca foram usadas pelo `sync.ts` — a
auditoria as descobriu ao explorar a API. Os métodos novos
(`listMatchesByTournament`, `getStandings`, `getBrackets`) já nasceram
com as rotas certas, e cada um carrega em comentário o porquê.

Estado do banco após a sync: 206 arestas de chaveamento (173 com partida
resolvida, 33 de partidas ainda "TBD"), 100 linhas de classificação,
179 registros de catálogo.

## Decisões técnicas importantes

- **Upsert em lote, não linha a linha.** O Módulo 2 original fazia um
  upsert por linha (~14.000 queries sequenciais). Contra o Neon (161ms
  de latência por query), isso levava 37 minutos por sync. Reescrito
  para upsert em lote via `unnest` (uma query por tabela): 37min → 18s.
  Isso vale como padrão pra qualquer sync futura — nunca fazer loop de
  query individual contra um banco remoto.
- **Constraint `UNIQUE(organization_id, game)` removida** (migration
  0003). Estava errada: o PandaScore tem organizações de mesmo nome com
  times distintos no mesmo jogo, e a constraint fazia um time
  sobrescrever o outro silenciosamente. A identidade real de upsert é
  `pandascore_id`.
- **Chaveamento é chaveado por id externo, não por FK** (migration
  0004). As partidas que mais importam numa chave (semifinal, final) são
  "TBD vs TBD" enquanto não se sabe quem avança, e não cabem em
  `matches`, que exige os dois times. Medido: com FK, 10 de 10 arestas
  de um torneio em andamento seriam descartadas. `match_bracket_edges`
  guarda os `pandascore_id` e resolve `match_id`/`previous_match_id`
  **quando** a partida existir.
- **Partidas de `/brackets` não trazem o objeto `tournament`,** só
  `tournament_id`. Por isso `upsertMatches` aceita um
  `tournamentIdPadrao` — sem ele, todas eram descartadas pelo filtro.
  Efeito colateral bom: partidas ignoradas na sync caíram de 318 → 178.
- **`db:clean-seed`** existe pra remover o seed fictício do Módulo 1
  sem tocar em dado real. Já foi rodado — o banco atual (Neon) não tem
  dado fictício, só dado real da sync.
- **Sync cobre hoje só LoL e Valorant.** Times como FURIA e MIBR
  aparecem no banco com suas linhas de LoL/Valorant, não CS:GO — CS:GO
  não é sincronizado (fora do MVP definido em `contexto-projeto.md`).
  Chaveamento, classificação e catálogo são **só Valorant**.
- **Spectator-V4 → V5.** A V4 da Riot foi descontinuada; o worker usa
  V5 por padrão (recebe `puuid` em vez de `summonerId`). Variável
  `RIOT_SPECTATOR_VERSION=v4` no `.env` reverte, se necessário.

## Pendências conhecidas

- **`RIOT_API_KEY` vazia.** Status "em partida agora" (TrackedPlayerStatus)
  fica indisponível até gerar uma chave em developer.riotgames.com. A
  sync detecta isso, avisa, e segue rodando só com PandaScore — não
  trava o resto do pipeline.
- **Reservas misturadas no roster.** O PandaScore não distingue titular
  de reserva no tier gratuito — times vêm com 8 a 13 jogadores em
  `players`. Frontend deve listar o roster completo sem tentar inferir
  titularidade.
- **Habilidades não têm vínculo com agente na origem.** Nenhum campo
  liga as duas coleções (`ability_type` só diz o slot). Por isso
  `valorant_abilities` não tem FK para `valorant_agents`. Ligar as duas
  exigiria fonte externa ou mapeamento manual — decisão em aberto.
  "Astral Form" vem com `ability_type` nulo da própria API.
- **Nada de frontend consome ainda** chaveamento, classificação nem
  catálogo — as tabelas estão populadas, mas não há tela usando.
- **`npm run sync` passou de ~18s para ~62s** com chaveamento e
  classificação: são 2 chamadas de API sequenciais por torneio, contra
  15 torneios. Reduzir `PANDASCORE_BRACKET_TOURNAMENTS` encurta.
- **Estatística de player segue bloqueada** (403, plano pago). Fora do
  MVP por decisão do Módulo 3.6 — não desenhar schema nem sync pra isso.
- **Idade e tempo de carreira do jogador** ficaram fora do schema por
  decisão do Módulo 3.6 (cobertura baixa / campo inexistente na origem).
  `birthday` e `age` existem na API se um dia forem reconsiderados.
- **Times com nome ambíguo.** Busca por nome (ex: `search[name]=FURIA`)
  retorna múltiplas entidades (FURIA Esports, FURIA Academy — MIBR tem
  quatro variações), cada uma com `pandascore_id` próprio. Frontend de
  busca precisa lidar com isso, não assumir nome único = time único.
  Time com 0 jogadores no roster é estado real da origem, não falha de
  ingestão.

## Cuidados de segurança já observados

- Chave do PandaScore e senha do Neon já passaram por conversas de
  chat em algum momento. Ambas estão só no `.env`, confirmado no
  `.gitignore`. Considerar regenerar por precaução.
