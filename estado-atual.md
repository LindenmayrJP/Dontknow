# Estado atual do projeto

Este arquivo é complementar ao `contexto-projeto.md` (visão estática do
produto). Aqui fica o que **já aconteceu de fato**: decisões técnicas
tomadas, o que já roda, e o que está pendente. Cole este arquivo junto
com o `contexto-projeto.md` no início de cada sessão do Claude Code —
evita repetir decisões já tomadas ou reabrir problema já resolvido.

Atualize este arquivo ao final de cada módulo. Evite editar manualmente
enquanto uma sessão do Claude Code estiver rodando — edição concorrente
já causou o arquivo parecer "revertido" no meio de uma sessão.

---

## Módulos concluídos

- **Módulo 0** — Fundação técnica: Next.js + Postgres (driver `pg`, sem
  ORM), estrutura de pastas (`app/`, `worker/`, `db/`).
- **Módulo 1** — Schema inicial da wiki (Organization, Team, Player,
  Tournament, Match) + seed fictício de teste.
- **Módulo 2** — Worker de ingestão (PandaScore + Riot), rate limiter,
  retry com backoff. Reescrito depois para upsert em lote (ver
  "Decisões técnicas" abaixo).
- **Banco migrado para Neon** (Postgres gerenciado, região
  `us-east-2`/Ohio). `Iniciar.bat` sobe o site local automaticamente
  (checa Node/`.env`, instala dependências, roda migrations, abre
  `localhost:3000`, sincroniza em segundo plano).
- **Módulo 3** — Páginas de wiki, versão inicial (frontend lendo só do
  banco). Rodada antes da auditoria; será redesenhada pelos módulos 3.10
  e 3.11 com o design system novo.
- **Módulo 3.5** — Auditoria de dados (API PandaScore x banco, escopo
  Valorant). Gerou `auditoria-pandascore.md` (582 linhas) e 18 amostras
  cruas em `db/api-samples/`. Achados principais:
  - Coach: **não existe na API**, confirmado em 100 jogadores. Decisão:
    fora do escopo do produto, não é limitação temporária.
  - `role` do jogador vem `null` em 100% dos casos em Valorant — isso é
    esperado (Valorant não tem posição estruturada no PandaScore, ao
    contrário de LoL com top/mid/adc), não é bug.
  - Idade (`birthday`/`age`): existe na API, cobertura ~27% em rosters
    de times ativos (4% na coleção geral, que é dominada por jogadores
    obscuros). Decisão: não adicionar ao schema agora, esperar cobertura
    melhorar.
  - Tempo de carreira: não vem como campo pronto, precisaria ser
    derivado da partida/torneio mais antigo do jogador
    (`/players/{id}/matches` ou `/players/{id}/tournaments`, ambos
    acessíveis). Decisão: adiado pra módulo futuro.
  - Estatísticas de player (K/D/A, tempo de partida): os 4 endpoints
    retornam **403 Access Denied** — chave válida, resto responde 200,
    é restrição de plano (tier gratuito não inclui). Decisão: ficar no
    tier gratuito, stats fora do MVP por agora.
  - Chaveamento (brackets) é reconstruível via `/tournaments/{id}/brackets`,
    campo `previous_matches` (`type: "winner"|"loser"` + `match_id`).
  - Duas rotas fogem do padrão de prefixo de jogo: standings e brackets
    são `/tournaments/{id}/...`, não `/valorant/tournaments/{id}/...`.
    `/valorant/tournaments/{id}/matches` não existe — o filtro correto é
    `/valorant/matches?filter[tournament_id]=X`. **Importante**: essas
    rotas nunca estiveram erradas no worker (o cliente só chamava
    `/valorant/teams`, `/valorant/tournaments` e
    `/valorant/matches/past|upcoming|running`) — foram descobertas pela
    auditoria explorando a API, não eram bug em código nosso. Os métodos
    do Módulo 3.6 já nasceram com as rotas certas.
  - 404 em standings é esperado (torneio sem tabela), não erro.
  - Catálogo estático de Valorant: mapas (13), agentes (29), armas (21),
    habilidades (116, precisa paginação). Habilidades não têm vínculo
    direto com agente na API (`ability_type` só indica o slot).
  - Busca por nome retorna múltiplas entidades (`FURIA Esports` e
    `FURIA Academy`; MIBR tem 4 variações), cada uma com `pandascore_id`
    próprio. Time com 0 jogadores no roster é estado real da origem, não
    falha de ingestão.
