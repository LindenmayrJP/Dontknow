# Auditoria PandaScore — Valorant

Gerado por `npm run audit:pandascore` em 22/08/2026, 20:02:22.
Respostas cruas salvas em `db/api-samples/`.

Este relatório **só levanta** o que a API devolve e o que o banco guarda.
Nenhum campo foi adicionado ao schema — a decisão de quais capturar é sua.

## Resumo

- **27 chamadas** à API: 20 com 200, 4 bloqueadas (403), 3 inexistentes (404).
- **Estatística de player é o único bloqueio de plano.** Todo o resto do
  escopo do módulo está acessível no tier gratuito.
- **Idade existe e está sendo descartada** (`birthday`, `age`).
- **Coach não existe na API**, em nenhuma forma.
- **Tempo de carreira não existe** como campo; teria de ser derivado.
- **O chaveamento é reconstruível**: `/tournaments/{id}/brackets` traz
  `previous_matches`, um campo que **não** vem no endpoint de partidas
  que o worker usa hoje (seção 4).
- **Standings e brackets não têm prefixo de jogo** na URL — é
  `/tournaments/{id}/…`, não `/valorant/tournaments/{id}/…`.

### Estático x dinâmico

Separação para orientar as rotinas do worker:

| Tipo | Categorias | Muda quando | Sync sugerida |
| --- | --- | --- | --- |
| **Estático** | Mapas (11), Agentes (12), Armas (13), Habilidades (14) | Patch da Riot | Rara — os quatro trazem `videogame_versions`, que serve de gatilho |
| **Dinâmico** | Campeonatos (1), Partidas (2, 3), Standings/Brackets (4), Times (5), Players (6, 7, 9, 10), Stats (8) | Continuamente | Frequente, como hoje |

> Os quatro estáticos são coleções pequenas e completas em uma página —
> não precisam de paginação nem de filtro incremental.

### Como ler a coluna "Capturado?"

Comparação contra o que `worker/pandascore/sync.ts` grava hoje. "não"
significa que a API devolve o campo e o worker o descarta.

---

## 1. Campeonatos — DINÂMICO

### `GET /valorant/leagues` — HTTP 200

Liga = a competição recorrente (ex: "VCT Americas"). É o nível mais alto:
liga → série (split/temporada) → torneio (fase).

| Campo da API | Tipo | Exemplo | Capturado? | Onde no banco |
| --- | --- | --- | --- | --- |
| `id` | number | 5468 | **não** | — |
| `image_url` | string | https://cdn-api.pandascore.co/images/leagu… | **não** | — |
| `modified_at` | string | 2025-12-09T12:31:32Z | **não** | — |
| `name` | string | CHALLENGERS SHOWDOWN | **não** | — |
| `series` | array<objeto> | 1 item(s) | **não** | — |
| `slug` | string | valorant-challengers-showdown | **não** | — |
| `url` | null | — | **não** | — |
| `videogame` | objeto | { id, name, current_version, slug } | **não** | — |

**8 campos na resposta · 0 capturados · 8 descartados hoje.**

> Nenhum campo de liga é gravado hoje. O worker só aproveita `league.name`
> vindo dentro do objeto de partida, para compor `tournaments.name`.

### `GET /valorant/tournaments` — HTTP 200

