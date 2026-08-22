# Prompts por módulo

Use cada bloco abaixo como prompt inicial pro Copilot/Gemini, na ordem.
Sempre cole o `contexto-projeto.md` junto no início da sessão de cada
módulo, mesmo que o assistente já tenha visto antes — evita ele perder o
fio da arquitetura (banco como fonte de verdade, não API direto no
frontend).

---

## Módulo 0 — Fundação técnica

```
Contexto: [colar contexto-projeto.md]

Preciso da base técnica do projeto. Configure:
- Projeto Next.js (TypeScript)
- Conexão com Postgres usando o driver nativo (`pg`), sem ORM — queries SQL
  diretas
- Estrutura de pastas separando: frontend (app/), worker de ingestão
  (worker/), schema de banco (db/ com os arquivos .sql de migration)
- Sistema de variáveis de ambiente (.env) para: chave PandaScore, chave
  Riot, string de conexão do banco
- Não crie nenhuma tabela ainda, só a infraestrutura de conexão

Critério de pronto: rodar `npm run dev` sobe o Next.js sem erro, e existe
um script separado que consegue conectar no banco e imprimir "conectado"
no console.
```

---

## Módulo 1 — Schema da wiki

```
Contexto: [colar contexto-projeto.md]

Crie o schema do banco (SQL puro, com migrations versionadas em arquivos
.sql) para a camada de wiki, cobrindo LoL e Valorant na mesma estrutura:
- Organization (nome, região)
- Team (pertence a uma Organization, tem um campo `game` = "lol" | "valorant")
- Player (nome, riot_id/puuid, pertence a um Team em um momento — considere
  histórico de transferência simples, tipo tabela de vínculo com data)
- Tournament (nome, jogo, datas)
- Match (torneio, times, data, resultado)

Depois de criar o schema e rodar a migration, escreva um script de seed
que insira manualmente uns 5 times de LoL e 5 de Valorant reais (pode
pegar nome/roster de organizações conhecidas) só para eu ter dado de
teste enquanto o Módulo 2 não está pronto.

Critério de pronto: tabelas criadas no banco, seed roda sem erro, consigo
ver os dados inseridos com uma query simples.
```

---

## Módulo 2 — Ingestão via API (PandaScore + Riot)

```
Contexto: [colar contexto-projeto.md]

Crie o worker de ingestão. Dois clientes de API separados:

1. Cliente PandaScore: busca calendário, resultados e dados de contexto
   (times, rosters, torneios) de LoL e Valorant, e grava/atualiza nas
   tabelas Organization, Team, Player, Tournament, Match do Módulo 1.
   Respeite o limite de 1000 req/hora — implemente um rate limiter simples.

2. Cliente Riot: recebe uma lista de Riot IDs (jogadores que eu quero
   rastrear) de um arquivo de config, e busca puuid, dados de
   summoner/conta e estado de partida ao vivo (Spectator-V4) pra cada um.
   Grave o resultado numa tabela nova `TrackedPlayerStatus` (puuid, em
   partida: sim/não, dados da partida atual se houver, atualizado_em).

Empacote os dois num único comando `npm run sync` que roda ambos em
sequência e loga quantos registros foram atualizados. Isso precisa rodar
rápido porque, até eu conseguir a chave pessoal da Riot, a chave de dev
expira em 24h.

Critério de pronto: `npm run sync` roda do zero e popula o banco real com
dado do PandaScore e do Riot, sem eu precisar tocar em nada manualmente.
```

---

## Módulo 3 — Páginas de wiki

```
Contexto: [colar contexto-projeto.md]

Crie o frontend da camada de wiki, lendo só do banco (nunca chamando
PandaScore ou Riot diretamente do frontend):
- Página de time: nome, organização, jogo, roster atual, últimos resultados
- Página de jogador: nome, time atual, histórico de times (se houver),
  status de "em partida agora" (vindo de TrackedPlayerStatus, se existir)
- Busca simples por nome de time ou jogador

Critério de pronto: consigo navegar entre as 3 telas usando o dado que o
Módulo 2 já colocou no banco, sem nenhuma chamada de API externa no
carregamento da página.
```