- **Módulo 3.6** — Correções de worker e catálogo estático.
  - Migration 0004: `tournament_standings` (a origem só dá rank/time/
    última partida, sem vitórias/pontos no tier gratuito),
    `match_bracket_edges` (topologia da chave, winner/loser separando
    bracket superior do inferior), `tournaments.has_bracket` (evita
    chamada inútil), catálogo estático (`valorant_maps`,
    `valorant_agents`, `valorant_weapons`, `valorant_abilities`).
  - Novo comando `npm run sync:catalog` (~5,5s), separado do `npm run
    sync`, como planejado — dado estático não precisa sincronizar toda
    execução.
  - Achado durante implementação: partidas vindas de `/brackets` não
    trazem o objeto `tournament`, só `tournament_id` — o filtro de
    `upsertMatches` exigia o objeto e descartava todas as arestas.
    Corrigido com `tournamentIdPadrao`; efeito colateral bom: partidas
    ignoradas na sync caíram de 318 para 178.
  - Achado durante implementação: partidas "TBD vs TBD" (chave ainda não
    definida) não cabem em `matches` (exige os dois times definidos).
    `match_bracket_edges` foi refeita pra chavear por `pandascore_id` em
    vez de FK resolvido, resolvendo a FK depois quando a partida
    existir. Sem isso, um torneio em andamento perderia 10 de 10
    arestas; com a correção, 173 resolvidas + 33 que teriam sido
    perdidas.
  - Verificação: 15 checagens passando (catálogo com contagem exata,
    ranks sem buraco, winner/loser presentes, escopo restrito a
    Valorant, topologia reconstruindo corretamente — final recebe
    winner da upper final, lower final recebe loser dela). Segunda sync:
    0 criados em todas as tabelas.
  - Custo: `npm run sync` passou de ~18s pra ~62s (2 chamadas
    sequenciais por torneio, contra 15 torneios). `PANDASCORE_BRACKET_TOURNAMENTS`
    no `.env` permite encurtar o volume. Vale monitorar se o tempo
    crescer mais quando o volume de torneios aumentar.
  - Nenhuma tela consome esses dados ainda (standings/brackets/catálogo
    populados no banco, mas não exibidos) — isso é trabalho dos módulos
    3.12 (campeonato) e 3.13 (catálogo).