| Campo da API | Tipo | Exemplo | Capturado? | Onde no banco |
| --- | --- | --- | --- | --- |
| `begin_at` | string | 2026-09-01T21:00:00Z | sim | tournaments.start_date |
| `country` | string | KR | **não** | — |
| `detailed_stats` | boolean | true | **não** | — |
| `end_at` | string | 2026-09-18T02:00:00Z | sim | tournaments.end_date |
| `expected_roster` | array<objeto> | 8 item(s) | **não** | — |
| `has_bracket` | boolean | true | **não** | — |
| `id` | number | 21721 | sim | tournaments.pandascore_id |
| `league` | objeto | { id, name, url, slug, … } | **não** | — |
| `league_id` | number | 4531 | **não** | — |
| `live_supported` | boolean | false | **não** | — |
| `matches` | array<objeto> | 14 item(s) | **não** | — |
| `modified_at` | string | 2026-08-18T14:47:23Z | **não** | — |
| `name` | string | Playoffs | sim | tournaments.name (prefixado com liga e série) |
| `prizepool` | string | 60000 United States Dollar | **não** | — |
| `region` | string | NA | **não** | — |
| `serie` | objeto | { id, name, year, begin_at, … } | **não** | — |
| `serie_id` | number | 10805 | **não** | — |
| `slug` | string | valorant-vct-2021-north-america-stage-1-ch… | sim | tournaments.slug |
| `teams` | array<objeto> | 8 item(s) | **não** | — |
| `tier` | string | d | **não** | — |
| `type` | string | online/offline | **não** | — |
| `videogame` | objeto | { id, name, slug } | **não** | — |
| `videogame_title` | null | — | **não** | — |
| `winner_id` | null | — | **não** | — |
| `winner_type` | string | Team | **não** | — |

**25 campos na resposta · 5 capturados · 20 descartados hoje.**


---

## 2. Partidas de campeonato — DINÂMICO

### `GET /valorant/matches` — HTTP 200

| Campo da API | Tipo | Exemplo | Capturado? | Onde no banco |
| --- | --- | --- | --- | --- |
| `begin_at` | string | 2026-09-17T21:00:00Z | **não** | — |
| `detailed_stats` | boolean | true | **não** | — |
| `draw` | boolean | false | **não** | — |
| `end_at` | null | — | **não** | — |
| `forfeit` | boolean | false | **não** | — |
| `game_advantage` | null | — | **não** | — |
| `games` | array<objeto> | 5 item(s) | **não** | — |
| `id` | number | 1641335 | sim | matches.pandascore_id |
| `league` | objeto | { id, name, url, slug, … } | sim | tournaments.league_name |
| `league_id` | number | 4531 | **não** | — |
| `live` | objeto | { supported, url, opens_at } | **não** | — |
| `match_type` | string | best_of | **não** | — |
| `modified_at` | string | 2026-08-18T14:47:23Z | **não** | — |
| `name` | string | Grand final: TBD vs TBD | sim | matches.name |
| `number_of_games` | number | 5 | sim | matches.number_of_games |
| `opponents` | array<objeto> | 2 item(s) | sim | matches.team_a_id / team_b_id |
| `original_scheduled_at` | string | 2026-09-17T21:00:00Z | **não** | — |
| `rescheduled` | boolean | false | **não** | — |
| `results` | array<objeto> | 2 item(s) | sim | matches.team_a_score / team_b_score |
| `scheduled_at` | string | 2026-09-17T21:00:00Z | sim | matches.scheduled_at |
| `serie` | objeto | { id, name, year, slug, … } | sim | tournaments.serie_name |
| `serie_id` | number | 10805 | **não** | — |
| `slug` | string | 2026-09-17 | **não** | — |
| `status` | string | not_started | sim | matches.status |
| `streams_list` | array<objeto> | 1 item(s) | **não** | — |
| `tournament` | objeto | { id, name, type, country, … } | sim | matches.tournament_id |
| `tournament_id` | number | 21721 | **não** | — |
| `videogame` | objeto | { id, name, slug } | **não** | — |
| `videogame_title` | null | — | **não** | — |
| `videogame_version` | null | — | **não** | — |
| `winner` | null | — | **não** | — |
| `winner_id` | null | — | sim | matches.winner_team_id |
| `winner_type` | string | Team | **não** | — |

**33 campos na resposta · 11 capturados · 22 descartados hoje.**


### Partidas de um torneio específico

A rota aninhada `/valorant/tournaments/{id}/matches` **não existe** (404
`Route not found`). O caminho correto é filtrar na coleção de partidas:

`GET /valorant/matches?filter[tournament_id]=21721` — HTTP 200, 5 registro(s).

O objeto devolvido é idêntico ao de `/valorant/matches`, então a tabela de
campos acima vale para os dois.