---

## Módulo 3.5 — Auditoria de dados

```
Contexto: [colar contexto-projeto.md]

Antes de seguir pro live tracker, preciso enxergar tudo que a API do
PandaScore devolve versus tudo que o banco hoje guarda — descobrimos que
times como FURIA e MIBR têm mais dado na API do que aparece no site, e
quero decidir de propósito o que vale a pena capturar.

Escopo desta auditoria: **somente Valorant** por enquanto. Outros jogos
entram em rodadas futuras conforme o produto evoluir.

Categorias a verificar (uma seção do relatório por categoria):
1. Campeonatos (`/valorant/leagues`, `/valorant/tournaments`)
2. Partidas de campeonato (`/valorant/matches`,
   `/valorant/tournaments/{id}/matches`)
3. Histórico de partidas (`/valorant/matches/past`,
   `/players/{id}/tournaments`)
4. Tabelas de campeonato — playoffs, playins, group phase
   (`/tournaments/{id}/standings`, `/tournaments/{id}/brackets`)
5. Times (`/valorant/teams`)
6. Players profissionais dos times (roster dentro do objeto de time,
   `/valorant/players`)
7. Coach dos times — **verificar se o objeto de time/roster distingue
   algum `role: "coach"` ou se esse dado simplesmente não existe na API**
8. Dados estatísticos de player: K/D/A, tempo de partida, últimos jogos
   (`/valorant/players/{id}/stats`,
   `/valorant/matches/{id}/players/stats`,
   `/valorant/tournaments/{id}/players/{id}/stats`) — note que "filtrar
   últimos jogos" não é um parâmetro pronto da API, então documente como
   os dados vêm fatiados (por partida/série/torneio) pra decidirmos como
   agregar no nosso banco
9. Idade do jogador — **verificar se existe campo `birthday` ou
   equivalente no objeto player**
10. Tempo de carreira do jogador — **verificar se existe algum campo
    direto; se não existir, documente isso explicitamente, pois
    provavelmente vai precisar ser calculado a partir do histórico de
    torneios, não é um campo pronto**
11. Mapas (`/valorant/maps`) — dado estático de jogo
12. Agentes (`/valorant/agents`) — dado estático de jogo
13. Armas (`/valorant/weapons`) — dado estático de jogo
14. Habilidades (`/valorant/abilities`) — dado estático de jogo

Crie um script (`npm run audit:pandascore` ou nome parecido) que:
1. Busca, pra uma amostra pequena de cada categoria acima (times: inclua
   FURIA e MIBR; demais categorias: 3 a 5 registros), a resposta crua e
   completa da API do PandaScore, sem nenhum filtro
2. Salva essas respostas cruas em arquivos JSON de exemplo (ex:
   `db/api-samples/valorant-teams.json`, `db/api-samples/valorant-maps.json`,
   etc.) pra consulta futura
3. Compara os campos que vêm na resposta da API com as colunas que
   existem hoje nas tabelas (Organization, Team, Player, Tournament,
   Match) e gera um relatório simples (Markdown ou console), organizado
   por categoria, listando:
   - Campo da API
   - Se está capturado hoje no schema (sim/não)
   - Em qual tabela/coluna, se estiver
   - Pra coach, idade e tempo de carreira (itens 7, 9 e 10): declare
     explicitamente se o campo existe ou não na resposta da API, mesmo
     que a resposta seja "não existe"

Distinga no relatório dado estático (mapas, agentes, armas, habilidades
— muda só quando a Riot lança patch, sync raro) de dado dinâmico
(campeonatos, partidas, times, stats — muda toda semana, sync frequente)
— isso vai orientar como separamos as rotinas do worker depois.

Não decida sozinho quais campos adicionar ao schema — só levante o que
existe e está sendo descartado. Eu decido depois quais entram numa
migration nova.

Critério de pronto: rodo o script e recebo um relatório por categoria,
cobrindo as 14 áreas listadas acima, pra eu revisar e decidir o que
adicionar antes do Módulo 4.
```