- **Módulo 3.7** — Design system + componente "em desenvolvimento".
  - Tokens em `app/globals.css`: 4 níveis de superfície, 3 de hierarquia
    de texto, cor de destaque, cores de estado (sucesso/aviso/erro),
    cores de jogo, escala de espaçamento de 4px.
  - Tipografia (`app/fonts.ts`, via `next/font/google`): Inter pra texto
    corrido, Barlow Semi Condensed pra números — servido do próprio
    domínio, mantém a regra de zero requisição externa. Atenção: `next/font`
    exige rede no momento do build (não em runtime).
  - Componentes em `app/ui/`: `Card`, `Stat`, `Secao`, `DataTable`
    (colunas tipadas, alinhamento numérico à direita com fonte
    tabular), `Tag`/`TagJogo`/`TagStatus`, `Avatar` (iniciais com cor
    derivada do nome — o fallback; a imagem real veio no Módulo 3.7.5).
  - Componente "em desenvolvimento" tem **três motivos distintos**, não
    um genérico: "Em breve" (azul, ex: chaveamento — dado já existe,
    falta só a tela), "Bloqueado" (âmbar, ex: stats — existe na API mas
    exige plano pago), "Sem dado na fonte" (cinza, ex: coach — nunca vai
    existir). Catálogo `LACUNAS` centraliza o texto de cada uma das 10
    lacunas conhecidas. Existe também versão de uma linha pra célula de
    tabela. Estado vazio (busca sem resultado) é um componente separado
    do de lacuna (dado não implementado) — são UX diferentes.
  - `Badge` e `GameTag` religados como apelidos de `Avatar` e `TagJogo`
    pra evitar dois sistemas em paralelo enquanto o Módulo 3 antigo
    (que usa esses nomes) não é migrado.
  - Verificado com browser headless: fontes aplicadas, fundo
    `rgb(11,13,18)`, zero requisição externa, sem overflow horizontal em
    1280px/375px, sem erro de console, contraste WCAG ok (pior caso
    3,89:1, acima do mínimo de 3 — mas vale checar visualmente se está
    confortável de ler, não só tecnicamente aprovado).
  - Páginas do Módulo 3 (home, busca, time, jogador) herdaram o tema e
    continuam funcionando, mas ainda usam markup próprio em vez de
    `Card`/`DataTable` — migrar é trabalho dos módulos 3.10/3.11.
  - Showcase em `/design-system`, revisão visual pendente de aprovação
    do usuário antes de seguir pros módulos de conteúdo.

- **Módulo 3.7.5** — Logos e fotos (times e jogadores).
  - **A premissa do módulo estava errada, e isso foi confirmado antes de
    mexer em nada**: `teams.image_url` e `players.image_url` já existiam
    desde a migration 0002 e o worker **já as gravava**. Não havia coluna
    nem upsert a criar. O que de fato faltava era a variante de fundo
    escuro e o uso no frontend.
  - Migration `0005_dark_mode_logo.sql`: `teams.dark_mode_image_url`. A
    `image_url` padrão da fonte vem em três sabores visíveis no nome do
    arquivo — `_allmode` (serve nos dois temas), `_lightmode` (marca
    escura, some no nosso fundo escuro) e alguns sem sufixo. Para os
    `_lightmode` a API oferece `dark_mode_image_url`.
  - `logoDeTime()` prefere a variante dark e cai na padrão. Quando nem
    isso existe, o `Avatar` detecta `_lightmode` pelo nome do arquivo e
    desenha uma faixa clara atrás — heurística, é a única pista da fonte.
  - `Avatar` aceita `imagemUrl`. As iniciais são desenhadas **atrás** da
    imagem: se o arquivo sumir do CDN o fallback reaparece sozinho, sem
    JavaScript e sem virar client component.
  - `next.config.ts` restringe `remotePatterns` ao CDN do PandaScore. O
    navegador nunca fala com o CDN — o otimizador do Next busca no
    servidor e serve de `/_next/image`, no nosso domínio. Mantém a regra
    de zero requisição externa em runtime e evita baixar um PNG de 800px
    pra desenhar um avatar de 38px (verificado: ~1KB por imagem servida).
  - `/design-system` mostra os quatro estados lado a lado com dado real
    do banco — time com logo, time sem logo, jogador com foto, jogador
    sem foto — mais o caso limite do `_lightmode`.
  - **Cobertura real medida no banco (não é 100%, e o fallback é o
    caminho principal para jogador):**

    | Recorte | Com imagem |
    | --- | --- |
    | times | 715/804 (88,9%) |
    | times — LoL | 414/427 (97,0%) |
    | times — Valorant | 301/377 (79,8%) |
    | times com `dark_mode_image_url` | 261/804 (32,5%) |
    | jogadores | 406/1968 (20,6%) |

  - Verificação do critério de pronto: rodar a sync com o banco já cheio
    não prova nada (os valores só continuam lá). Então 5 times e 5
    jogadores tiveram `image_url` zerado à força; depois de `npm run
    sync`, **10 de 10 voltaram preenchidos**, inclusive 2 com
    `dark_mode_image_url`, e a cobertura global voltou exatamente aos
    mesmos números — o worker de fato grava o campo.