---

## 3. Histórico de partidas — DINÂMICO

### `GET /valorant/matches/past` — HTTP 200

Mesmo objeto de `/valorant/matches`, filtrado para partidas já encerradas.
É o que o worker já usa hoje para popular resultados.

| Campo da API | Tipo | Exemplo | Capturado? | Onde no banco |
| --- | --- | --- | --- | --- |
| `begin_at` | string | 2026-08-22T21:06:45Z | **não** | — |
| `detailed_stats` | boolean | true | **não** | — |
| `draw` | boolean | false | **não** | — |
| `end_at` | string | 2026-08-22T22:44:30Z | **não** | — |
| `forfeit` | boolean | false | **não** | — |
| `game_advantage` | null | — | **não** | — |
| `games` | array<objeto> | 2 item(s) | **não** | — |
| `id` | number | 1616162 | sim | matches.pandascore_id |
| `league` | objeto | { id, name, url, slug, … } | sim | tournaments.league_name |
| `league_id` | number | 4531 | **não** | — |
| `live` | objeto | { supported, url, opens_at } | **não** | — |
| `match_type` | string | best_of | **não** | — |
| `modified_at` | string | 2026-08-22T22:54:54Z | **não** | — |
| `name` | string | Lower bracket round 2 match 1: BST vs G2 | sim | matches.name |
| `number_of_games` | number | 3 | sim | matches.number_of_games |
| `opponents` | array<objeto> | 2 item(s) | sim | matches.team_a_id / team_b_id |
| `original_scheduled_at` | string | 2026-08-22T21:00:00Z | **não** | — |
| `rescheduled` | boolean | false | **não** | — |
| `results` | array<objeto> | 2 item(s) | sim | matches.team_a_score / team_b_score |
| `scheduled_at` | string | 2026-08-22T21:00:00Z | sim | matches.scheduled_at |
| `serie` | objeto | { id, name, year, slug, … } | sim | tournaments.serie_name |
| `serie_id` | number | 10746 | **não** | — |
| `slug` | string | bestia-2026-08-22 | **não** | — |
| `status` | string | finished | sim | matches.status |
| `streams_list` | array<objeto> | 1 item(s) | **não** | — |
| `tournament` | objeto | { id, name, type, country, … } | sim | matches.tournament_id |
| `tournament_id` | number | 21604 | **não** | — |
| `videogame` | objeto | { id, name, slug } | **não** | — |
| `videogame_title` | null | — | **não** | — |
| `videogame_version` | objeto | { name, current } | **não** | — |
| `winner` | objeto | { id, name, location, slug, … } | **não** | — |
| `winner_id` | number | 128538 | sim | matches.winner_team_id |
| `winner_type` | string | Team | **não** | — |

**33 campos na resposta · 11 capturados · 22 descartados hoje.**


### `GET /players/{id}/tournaments` — HTTP 200

Testado com `erin` (id 48506), do time 7VEN STARS.
Retornou **5 torneio(s)**.

Nota: a rota **não** tem prefixo de jogo — é `/players/…`, não
`/valorant/players/…`. Devolve objetos de torneio (mesma forma da seção 1).

### `GET /players/{id}/matches` — HTTP 200

Existe e devolve **3 partida(s)** para o mesmo jogador. Não estava na
lista original do módulo, mas é o caminho natural para "últimos jogos"
sem depender dos endpoints de estatística (bloqueados — ver seção 8).

---

## 4. Tabelas de campeonato (standings / brackets) — DINÂMICO

### `GET /tournaments/{id}/standings` — HTTP 200

**A rota não tem prefixo de jogo.** `/valorant/tournaments/{id}/standings`
devolve 404 `Route not found`; a correta é `/tournaments/{id}/standings`.

**Nem todo torneio tem tabela.** 3 torneio(s) recentes responderam 404
`Record not found` antes de achar um populado (`Playoffs`, id 21570).
Um 404 aqui significa "esse torneio não publica tabela" — provavelmente
formato de chave direta, sem fase de grupos — e não erro de integração.