---

## Módulo 3.6 — Correções de worker e catálogo estático

```
Leia contexto-projeto.md e estado-atual.md na raiz do projeto antes de
começar — cobrem decisões já tomadas e achados da auditoria do Módulo
3.5, incluindo bugs de rota específicos que este módulo corrige.

Escopo: só Valorant, como o resto do projeto até aqui.

**Decisões já tomadas — não reabrir estas perguntas:**
- Estatísticas de player (K/D/A) ficam fora do MVP (bloqueadas por
  plano pago). Não desenhe schema nem sync pra isso.
- Coach não existe na API. Não desenhe schema pra isso.
- Idade do jogador não entra no schema agora (cobertura baixa).
- Tempo de carreira do jogador fica pra um módulo futuro.

**O que fazer:**

1. Corrija os bugs de rota encontrados na auditoria:
   - Trocar `/valorant/tournaments/{id}/matches` por
     `/valorant/matches?filter[tournament_id]=X`
   - Standings e brackets não levam prefixo de jogo:
     `/tournaments/{id}/standings`, `/tournaments/{id}/brackets`
   - Tratar 404 em standings como "torneio sem tabela" (não é erro,
     não deve gerar log de falha nem interromper a sync)

2. Adicione suporte a chaveamento de torneio:
   - Nova tabela (ou extensão de Match) pra guardar a relação
     `previous_matches` (type: winner/loser + match_id) vinda de
     `/tournaments/{id}/brackets`
   - Adicione também a captura de standings (classificação) quando
     disponível

3. Adicione sync do catálogo estático de Valorant — rotina separada da
   sync dinâmica (roda raramente, só quando algo mudar, não a cada
   execução do `npm run sync`):
   - Mapas (`/valorant/maps`)
   - Agentes (`/valorant/agents`)
   - Armas (`/valorant/weapons`)
   - Habilidades (`/valorant/abilities` — precisa paginação, 116
     registros). Documente no schema que não há vínculo direto entre
     habilidade e agente na origem.

4. Ao final, atualize o estado-atual.md: marque essas pendências como
   resolvidas e registre o que foi implementado.

Critério de pronto: `npm run sync` roda sem os bugs de rota
identificados, standings/brackets ficam salvos no banco quando
disponíveis na origem, e existe um comando separado (ex:
`npm run sync:catalog`) que popula mapas/agentes/armas/habilidades.
```

---

## Módulo 3.7 — Design system + padrão "em desenvolvimento"

```
Leia contexto-projeto.md e estado-atual.md na raiz do projeto antes de
começar.

Referência visual: sites como vlr.gg e tracker.gg — tema escuro, denso
em dado (tabelas, cards de estatística, hierarquia visual clara entre
dado primário e secundário), tipografia condensada pra números, uso de
cor de destaque (accent) pontual, não decorativo.

Crie a fundação visual do site, reutilizável em todas as páginas
futuras:
1. Tema escuro como padrão (definir paleta: fundo, superfície de card,
   texto primário/secundário, cor de destaque, cores de estado —
   sucesso/erro/aviso)
2. Tipografia: uma fonte pra texto corrido, uma condensada/monoespaçada
   pra números e estatísticas
3. Componentes base reutilizáveis: card, tabela de dado, badge/tag
   (ex: nome de jogo, status de torneio), avatar de time/jogador com
   fallback quando não houver imagem
4. **Componente "em desenvolvimento"**: um componente padrão pra
   qualquer campo/seção cujo dado não está disponível hoje (stats de
   player, coach, tempo de carreira — ver estado-atual.md pra lista
   completa). Não deve parecer erro nem espaço vazio — deve comunicar
   claramente "isso está no roadmap", de forma visualmente consistente
   em toda a wiki
5. Grid/spacing consistente, responsivo (funciona em mobile)

Não crie páginas de conteúdo ainda — só o sistema de design e os
componentes base, aplicados numa página de exemplo/showcase pra eu
revisar antes de seguir pros módulos seguintes.

Critério de pronto: existe uma página de showcase (ex: `/design-system`)
mostrando todos os componentes base, incluindo o componente "em
desenvolvimento", com o tema escuro aplicado.
```