- **Módulo 3.8** — Navegação principal + home page.
  - **`app/jogos.ts` é a peça central**: `JOGOS_HABILITADOS` é a única
    linha que decide quais jogos o frontend mostra. As queries recebem
    essa lista como parâmetro (`game = ANY($1)`) em vez de terem o jogo
    escrito dentro; nenhuma tela menciona "Valorant" fora de dado vindo
    do banco. Ligar LoL é acrescentar `"lol"` à lista.
  - **Isso foi testado, não presumido**: com `["valorant", "lol"]` a home
    passou de 377 pra 804 times, de 324 pra 738 partidas, e as tags de
    LoL apareceram — sem tocar em nenhum outro arquivo. O teste também
    pegou o único ponto que teria mentido: o `<h1>` estava cravado em
    "Valorant, do elenco ao placar", virou "Do elenco ao placar", com o
    recorte dito no subtítulo via `rotuloDoRecorte()`. A `description` do
    layout saiu de texto fixo pela mesma razão.
  - Cabeçalho: logo, `NavPrincipal` e busca. A nav é client component só
    por causa do `usePathname` (estado ativo); o resto continua no
    servidor. Seção ativa marcada por fundo + `aria-current`, não só por
    cor. `/times/123` mantém "Times" aceso (`startsWith`).
  - Seções: Times, Jogadores, Campeonatos, Ao vivo. As quatro páginas
    existem — nenhum link morto na navegação. "Ao vivo" leva o selo
    "em breve" e a página mostra as partidas com status `live` do banco
    mais o bloco `EmDesenvolvimento` explicando que tempo real é o
    Módulo 4. Melhor que um item desabilitado.
  - Home: destaque de campeonatos (com barra de progresso = partidas
    encerradas sobre o total, o único sinal de andamento que o tier
    gratuito dá), últimos resultados, próximas partidas, times em
    destaque e contagens. A seção "Ao vivo agora" **só renderiza quando
    há partida rolando** — uma seção vazia a maior parte do dia treina o
    usuário a ignorá-la.
  - "Times em destaque" não é curadoria: são os times com mais partidas
    em torneios ainda abertos. É o que o dado sustenta.
  - A home antiga era a listagem de times; ela virou `/times`. Novas
    queries: `listTorneiosAtivos`, `listPartidas` (um filtro para
    ao-vivo/recentes/próximas), `listTimesEmDestaque`, `listJogadores`.
    `listTeams` e `getStats` passaram a receber a lista de jogos — os
    números da home agora batem com o que o site deixa navegar (377
    times, não 804).
  - `TeamSummary` ganhou `image_url`/`dark_mode_image_url`, então as
    listagens e as linhas de partida mostram escudo real (30 imagens na
    home), reaproveitando o Módulo 3.7.5.
  - A busca do cabeçalho **já funciona** — o prompt do módulo previa só
    o campo visual, mas `/busca` existe desde o Módulo 3 e o `SearchBox`
    aponta pra lá. O Módulo 3.9 melhora a busca, não a liga do zero.
  - Verificado: `tsc --noEmit` e `eslint` limpos; as 7 rotas respondem
    200 sem erro de runtime. **Não houve conferência visual em browser**
    — não há headless instalado no projeto, então layout em 1280px/375px
    e contraste seguem sem checagem desta vez.