| Campo da API | Tipo | Exemplo | Capturado? | Onde no banco |
| --- | --- | --- | --- | --- |
| `last_match` | objeto | { id, name, status, live, … } | **não** | — |
| `rank` | number | 1 | **não** | — |
| `team` | objeto | { id, name, location, slug, … } | **não** | — |

**3 campos na resposta · 0 capturados · 3 descartados hoje.**

> Formato: uma linha por time, com `rank` e o objeto `team` aninhado.
> **Nada disso é gravado hoje** — não existe tabela de classificação no schema.

### `GET /tournaments/{id}/brackets` — HTTP 200

Também **sem prefixo de jogo**. Devolveu 12 registro(s) para o torneio 21570.

A resposta é a lista de partidas do torneio, cada uma com a forma completa
de match — **mais um campo que só aparece aqui**: `previous_matches`.

| Campo da API | Tipo | Exemplo | Capturado? | Onde no banco |
| --- | --- | --- | --- | --- |
| `begin_at` | string | 2026-08-22T16:36:28Z | **não** | — |
| `detailed_stats` | boolean | true | **não** | — |
| `draw` | boolean | false | **não** | — |
| `end_at` | string | 2026-08-22T19:28:20Z | **não** | — |
| `forfeit` | boolean | false | **não** | — |
| `game_advantage` | null | — | **não** | — |
| `games` | array<objeto> | 3 item(s) | **não** | — |
| `id` | number | 1608254 | **não** | — |
| `live` | objeto | { supported, url, opens_at } | **não** | — |
| `match_type` | string | best_of | **não** | — |
| `modified_at` | string | 2026-08-22T20:02:22Z | **não** | — |
| `name` | string | Lower bracket round 1 match 2: VIT vs FF | **não** | — |
| `number_of_games` | number | 3 | **não** | — |
| `opponents` | array<objeto> | 2 item(s) | **não** | — |
| `original_scheduled_at` | string | 2026-08-22T18:00:00Z | **não** | — |
| `previous_matches` | array<objeto> | 1 item(s) | **não** | — |
| `results` | array<objeto> | 2 item(s) | **não** | — |
| `scheduled_at` | string | 2026-08-22T16:30:00Z | **não** | — |
| `slug` | string | fire-flux-esports-2026-08-22 | **não** | — |
| `status` | string | finished | **não** | — |
| `streams_list` | array<objeto> | 3 item(s) | **não** | — |
| `tournament_id` | number | 21570 | **não** | — |
| `winner_id` | number | 129194 | **não** | — |
| `winner_type` | string | Team | **não** | — |

**24 campos na resposta · 0 capturados · 24 descartados hoje.**

#### `previous_matches` é a árvore do chaveamento

Este é o achado mais relevante da seção. Cada partida aponta de quais
partidas anteriores vêm seus participantes:

```json
{
  "name": "Lower bracket quarterfinal 2: BBL vs FF",
  "previous_matches": [
    {
      "type": "winner",
      "match_id": 1608254
    },
    {
      "type": "loser",
      "match_id": 1608211
    }
  ]
}
```

`type` é `"winner"` ou `"loser"`, o que distingue **upper e lower
bracket**: uma partida alimentada por um `loser` é da chave inferior.
Com esse campo dá para reconstruir a árvore inteira (quem enfrenta quem,
em que rodada, e para onde vai o perdedor).

> **`previous_matches` NÃO vem em `/valorant/matches`** — conferido nas
> amostras: o campo existe só na resposta de `/brackets`. Ou seja, a
> mesma partida obtida pelo endpoint que o worker já usa chega **sem** a
> informação de chaveamento. É a razão concreta para chamar `/brackets`
> em vez de deduzir a chave dos nomes das partidas.

> Os demais campos aparecem como "não capturados" porque o worker nunca
> chama este endpoint — mas coincidem com os de `match`, e parte deles já
> é gravada quando a mesma partida chega por `/valorant/matches`.

---

## 5. Times — DINÂMICO

### `GET /valorant/teams` — HTTP 200