---

## Módulo 3.8 — Estrutura de navegação + home page

```
Leia contexto-projeto.md e estado-atual.md na raiz do projeto antes de
começar. Use os componentes do Módulo 3.7 (design system).

Crie a navegação principal do site e a home page:
1. Header fixo com: logo/nome do site, busca em destaque (funcionalidade
   de busca vem no Módulo 3.9 — por enquanto, só o campo visual, mesmo
   que não funcional ainda), navegação pra: Times, Jogadores,
   Campeonatos, Ao vivo (link pro Módulo 4, pode ficar desabilitado/
   "em breve" por enquanto)
2. Home page com:
   - Destaque de campeonatos em andamento ou próximos (lendo do banco)
   - Últimos resultados de partida
   - Atalho pra times/jogadores em destaque, se fizer sentido com o
     dado que já temos
3. Estrutura pensada pra multi-jogo desde já: a navegação e os
   componentes não devem ter "Valorant" hardcoded onde não precisar —
   está tudo filtrado por Valorant agora porque é o único jogo
   habilitado no frontend, não porque o código assume um jogo só

Critério de pronto: `npm run dev` mostra a home com navegação funcional
entre as seções (mesmo que algumas páginas ainda não existam/estejam
vazias), usando o tema do Módulo 3.7.
```

---

## Módulo 3.9 — Busca global

```
Leia contexto-projeto.md e estado-atual.md na raiz do projeto antes de
começar.

Implemente a busca do campo criado no Módulo 3.8:
1. Busca por nome de time ou jogador, consultando o banco (nunca a API
   externa)
2. Resultado deve lidar com nome ambíguo — lembre que times como FURIA
   têm múltiplas entidades (FURIA Esports, FURIA Academy) com
   `pandascore_id` diferentes (ver estado-atual.md). Mostrar jogo e,
   se der, algum diferenciador (ex: acronym) pra deixar claro que são
   times distintos
3. Resultado em dropdown/painel ao digitar (busca incremental), não
   precisa ser página de resultado separada, a menos que fique melhor
   assim
4. Se não houver resultado, estado vazio claro (não erro)

Critério de pronto: digitar "furia" na busca mostra as entidades
distintas de FURIA que existem no banco, cada uma navegável pra sua
própria página (mesmo que a página de destino ainda seja básica).
```

---

## Módulo 3.10 — Página de time

```
Leia contexto-projeto.md e estado-atual.md na raiz do projeto antes de
começar. Use os componentes do Módulo 3.7.

Redesenhe/construa a página de time com o design system:
- Cabeçalho: nome, organização, jogo, imagem/avatar (com fallback)
- Roster atual: lista completa de jogadores (lembrar: PandaScore mistura
  titular/reserva, ver estado-atual.md — não tente inferir titularidade,
  liste todos)
- Últimos resultados (partidas)
- Próximas partidas, se houver
- Campos ainda não disponíveis (coach, stats agregadas do time) usam o
  componente "em desenvolvimento" do Módulo 3.7 — não omitir a seção,
  mostrar que está no roadmap

Critério de pronto: acessar a página de um time real do banco (ex:
FURIA Esports) mostra o layout completo com dado real, sem quebrar
quando algum campo opcional estiver ausente.
```