- **Módulo 3.9** — Busca global (melhoria do que já existia).
  - A busca **não foi criada aqui**: `/busca`, `search()` e o campo no
    header existem desde o Módulo 3, e o 3.8 já tinha trocado os cartões
    de resultado por `Avatar` com logo real. Este módulo acrescentou o
    painel incremental, o tratamento de homônimos e o estado vazio.
  - **Painel incremental** (`app/ui/busca-rapida.tsx`, client): debounce
    de 180ms, `AbortController` cancelando a requisição anterior (sem
    isso a resposta de "fur" pode chegar depois da de "furia" e
    sobrescrever o resultado certo), navegação por setas com Enter e
    Escape, clique fora fecha. Continua sendo um `<form>` apontando pra
    `/busca`: sem JavaScript, ou com Enter antes de o painel abrir, a
    página responde igual. O painel é atalho, não substituto.
  - Nova rota `app/api/busca/route.ts`, 5 resultados por tipo, sem cache.
    A consulta só dispara com o painel aberto — chegar em `/busca?q=x`
    não gasta uma query a mais pra preencher campo que ninguém vê.
  - **`search()` não filtra por jogo, de propósito** (decisão nova). É
    justamente entre jogos que mora a ambiguidade: "FURIA Esports"
    existe em LoL e em Valorant, mesmo nome, mesma sigla (FUR), mesma
    região, `pandascore_id` diferente. Filtrar esconderia metade do
    problema que a busca precisa resolver. Difere de propósito do
    `getStats` do 3.8, que filtra — lá o número descreve o que dá pra
    navegar, aqui a busca é a porta da wiki inteira.
  - **Homônimos**: a query passou a devolver contagem de partidas, e a
    tela detecta nomes repetidos no resultado. Quando há repetição, a
    linha de apoio (sigla · região · elenco · partidas) sobe de
    `--text-3` pra `--text-2` em negrito — deixa de ser decoração e vira
    o que separa uma entidade da outra — e um aviso explica que são
    entidades distintas na fonte, não duplicata.
  - **`EstadoVazio`** (`app/ui/estado-vazio.tsx`): o Módulo 3.7 tinha
    desenhado o estado vazio como a classe `.empty` aplicada à mão em 17
    lugares, sem componente. Virou componente com título, explicação e
    atalhos de saída. Segue distinto de `EmDesenvolvimento` — verificado
    que a busca sem resultado não renderiza nenhum `roadmap`. A showcase
    do 3.7 passou a usar o componente em vez do markup solto.
  - `SearchBox` do Módulo 3 foi removido; `BuscaRapida` ocupa o lugar.
  - Verificado: `tsc` e `eslint` limpos; 9 rotas em 200. `q=furia` →
    as 2 entidades (LoL 5 partidas, Valorant 7), cada uma linkando pra
    sua página. `q=mibr` → 4 entidades (MIBR, MIBR GC, MIBR LOS em
    Valorant; MIBR.LOS em LoL). `q=zzzqqq` → estado vazio, sem erro.
    **O comportamento interativo do painel (debounce, setas, clique
    fora) não foi testado em browser** — segue sem headless no projeto.
  - **Cuidado registrado**: crase dentro de template literal quebrou o
    `queries.ts` (um comentário SQL com `` `players` `` fechou a
    string). Comentário dentro de SQL em template literal não pode ter
    crase.

## Módulos em andamento / próximos

- **Módulo 3.10 em diante** — páginas de time e jogador redesenhadas,
  página de campeonato, catálogo do jogo. Ver `prompts-modulos.md` pra
  prompts completos.
- **Módulo 4** — Live tracker. Reposicionado pro final da sequência de
  frontend (era o próximo depois do worker; agora vem depois de toda a
  base de site estar pronta).

## Decisões de escopo (não reabrir estas perguntas)

- **Frontend foca só em Valorant por enquanto.** O worker continua
  sincronizando LoL e Valorant nos bastidores — nada foi descartado. A
  interface é construída primeiro só pra Valorant, de forma genérica o
  suficiente pra "ligar" LoL depois sem reconstruir telas.
- **Coach**: não existe na API, fora do escopo permanentemente.
- **Estatísticas de player (K/D/A)**: bloqueadas por plano pago, fora
  do MVP. Reavaliar só se decidir migrar de plano.
- **Idade do jogador**: existe na API, cobertura baixa, não entra no
  schema por agora.
- **Tempo de carreira do jogador**: não vem pronto, precisa ser
  calculado; adiado pra módulo futuro.