| Campo da API | Tipo | Exemplo | Capturado? | Onde no banco |
| --- | --- | --- | --- | --- |
| `acronym` | string | USHI | sim | teams.acronym |
| `current_videogame` | objeto | { id, name, slug } | **não** | — |
| `dark_mode_image_url` | string | https://cdn-api.pandascore.co/dark_images/… | **não** | — |
| `id` | number | 139094 | sim | teams.pandascore_id |
| `image_url` | string | https://cdn-api.pandascore.co/images/team/… | sim | teams.image_url |
| `location` | string | BR | sim | organizations.region (só se ainda estiver NULL) |
| `modified_at` | string | 2026-08-11T06:14:05Z | **não** | — |
| `name` | string | Ushiras | sim | teams.name + organizations.name |
| `players` | array<objeto> | 5 item(s) | sim | team_memberships (vínculo jogador↔time) |
| `slug` | string | ushiras | sim | teams.slug |

**10 campos na resposta · 7 capturados · 3 descartados hoje.**


### FURIA e MIBR na API

`search[name]` devolve todas as variações da organização, não só o time
principal — inclusive academy e times femininos, cada um com id próprio:

| Time | id | Jogadores no roster |
| --- | --- | --- |
| FURIA Academy | 136455 | 0 |
| FURIA Esports | 128477 | 6 |
| MIBR LOS | 138884 | 0 |
| MIBR Academy | 136481 | 8 |
| MIBR GC | 131882 | 5 |
| MIBR | 130190 | 5 |

Times com **0 jogadores** existem na API mas vêm sem roster. Isso explica
por que parte dos times aparece no site sem elenco: não é perda na
ingestão, é ausência na origem.

---

## 6. Players profissionais — DINÂMICO

### `GET /valorant/players` — HTTP 200

| Campo da API | Tipo | Exemplo | Capturado? | Onde no banco |
| --- | --- | --- | --- | --- |
| `active` | boolean | true | **não** | — |
| `age` | number | 27 | **não** | — |
| `birthday` | string | 1999-04-06 | **não** | — |
| `current_team` | objeto | { id, name, location, slug, … } | **não** | — |
| `current_videogame` | objeto | { id, name, slug } | **não** | — |
| `first_name` | string | Julia | **não** | — |
| `id` | number | 67471 | sim | players.pandascore_id |
| `image_url` | null | — | sim | players.image_url |
| `last_name` | string | Himpe | **não** | — |
| `modified_at` | string | 2026-08-18T14:08:02Z | **não** | — |
| `name` | string | LittleBigSpy | sim | players.name |
| `nationality` | string | FR | sim | players.nationality |
| `role` | null | — | sim | players.role |
| `slug` | string | littlebigspy | sim | players.slug |

**14 campos na resposta · 6 capturados · 8 descartados hoje.**


### Roster embutido no objeto de time

O array `players` dentro do time traz **quase** o mesmo objeto, faltando
: `current_team`, `current_videogame`.
Ou seja: dá para popular idade, nome real e nacionalidade **sem uma
chamada extra por jogador** — o dado já vem junto do time.

## 7. Coach — DINÂMICO

**Resposta direta: a API não expõe coach em nenhum lugar.**

Evidências, sobre uma amostra de 100 jogadores de Valorant:

- O objeto de time (`/valorant/teams`) tem os campos
  `id`, `name`, `location`, `slug`, `players`, `modified_at`, `acronym`, `image_url`, `dark_mode_image_url`, `current_videogame`.
  **Não há campo `coach`, `staff` ou equivalente.**
- O array `players` do time contém **apenas jogadores**. Não há entrada
  marcada como comissão técnica.
- O campo `role` existe no objeto player, mas em Valorant os valores
  observados foram: `null` (100).
  **Nenhuma ocorrência de `coach`.**

> Observação relevante: em Valorant o `role` vem `null` para
> praticamente todos os jogadores (em LoL o mesmo campo traz `top`,
> `jungle`, `mid`, `adc`, `sup`). Ou seja, além de não haver coach,
> **não há nem função de jogo** utilizável em Valorant no tier atual.
> A coluna `players.role` existe no schema e está sendo preenchida com
> `null` para Valorant.