---

## Módulo 3.11 — Página de jogador

```
Leia contexto-projeto.md e estado-atual.md na raiz do projeto antes de
começar. Use os componentes do Módulo 3.7.

Redesenhe/construa a página de jogador com o design system:
- Cabeçalho: nome, time atual, jogo, avatar (com fallback)
- Histórico de times, se houver mais de um vínculo
- Idade: mostrar quando o dado existir no banco (birthday/age não estão
  sendo capturados por decisão do projeto — ver contexto-projeto.md —
  então esse campo deve usar o componente "em desenvolvimento" por
  enquanto, não tentar buscar o dado)
- Tempo de carreira: componente "em desenvolvimento" (adiado, ver
  estado-atual.md)
- Estatísticas (K/D/A etc.): componente "em desenvolvimento" (fora do
  MVP, ver contexto-projeto.md)
- Status "em partida agora": mostrar se TrackedPlayerStatus tiver dado
  pro jogador, senão omitir a seção (não é uma feature ausente, é
  simplesmente não aplicável a esse jogador se ele não é rastreado)

Critério de pronto: acessar a página de um jogador real do banco mostra
o layout completo, com os campos indisponíveis claramente marcados como
"em desenvolvimento" em vez de aparecerem vazios ou quebrados.
```

---

## Módulo 3.12 — Página de campeonato

```
Leia contexto-projeto.md e estado-atual.md na raiz do projeto antes de
começar. Use os componentes do Módulo 3.7. Depende do Módulo 3.6
(standings e brackets precisam estar no banco).

Crie a página de campeonato/torneio:
- Cabeçalho: nome, jogo, datas, formato se disponível
- Calendário de partidas do torneio (passadas e futuras)
- Tabela de classificação (standings), quando existir pra esse torneio
  — lembrar que nem todo torneio tem (ver estado-atual.md), tratar
  ausência como estado normal, não erro
- Chaveamento (brackets) visual, reconstruído a partir da relação
  `previous_matches` (winner/loser) salva no Módulo 3.6 — represente
  como árvore de eliminação visual, distinguindo upper/lower bracket
  quando aplicável

Critério de pronto: acessar a página de um torneio real do banco mostra
calendário e, quando disponível na origem, standings e chaveamento
visual corretos.
```

---

## Módulo 3.13 — Páginas de catálogo do jogo

```
Leia contexto-projeto.md e estado-atual.md na raiz do projeto antes de
começar. Depende do Módulo 3.6 (catálogo estático precisa estar no
banco: mapas, agentes, armas, habilidades).

Crie páginas de referência do jogo (Valorant), navegáveis a partir do
menu principal:
- Lista de mapas, com página individual por mapa
- Lista de agentes, com página individual por agente
- Lista de armas, com página individual por arma
- Lista de habilidades — lembrar que não há vínculo direto entre
  habilidade e agente na origem (ver estado-atual.md), então não tente
  agrupar habilidade por agente a menos que consiga inferir isso de
  outra forma; se não der, liste habilidades separadamente com seu
  `ability_type` (slot)

Essas páginas são dado estático (não mudam com frequência) — pode usar
geração estática/cache mais agressivo do que as páginas de time/jogador.

Critério de pronto: consigo navegar pelas 4 listas e abrir páginas
individuais, com dado real vindo do banco.
```

---

## Módulo 4 — Live tracker

```
Contexto: [colar contexto-projeto.md]

Crie a página "ao vivo agora", listando todos os jogadores de
TrackedPlayerStatus que estão em partida no momento, com atualização
periódica (polling a cada X segundos consultando o banco, não a API
externa direto).

Mostre: nome do jogador, time, campeão/agente (se disponível no dado do
Spectator-V4), tempo de partida.

Critério de pronto: a tela reflete o estado salvo no banco e atualiza
sozinha sem precisar recarregar a página manualmente.
```