- **`dark_mode_image_url` fica** (avaliado e confirmado em 2026-08-23).
  Chegou-se a considerar manter só `image_url` por simplicidade. A
  medição no banco derrubou a ideia: dos 715 times com logo, **159 são
  `_lightmode`** (marca desenhada escura) e **138 desses só são legíveis
  por causa da variante dark**. Sem ela, os times com logo ilegível sobre
  o nosso fundo escuro iriam de 21 para 159.
  A regra "só usar se o design system precisar de logo otimizado pra
  fundo escuro" **já está atendida** — o tema é escuro (`rgb(11,13,18)`)
  desde o Módulo 3.7. Além disso o custo é afundado, não futuro: coluna
  criada, populada, gravada pelo worker e verificada; o helper inteiro é
  `time.dark_mode_image_url ?? time.image_url ?? null`. Remover seria
  apagar código que funciona.

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
- **`db:clean-seed`** existe pra remover o seed fictício do Módulo 1
  sem tocar em dado real. Já foi rodado — o banco atual (Neon) não tem
  dado fictício, só dado real da sync.
- **Sync cobre hoje só LoL e Valorant.** Times como FURIA e MIBR
  aparecem no banco com suas linhas de LoL/Valorant, não CS:GO — CS:GO
  não é sincronizado (fora do MVP definido em `contexto-projeto.md`).
- **Spectator-V4 → V5.** A V4 da Riot foi descontinuada; o worker usa
  V5 por padrão (recebe `puuid` em vez de `summonerId`). Variável
  `RIOT_SPECTATOR_VERSION=v4` no `.env` reverte, se necessário.
- **Migration 0004 já foi revertida e reaplicada uma vez** durante o
  Módulo 3.6, corrigida antes de empilhar uma 0005 — histórico de
  migrations ficou limpo.

## Pendências conhecidas

- **`RIOT_API_KEY` vazia.** Status "em partida agora" (TrackedPlayerStatus)
  fica indisponível até gerar uma chave em developer.riotgames.com. A
  sync detecta isso, avisa, e segue rodando só com PandaScore — não
  trava o resto do pipeline.
- **Reservas misturadas no roster.** O PandaScore não distingue titular
  de reserva no tier gratuito — times vêm com 8 a 13 jogadores em
  `players`. Frontend deve listar o roster completo sem tentar inferir
  titularidade.
- **`PANDASCORE_MAX_PAGES=3` limita o acervo, e isso aparece na busca.**
  A auditoria do 3.5 achou `FURIA Esports` **e** `FURIA Academy` na API,
  mas o banco de hoje só tem duas linhas de FURIA — a de LoL e a de
  Valorant, ambas `FURIA Esports`. `FURIA Academy` nunca foi
  sincronizada: a sync lê 3 páginas por coleção. Quem for avaliar a
  busca por homônimos com FURIA vai ver 2 resultados, não 3. O caso
  farto no banco atual é **MIBR**, com 4 entidades (MIBR, MIBR GC e
  MIBR LOS em Valorant, MIBR.LOS em LoL). Aumentar o teto amplia o
  acervo ao custo de sync mais longa.
- **Cobertura de imagem é parcial e assim vai continuar.** 88,9% dos
  times têm logo, mas só 20,6% dos jogadores têm foto — é limite da
  fonte, não falha de ingestão. Qualquer tela que mostre jogador precisa
  tratar o fallback de iniciais como caso comum, não como exceção.
- **Tempo de sync subiu de ~18s pra ~62s** depois do Módulo 3.6 (2
  chamadas sequenciais por torneio × 15 torneios). Aceitável agora;
  monitorar se crescer mais com volume maior de torneios.

## Cuidados de segurança já observados

- Chave do PandaScore e senha do Neon já passaram por conversas de
  chat em mais de uma ocasião. Ambas estão só no `.env`, confirmado no
  `.gitignore`. Considerar regenerar por precaução.