---

## 8. Estatísticas de player (K/D/A, tempo de partida) — DINÂMICO

### Os três endpoints estão BLOQUEADOS no tier gratuito

| Endpoint | HTTP | Resposta |
| --- | --- | --- |
| `/valorant/players/{id}/stats` | 403 | `Access Denied` |
| `/valorant/matches/{id}/players/stats` | 403 | `Access Denied` |
| `/valorant/tournaments/{id}/players/{id}/stats` | 403 | `Access Denied` |
| `/valorant/teams/{id}/stats` (extra) | 403 | `Access Denied` |

**403 não é erro de integração:** a rota existe e a chave é válida (todos os
outros endpoints respondem 200 com a mesma chave). É restrição de plano.
Confirma o que o `contexto-projeto.md` já previa: estatística granular
depende de plano pago.

**Consequência prática: K/D/A, tempo de partida e "últimos jogos com
filtro" não são obteníveis hoje.** Nenhuma decisão de schema sobre stats
faz sentido antes de resolver o plano.

### Como o dado viria fatiado (para quando houver acesso)

A hierarquia da API é **liga → série → torneio → partida (match) → jogo
(game/mapa)**. Os endpoints acima correspondem a três recortes:

- por **partida** (`/matches/{id}/players/stats`) — o mais granular acessível
- por **torneio** (`/tournaments/{id}/players/{id}/stats`) — agregado da fase
- por **carreira** (`/players/{id}/stats`) — agregado geral

Não existe parâmetro "últimos N jogos": esse recorte teria de ser montado
por nós, agregando por partida e ordenando por data.

### O que dá para extrair hoje, sem os endpoints de stats

O objeto de partida traz o array `games` — um item por mapa jogado — com
os campos: `complete`, `id`, `position`, `status`, `length`, `finished`, `winner`, `match_id`, `begin_at`, `detailed_stats`, `end_at`, `forfeit`, `winner_type`.

Isso dá **placar por mapa e duração**, mas **não** dá K/D/A por jogador.

---

## 9. Idade do jogador — DINÂMICO

**Resposta direta: SIM, existe — e não está sendo capturado.**

O objeto player traz **dois** campos:

| Campo da API | Tipo | Exemplo | Capturado? | Onde no banco |
| --- | --- | --- | --- | --- |
| `birthday` | string (`YYYY-MM-DD`) | 2003-08-03 | **não** | — |
| `age` | number | 23 | **não** | — |

**Cobertura é irregular, e depende muito de qual recorte você olha:**

| Amostra | Jogadores | `age` preenchido | `birthday` preenchido |
| --- | --- | --- | --- |
| Coleção geral (`/valorant/players`, 1ª página) | 100 | 4 (4%) | 4 (4%) |
| Rosters de times ativos (`/valorant/teams`) | 52 | 14 (27%) | 14 (27%) |

A coleção geral é dominada por jogadores obscuros e **subestima** o que a
wiki veria na prática: o número que importa é o dos rosters, já que são
esses os jogadores que aparecem nas páginas de time.

> `age` é derivável de `birthday`, e é o único dos dois que envelhece
> sozinho. Guardar `birthday` e calcular a idade na leitura evita dado
> velho no banco — mas a decisão é sua.

## 10. Tempo de carreira do jogador — DINÂMICO

**Resposta direta: NÃO existe campo direto na API.**

Nenhum dos campos do objeto player corresponde a início de carreira,
tempo de profissão ou data de estreia. Os campos disponíveis são apenas:
`active`, `age`, `birthday`, `current_team`, `current_videogame`, `first_name`, `id`, `image_url`, `last_name`, `modified_at`, `name`, `nationality`, `role`, `slug`.

`modified_at` é data de alteração do registro no PandaScore, **não** tem
relação com a carreira do jogador.

Para obter isso seria preciso **derivar** — por exemplo, a partir da
partida mais antiga em `/players/{id}/matches` ou do torneio mais antigo
em `/players/{id}/tournaments` (ambos confirmados como acessíveis na
seção 3). Seria um número calculado por nós, com a ressalva de que a
cobertura histórica do tier gratuito é limitada e o resultado pode
subestimar carreiras longas.

---

## 11. Mapas — ESTÁTICO

### `GET /valorant/maps` — HTTP 200

**Coleção completa: 13 registro(s)** (`X-Total`), ou seja 1 página(s) de 100.

| Campo da API | Tipo | Exemplo | Capturado? | Onde no banco |
| --- | --- | --- | --- | --- |
| `id` | number | 73 | **não** | — |
| `image_url` | string | https://cdn-api.pandascore.co/images/valor… | **não** | — |
| `name` | string | Summit | **não** | — |
| `slug` | string | summit | **não** | — |
| `videogame_versions` | array<string> | 4 item(s) | **não** | — |

**5 campos na resposta · 0 capturados · 5 descartados hoje.**


## 12. Agentes — ESTÁTICO

### `GET /valorant/agents` — HTTP 200

**Coleção completa: 29 registro(s)** (`X-Total`), ou seja 1 página(s) de 100.

| Campo da API | Tipo | Exemplo | Capturado? | Onde no banco |
| --- | --- | --- | --- | --- |
| `id` | number | 448 | **não** | — |
| `name` | string | Iso | **não** | — |
| `portrait_url` | string | https://cdn-api.pandascore.co/images/valor… | **não** | — |
| `videogame_versions` | array<string> | 3 item(s) | **não** | — |

**4 campos na resposta · 0 capturados · 4 descartados hoje.**


## 13. Armas — ESTÁTICO

### `GET /valorant/weapons` — HTTP 200

**Coleção completa: 21 registro(s)** (`X-Total`), ou seja 1 página(s) de 100.

| Campo da API | Tipo | Exemplo | Capturado? | Onde no banco |
| --- | --- | --- | --- | --- |
| `creds` | number | 2400 | **não** | — |
| `id` | number | 88 | **não** | — |
| `image_url` | string | https://cdn-api.pandascore.co/images/valor… | **não** | — |
| `name` | string | Outlaw | **não** | — |
| `videogame_versions` | array<string> | 3 item(s) | **não** | — |

**5 campos na resposta · 0 capturados · 5 descartados hoje.**


## 14. Habilidades — ESTÁTICO

### `GET /valorant/abilities` — HTTP 200

**Coleção completa: 116 registro(s)** (`X-Total`), ou seja 2 página(s) de 100.

| Campo da API | Tipo | Exemplo | Capturado? | Onde no banco |
| --- | --- | --- | --- | --- |
| `ability_type` | string | ability_one | **não** | — |
| `creds` | number | 250 | **não** | — |
| `id` | number | 782 | **não** | — |
| `image_url` | string | https://cdn-api.pandascore.co/images/valor… | **não** | — |
| `name` | string | Blindside | **não** | — |
| `videogame_versions` | array<string> | 3 item(s) | **não** | — |

**6 campos na resposta · 0 capturados · 6 descartados hoje.**


### Ressalva sobre habilidades (14)

O objeto de habilidade **não tem nenhum campo ligando-a a um agente** —
as chaves são apenas `id`, `name`, `ability_type`, `creds`,
`videogame_versions` e `image_url`. Com 116 habilidades soltas e 29 agentes,
associar habilidade ao agente exigiria fonte externa ou mapeamento manual.
`ability_type` (`ability_one`, `ability_two`, `grenade_ability`,
`ultimate`) diz só o **slot**, não o dono.

### Volume total dos estáticos

| Coleção | Registros | Cabe em 1 página? |
| --- | --- | --- |
| `maps` | 13 | sim |
| `agents` | 29 | sim |
| `weapons` | 21 | sim |
| `abilities` | 116 | **não — precisa paginar** |

Três das quatro coleções cabem numa chamada só. Habilidades é a exceção.
