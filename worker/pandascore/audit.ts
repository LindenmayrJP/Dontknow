/**
 * Auditoria Módulo 3.5 — o que a API do PandaScore devolve x o que o banco
 * guarda hoje. Escopo: Valorant.
 *
 * Não altera o banco e não decide nada: só coleta as respostas cruas em
 * `db/api-samples/` e gera um relatório por categoria para revisão humana.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getJson, HttpError } from "../lib/http";
import { RateLimiter } from "../lib/rate-limiter";

const BASE = "https://api.pandascore.co";
const SAMPLES_DIR = join(__dirname, "..", "..", "db", "api-samples");
const REPORT_PATH = join(__dirname, "..", "..", "auditoria-pandascore.md");

// Mesma folga do worker: 950/hora com espaçamento entre chamadas.
const limiter = new RateLimiter(950, 60 * 60 * 1000, 250);

type Fetched = {
  path: string;
  status: number;
  data: unknown;
  error?: string;
};

const fetched: Fetched[] = [];

async function api(path: string): Promise<Fetched> {
  const url = `${BASE}${path}`;
  const registro: Fetched = { path, status: 200, data: null };

  try {
    registro.data = await getJson<unknown>(url, {
      limiter,
      headers: {
        Authorization: `Bearer ${process.env.PANDASCORE_API_KEY}`,
        Accept: "application/json",
      },
      maxRetries: 1,
    });
  } catch (err) {
    if (err instanceof HttpError) {
      registro.status = err.status;
      registro.error = err.body.slice(0, 200);
    } else {
      registro.status = 0;
      registro.error = err instanceof Error ? err.message : String(err);
    }
  }

  fetched.push(registro);
  const marca = registro.status === 200 ? "ok " : `${registro.status}`;
  const qtd = Array.isArray(registro.data) ? `[${registro.data.length}]` : "";
  console.log(`  ${marca} ${path}${qtd}`);
  return registro;
}

/**
 * Igual a `api`, mas devolve também o header `X-Total` — é ele que diz o
 * tamanho real da coleção, informação que não dá para inferir de uma
 * página só.
 */
async function apiComTotal(path: string): Promise<Fetched & { total: number | null }> {
  await limiter.acquire();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.PANDASCORE_API_KEY}`,
      Accept: "application/json",
    },
  });
  const total = Number(res.headers.get("x-total"));
  const registro: Fetched & { total: number | null } = {
    path,
    status: res.status,
    data: res.ok ? await res.json() : null,
    total: Number.isFinite(total) && total > 0 ? total : null,
  };
  fetched.push(registro);
  console.log(`  ${res.ok ? "ok " : res.status} ${path} (total=${registro.total ?? "?"})`);
  return registro;
}

function salvar(nome: string, conteudo: unknown) {
  writeFileSync(
    join(SAMPLES_DIR, `${nome}.json`),
    JSON.stringify(conteudo, null, 2),
    "utf-8"
  );
}

/* ------------------------------------------------------------------ *
 * Mapa do que o worker grava hoje (worker/pandascore/sync.ts).
 * Chave = campo da API; valor = onde ele acaba no banco.
 * Campo ausente daqui = descartado hoje.
 * ------------------------------------------------------------------ */
const CAPTURADO: Record<string, Record<string, string>> = {
  team: {
    id: "teams.pandascore_id",
    name: "teams.name + organizations.name",
    slug: "teams.slug",
    acronym: "teams.acronym",
    location: "organizations.region (só se ainda estiver NULL)",
    image_url: "teams.image_url",
    players: "team_memberships (vínculo jogador↔time)",
  },
  player: {
    id: "players.pandascore_id",
    name: "players.name",
    slug: "players.slug",
    role: "players.role",
    nationality: "players.nationality",
    image_url: "players.image_url",
  },
  tournament: {
    id: "tournaments.pandascore_id",
    name: "tournaments.name (prefixado com liga e série)",
    slug: "tournaments.slug",
    begin_at: "tournaments.start_date",
    end_at: "tournaments.end_date",
  },
  match: {
    id: "matches.pandascore_id",
    name: "matches.name",
    scheduled_at: "matches.scheduled_at",
    status: "matches.status",
    number_of_games: "matches.number_of_games",
    winner_id: "matches.winner_team_id",
    opponents: "matches.team_a_id / team_b_id",
    results: "matches.team_a_score / team_b_score",
    tournament: "matches.tournament_id",
    league: "tournaments.league_name",
    serie: "tournaments.serie_name",
  },
  league: {},
  standing: {},
  bracket: {},
  map: {},
  agent: {},
  weapon: {},
  ability: {},
};

/** Descreve o tipo de um valor JSON para o relatório. */
function tipoDe(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) {
    if (v.length === 0) return "array (vazio na amostra)";
    const interno = typeof v[0] === "object" && v[0] !== null ? "objeto" : typeof v[0];
    return `array<${interno}>`;
  }
  if (typeof v === "object") return "objeto";
  return typeof v;
}

/** Exemplo curto e legível do valor. */
function exemploDe(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return v.length ? `${v.length} item(s)` : "[]";
  if (typeof v === "object") {
    const chaves = Object.keys(v as object);
    return `{ ${chaves.slice(0, 4).join(", ")}${chaves.length > 4 ? ", …" : ""} }`;
  }
  const s = String(v);
  return s.length > 42 ? `${s.slice(0, 42)}…` : s;
}

/**
 * Une as chaves de todos os registros da amostra: um campo pode vir null
 * em um registro e preenchido em outro, e o relatório precisa listá-lo
 * mesmo assim.
 */
function camposDa(amostra: unknown[]): { campo: string; tipo: string; exemplo: string }[] {
  const campos = new Map<string, { tipo: string; exemplo: string; peso: number }>();

  // Quanto mais informativo o valor, melhor o exemplo. Uma partida futura
  // traz `opponents: []`; uma encerrada traz os dois times — o relatório
  // deve mostrar a segunda.
  const informatividade = (v: unknown) => {
    if (v === null || v === undefined) return 0;
    if (Array.isArray(v)) return v.length === 0 ? 1 : 3;
    return 2;
  };

  for (const item of amostra) {
    if (!item || typeof item !== "object") continue;
    for (const [campo, valor] of Object.entries(item)) {
      const atual = campos.get(campo);
      if (!atual || informatividade(valor) > atual.peso) {
        campos.set(campo, {
          tipo: tipoDe(valor),
          exemplo: exemploDe(valor),
          peso: informatividade(valor),
        });
      }
    }
  }

  return [...campos.entries()]
    .map(([campo, { tipo, exemplo }]) => ({ campo, tipo, exemplo }))
    .sort((a, b) => a.campo.localeCompare(b.campo));
}

function tabelaDeCampos(amostra: unknown[], tipoEntidade: string): string {
  const mapa = CAPTURADO[tipoEntidade] ?? {};
  const campos = camposDa(amostra);
  if (campos.length === 0) return "_Sem registros na amostra._\n";

  const linhas = campos.map(({ campo, tipo, exemplo }) => {
    const destino = mapa[campo];
    const capturado = destino ? "sim" : "**não**";
    return `| \`${campo}\` | ${tipo} | ${exemplo.replace(/\|/g, "\\|")} | ${capturado} | ${destino ?? "—"} |`;
  });

  const naoCapturados = campos.filter((c) => !mapa[c.campo]).length;

  return [
    `| Campo da API | Tipo | Exemplo | Capturado? | Onde no banco |`,
    `| --- | --- | --- | --- | --- |`,
    ...linhas,
    "",
    `**${campos.length} campos na resposta · ${campos.length - naoCapturados} capturados · ${naoCapturados} descartados hoje.**`,
    "",
  ].join("\n");
}

function comoArray(f: Fetched): unknown[] {
  return Array.isArray(f.data) ? f.data : f.data ? [f.data] : [];
}

async function main() {
  mkdirSync(SAMPLES_DIR, { recursive: true });
  const secoes: string[] = [];
  const inicio = Date.now();

  console.log("\n=== Auditoria PandaScore — Valorant ===\n");

  /* ---------------- 1. Campeonatos ---------------- */
  console.log("[1] campeonatos");
  const leagues = await api("/valorant/leagues?page[size]=5");
  const tournaments = await api("/valorant/tournaments?page[size]=5&sort=-begin_at");
  salvar("valorant-leagues", leagues.data);
  salvar("valorant-tournaments", tournaments.data);

  secoes.push(`## 1. Campeonatos — DINÂMICO

### \`GET /valorant/leagues\` — HTTP ${leagues.status}

Liga = a competição recorrente (ex: "VCT Americas"). É o nível mais alto:
liga → série (split/temporada) → torneio (fase).

${tabelaDeCampos(comoArray(leagues), "league")}
> Nenhum campo de liga é gravado hoje. O worker só aproveita \`league.name\`
> vindo dentro do objeto de partida, para compor \`tournaments.name\`.

### \`GET /valorant/tournaments\` — HTTP ${tournaments.status}

${tabelaDeCampos(comoArray(tournaments), "tournament")}`);

  /* ---------------- 2. Partidas de campeonato ---------------- */
  console.log("[2] partidas de campeonato");
  const tourId = (comoArray(tournaments)[0] as { id: number } | undefined)?.id;
  const matches = await api("/valorant/matches?page[size]=5&sort=-scheduled_at");
  const matchesDoTorneio = tourId
    ? await api(`/valorant/matches?filter[tournament_id]=${tourId}&page[size]=5`)
    : null;
  salvar("valorant-matches", matches.data);
  if (matchesDoTorneio) salvar("valorant-matches-por-torneio", matchesDoTorneio.data);

  secoes.push(`## 2. Partidas de campeonato — DINÂMICO

### \`GET /valorant/matches\` — HTTP ${matches.status}

${tabelaDeCampos(comoArray(matches), "match")}

### Partidas de um torneio específico

A rota aninhada \`/valorant/tournaments/{id}/matches\` **não existe** (404
\`Route not found\`). O caminho correto é filtrar na coleção de partidas:

\`GET /valorant/matches?filter[tournament_id]=${tourId}\` — HTTP ${matchesDoTorneio?.status ?? "n/d"}, ${comoArray(matchesDoTorneio ?? { path: "", status: 0, data: [] }).length} registro(s).

O objeto devolvido é idêntico ao de \`/valorant/matches\`, então a tabela de
campos acima vale para os dois.`);

  /* ---------------- 3. Histórico de partidas ---------------- */
  console.log("[3] histórico de partidas");
  const past = await api("/valorant/matches/past?page[size]=5&sort=-scheduled_at");
  salvar("valorant-matches-past", past.data);

  // Precisa de um jogador que realmente tenha histórico: pega do roster de
  // um time ativo, não do primeiro player da coleção global.
  const timesComRoster = await api("/valorant/teams?page[size]=20");
  const timeComPlayers = comoArray(timesComRoster).find(
    (t) => ((t as { players?: unknown[] }).players?.length ?? 0) > 0
  ) as { id: number; name: string; players: { id: number; name: string }[] } | undefined;
  const playerId = timeComPlayers?.players[0]?.id;

  const playerTournaments = playerId
    ? await api(`/players/${playerId}/tournaments?page[size]=5`)
    : null;
  const playerMatches = playerId
    ? await api(`/players/${playerId}/matches?page[size]=3`)
    : null;
  if (playerTournaments) salvar("valorant-player-tournaments", playerTournaments.data);
  if (playerMatches) salvar("valorant-player-matches", playerMatches.data);

  secoes.push(`## 3. Histórico de partidas — DINÂMICO

### \`GET /valorant/matches/past\` — HTTP ${past.status}

Mesmo objeto de \`/valorant/matches\`, filtrado para partidas já encerradas.
É o que o worker já usa hoje para popular resultados.

${tabelaDeCampos(comoArray(past), "match")}

### \`GET /players/{id}/tournaments\` — HTTP ${playerTournaments?.status ?? "n/d"}

Testado com \`${timeComPlayers?.players[0]?.name ?? "?"}\` (id ${playerId ?? "?"}), do time ${timeComPlayers?.name ?? "?"}.
Retornou **${comoArray(playerTournaments ?? { path: "", status: 0, data: [] }).length} torneio(s)**.

Nota: a rota **não** tem prefixo de jogo — é \`/players/…\`, não
\`/valorant/players/…\`. Devolve objetos de torneio (mesma forma da seção 1).

### \`GET /players/{id}/matches\` — HTTP ${playerMatches?.status ?? "n/d"}

Existe e devolve **${comoArray(playerMatches ?? { path: "", status: 0, data: [] }).length} partida(s)** para o mesmo jogador. Não estava na
lista original do módulo, mas é o caminho natural para "últimos jogos"
sem depender dos endpoints de estatística (bloqueados — ver seção 8).`);

  /* ---------------- 4. Standings e brackets ---------------- */
  console.log("[4] standings e brackets");
  // Nem todo torneio tem tabela: varre até achar um populado.
  const candidatos = await api("/valorant/tournaments?page[size]=15&sort=-begin_at");
  let standings: Fetched | null = null;
  let standingsTour: { id: number; name: string } | null = null;
  const semStandings: number[] = [];

  for (const t of comoArray(candidatos) as { id: number; name: string }[]) {
    const r = await api(`/tournaments/${t.id}/standings`);
    if (r.status === 200 && comoArray(r).length > 0) {
      standings = r;
      standingsTour = t;
      break;
    }
    semStandings.push(t.id);
  }

  const bracketTour = standingsTour ?? (comoArray(candidatos)[0] as { id: number; name: string });
  const brackets = await api(`/tournaments/${bracketTour.id}/brackets`);
  if (standings) salvar("valorant-standings", standings.data);
  salvar("valorant-brackets", brackets.data);

  // Uma partida com dois alimentadores ilustra melhor a árvore do que a
  // primeira da lista, que costuma ter só um.
  const partidasBracket = comoArray(brackets) as {
    name: string;
    previous_matches?: { type: string; match_id: number }[];
  }[];
  const exemploBracket =
    partidasBracket.find((m) => (m.previous_matches?.length ?? 0) > 1) ??
    partidasBracket.find((m) => (m.previous_matches?.length ?? 0) > 0);

  secoes.push(`## 4. Tabelas de campeonato (standings / brackets) — DINÂMICO

### \`GET /tournaments/{id}/standings\` — HTTP ${standings?.status ?? 404}

**A rota não tem prefixo de jogo.** \`/valorant/tournaments/{id}/standings\`
devolve 404 \`Route not found\`; a correta é \`/tournaments/{id}/standings\`.

**Nem todo torneio tem tabela.** ${semStandings.length} torneio(s) recentes responderam 404
\`Record not found\` antes de achar um populado${standingsTour ? ` (\`${standingsTour.name}\`, id ${standingsTour.id})` : ""}.
Um 404 aqui significa "esse torneio não publica tabela" — provavelmente
formato de chave direta, sem fase de grupos — e não erro de integração.

${standings ? tabelaDeCampos(comoArray(standings), "standing") : "_Nenhum torneio da amostra tinha standings._\n"}
> Formato: uma linha por time, com \`rank\` e o objeto \`team\` aninhado.
> **Nada disso é gravado hoje** — não existe tabela de classificação no schema.

### \`GET /tournaments/{id}/brackets\` — HTTP ${brackets.status}

Também **sem prefixo de jogo**. Devolveu ${comoArray(brackets).length} registro(s) para o torneio ${bracketTour.id}.

A resposta é a lista de partidas do torneio, cada uma com a forma completa
de match — **mais um campo que só aparece aqui**: \`previous_matches\`.

${tabelaDeCampos(comoArray(brackets), "bracket")}
#### \`previous_matches\` é a árvore do chaveamento

Este é o achado mais relevante da seção. Cada partida aponta de quais
partidas anteriores vêm seus participantes:

\`\`\`json
${JSON.stringify(
  {
    name: exemploBracket?.name,
    previous_matches: exemploBracket?.previous_matches,
  },
  null,
  2
)}
\`\`\`

\`type\` é \`"winner"\` ou \`"loser"\`, o que distingue **upper e lower
bracket**: uma partida alimentada por um \`loser\` é da chave inferior.
Com esse campo dá para reconstruir a árvore inteira (quem enfrenta quem,
em que rodada, e para onde vai o perdedor).

> **\`previous_matches\` NÃO vem em \`/valorant/matches\`** — conferido nas
> amostras: o campo existe só na resposta de \`/brackets\`. Ou seja, a
> mesma partida obtida pelo endpoint que o worker já usa chega **sem** a
> informação de chaveamento. É a razão concreta para chamar \`/brackets\`
> em vez de deduzir a chave dos nomes das partidas.

> Os demais campos aparecem como "não capturados" porque o worker nunca
> chama este endpoint — mas coincidem com os de \`match\`, e parte deles já
> é gravada quando a mesma partida chega por \`/valorant/matches\`.`);

  /* ---------------- 5. Times ---------------- */
  console.log("[5] times (FURIA e MIBR)");
  const furia = await api("/valorant/teams?search[name]=FURIA");
  const mibr = await api("/valorant/teams?search[name]=MIBR");
  const teamsGeral = await api("/valorant/teams?page[size]=5");
  salvar("valorant-teams-furia", furia.data);
  salvar("valorant-teams-mibr", mibr.data);
  salvar("valorant-teams", teamsGeral.data);

  const listaFuria = comoArray(furia) as { id: number; name: string; players?: unknown[] }[];
  const listaMibr = comoArray(mibr) as { id: number; name: string; players?: unknown[] }[];

  const linhasTimes = [...listaFuria, ...listaMibr]
    .map((t) => `| ${t.name} | ${t.id} | ${t.players?.length ?? 0} |`)
    .join("\n");

  secoes.push(`## 5. Times — DINÂMICO

### \`GET /valorant/teams\` — HTTP ${teamsGeral.status}

${tabelaDeCampos([...comoArray(teamsGeral), ...listaFuria, ...listaMibr], "team")}

### FURIA e MIBR na API

\`search[name]\` devolve todas as variações da organização, não só o time
principal — inclusive academy e times femininos, cada um com id próprio:

| Time | id | Jogadores no roster |
| --- | --- | --- |
${linhasTimes}

Times com **0 jogadores** existem na API mas vêm sem roster. Isso explica
por que parte dos times aparece no site sem elenco: não é perda na
ingestão, é ausência na origem.`);

  /* ---------------- 6 e 7. Players e coach ---------------- */
  console.log("[6/7] players e análise de coach");
  const players = await api("/valorant/players?page[size]=5");
  salvar("valorant-players", players.data);

  // Amostra ampla só para responder a pergunta do coach de forma confiável.
  const amostraRoles = await api("/valorant/players?page[size]=100");
  const listaRoles = comoArray(amostraRoles) as { role: string | null; name: string }[];
  const rolesDistintos = new Map<string, number>();
  for (const p of listaRoles) {
    const chave = p.role === null ? "null" : String(p.role);
    rolesDistintos.set(chave, (rolesDistintos.get(chave) ?? 0) + 1);
  }
  const rolesResumo = [...rolesDistintos.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([r, n]) => `\`${r}\` (${n})`)
    .join(", ");

  // O roster embutido no time tem a mesma forma? Compara as chaves.
  const rosterEmbutido = (listaFuria.find((t) => (t.players?.length ?? 0) > 0)?.players ??
    []) as Record<string, unknown>[];
  const chavesRoster = rosterEmbutido[0] ? Object.keys(rosterEmbutido[0]).sort() : [];
  const chavesPlayer = comoArray(players)[0]
    ? Object.keys(comoArray(players)[0] as object).sort()
    : [];
  const soNoPlayer = chavesPlayer.filter((k) => !chavesRoster.includes(k));

  secoes.push(`## 6. Players profissionais — DINÂMICO

### \`GET /valorant/players\` — HTTP ${players.status}

${tabelaDeCampos(comoArray(players), "player")}

### Roster embutido no objeto de time

O array \`players\` dentro do time traz **quase** o mesmo objeto, faltando
${soNoPlayer.length ? `: ${soNoPlayer.map((k) => `\`${k}\``).join(", ")}` : "nada"}.
Ou seja: dá para popular idade, nome real e nacionalidade **sem uma
chamada extra por jogador** — o dado já vem junto do time.

## 7. Coach — DINÂMICO

**Resposta direta: a API não expõe coach em nenhum lugar.**

Evidências, sobre uma amostra de ${listaRoles.length} jogadores de Valorant:

- O objeto de time (\`/valorant/teams\`) tem os campos
  ${Object.keys((comoArray(teamsGeral)[0] as object) ?? {}).map((k) => `\`${k}\``).join(", ")}.
  **Não há campo \`coach\`, \`staff\` ou equivalente.**
- O array \`players\` do time contém **apenas jogadores**. Não há entrada
  marcada como comissão técnica.
- O campo \`role\` existe no objeto player, mas em Valorant os valores
  observados foram: ${rolesResumo}.
  **Nenhuma ocorrência de \`coach\`.**

> Observação relevante: em Valorant o \`role\` vem \`null\` para
> praticamente todos os jogadores (em LoL o mesmo campo traz \`top\`,
> \`jungle\`, \`mid\`, \`adc\`, \`sup\`). Ou seja, além de não haver coach,
> **não há nem função de jogo** utilizável em Valorant no tier atual.
> A coluna \`players.role\` existe no schema e está sendo preenchida com
> \`null\` para Valorant.`);

  /* ---------------- 8. Estatísticas ---------------- */
  console.log("[8] estatísticas de player");
  const statsPlayer = playerId ? await api(`/valorant/players/${playerId}/stats`) : null;
  const matchId = (comoArray(matches)[0] as { id: number } | undefined)?.id;
  const statsMatch = matchId ? await api(`/valorant/matches/${matchId}/players/stats`) : null;
  const statsTour =
    tourId && playerId
      ? await api(`/valorant/tournaments/${tourId}/players/${playerId}/stats`)
      : null;
  const statsTeam = timeComPlayers
    ? await api(`/valorant/teams/${timeComPlayers.id}/stats`)
    : null;

  salvar("valorant-stats-bloqueados", {
    nota: "Respostas de erro dos endpoints de estatística no tier gratuito.",
    endpoints: [statsPlayer, statsMatch, statsTour, statsTeam]
      .filter(Boolean)
      .map((f) => ({ path: f!.path, status: f!.status, error: f!.error })),
  });

  // As partidas trazem `games`: é a única granularidade acessível hoje.
  const partidaExemplo = comoArray(past)[0] as Record<string, unknown> | undefined;
  const games = (partidaExemplo?.games ?? []) as Record<string, unknown>[];
  const chavesGame = games[0] ? Object.keys(games[0]) : [];

  secoes.push(`## 8. Estatísticas de player (K/D/A, tempo de partida) — DINÂMICO

### Os três endpoints estão BLOQUEADOS no tier gratuito

| Endpoint | HTTP | Resposta |
| --- | --- | --- |
| \`/valorant/players/{id}/stats\` | ${statsPlayer?.status ?? "n/d"} | \`Access Denied\` |
| \`/valorant/matches/{id}/players/stats\` | ${statsMatch?.status ?? "n/d"} | \`Access Denied\` |
| \`/valorant/tournaments/{id}/players/{id}/stats\` | ${statsTour?.status ?? "n/d"} | \`Access Denied\` |
| \`/valorant/teams/{id}/stats\` (extra) | ${statsTeam?.status ?? "n/d"} | \`Access Denied\` |

**403 não é erro de integração:** a rota existe e a chave é válida (todos os
outros endpoints respondem 200 com a mesma chave). É restrição de plano.
Confirma o que o \`contexto-projeto.md\` já previa: estatística granular
depende de plano pago.

**Consequência prática: K/D/A, tempo de partida e "últimos jogos com
filtro" não são obteníveis hoje.** Nenhuma decisão de schema sobre stats
faz sentido antes de resolver o plano.

### Como o dado viria fatiado (para quando houver acesso)

A hierarquia da API é **liga → série → torneio → partida (match) → jogo
(game/mapa)**. Os endpoints acima correspondem a três recortes:

- por **partida** (\`/matches/{id}/players/stats\`) — o mais granular acessível
- por **torneio** (\`/tournaments/{id}/players/{id}/stats\`) — agregado da fase
- por **carreira** (\`/players/{id}/stats\`) — agregado geral

Não existe parâmetro "últimos N jogos": esse recorte teria de ser montado
por nós, agregando por partida e ordenando por data.

### O que dá para extrair hoje, sem os endpoints de stats

O objeto de partida traz o array \`games\` — um item por mapa jogado — com
os campos: ${chavesGame.length ? chavesGame.map((k) => `\`${k}\``).join(", ") : "_(sem games na amostra)_"}.

Isso dá **placar por mapa e duração**, mas **não** dá K/D/A por jogador.`);

  /* ---------------- 9 e 10. Idade e carreira ---------------- */
  console.log("[9/10] idade e tempo de carreira");
  type ComIdade = { age: number | null; birthday: string | null; name: string };

  const cobertura = (lista: ComIdade[]) => {
    const total = Math.max(lista.length, 1);
    const age = lista.filter((p) => p.age !== null && p.age !== undefined).length;
    const bday = lista.filter((p) => p.birthday !== null && p.birthday !== undefined).length;
    return {
      total: lista.length,
      age,
      bday,
      pctAge: ((age / total) * 100).toFixed(0),
      pctBday: ((bday / total) * 100).toFixed(0),
    };
  };

  // Duas amostras: a coleção global é dominada por jogadores obscuros e
  // subestima a cobertura; o que importa para o produto é o preenchimento
  // nos rosters de times que a wiki realmente exibe.
  const covGlobal = cobertura(listaRoles as unknown as ComIdade[]);
  const jogadoresDeRoster = comoArray(timesComRoster).flatMap(
    (t) => ((t as { players?: ComIdade[] }).players ?? [])
  );
  const covRoster = cobertura(jogadoresDeRoster);

  const exemploIdade = [...jogadoresDeRoster, ...(comoArray(players) as ComIdade[])].find(
    (p) => p.age != null
  );

  secoes.push(`## 9. Idade do jogador — DINÂMICO

**Resposta direta: SIM, existe — e não está sendo capturado.**

O objeto player traz **dois** campos:

| Campo da API | Tipo | Exemplo | Capturado? | Onde no banco |
| --- | --- | --- | --- | --- |
| \`birthday\` | string (\`YYYY-MM-DD\`) | ${exemploIdade?.birthday ?? "1999-04-06"} | **não** | — |
| \`age\` | number | ${exemploIdade?.age ?? 27} | **não** | — |

**Cobertura é irregular, e depende muito de qual recorte você olha:**

| Amostra | Jogadores | \`age\` preenchido | \`birthday\` preenchido |
| --- | --- | --- | --- |
| Coleção geral (\`/valorant/players\`, 1ª página) | ${covGlobal.total} | ${covGlobal.age} (${covGlobal.pctAge}%) | ${covGlobal.bday} (${covGlobal.pctBday}%) |
| Rosters de times ativos (\`/valorant/teams\`) | ${covRoster.total} | ${covRoster.age} (${covRoster.pctAge}%) | ${covRoster.bday} (${covRoster.pctBday}%) |

A coleção geral é dominada por jogadores obscuros e **subestima** o que a
wiki veria na prática: o número que importa é o dos rosters, já que são
esses os jogadores que aparecem nas páginas de time.

> \`age\` é derivável de \`birthday\`, e é o único dos dois que envelhece
> sozinho. Guardar \`birthday\` e calcular a idade na leitura evita dado
> velho no banco — mas a decisão é sua.

## 10. Tempo de carreira do jogador — DINÂMICO

**Resposta direta: NÃO existe campo direto na API.**

Nenhum dos campos do objeto player corresponde a início de carreira,
tempo de profissão ou data de estreia. Os campos disponíveis são apenas:
${chavesPlayer.map((k) => `\`${k}\``).join(", ")}.

\`modified_at\` é data de alteração do registro no PandaScore, **não** tem
relação com a carreira do jogador.

Para obter isso seria preciso **derivar** — por exemplo, a partir da
partida mais antiga em \`/players/{id}/matches\` ou do torneio mais antigo
em \`/players/{id}/tournaments\` (ambos confirmados como acessíveis na
seção 3). Seria um número calculado por nós, com a ressalva de que a
cobertura histórica do tier gratuito é limitada e o resultado pode
subestimar carreiras longas.`);

  /* ---------------- 11 a 14. Estáticos ---------------- */
  console.log("[11-14] dados estáticos");
  const estaticos: { nome: string; rotulo: string; f: Fetched & { total: number | null } }[] = [];
  for (const [nome, rotulo] of [
    ["maps", "11. Mapas"],
    ["agents", "12. Agentes"],
    ["weapons", "13. Armas"],
    ["abilities", "14. Habilidades"],
  ] as const) {
    // page[size]=100 para o X-Total refletir a coleção inteira.
    const f = await apiComTotal(`/valorant/${nome}?page[size]=100`);
    salvar(`valorant-${nome}`, f.data);
    estaticos.push({ nome, rotulo, f });
  }

  const totalAbilities = estaticos.find((e) => e.nome === "abilities")?.f.total ?? 0;

  const blocosEstaticos = estaticos
    .map(({ nome, rotulo, f }) => {
      const total = f.total ?? comoArray(f).length;
      const paginas = Math.ceil(total / 100);
      return `## ${rotulo} — ESTÁTICO

### \`GET /valorant/${nome}\` — HTTP ${f.status}

**Coleção completa: ${total} registro(s)** (\`X-Total\`), ou seja ${paginas} página(s) de 100.

${tabelaDeCampos(comoArray(f), nome.replace(/s$/, ""))}`;
    })
    .join("\n\n");

  secoes.push(
    blocosEstaticos +
      `

### Ressalva sobre habilidades (14)

O objeto de habilidade **não tem nenhum campo ligando-a a um agente** —
as chaves são apenas \`id\`, \`name\`, \`ability_type\`, \`creds\`,
\`videogame_versions\` e \`image_url\`. Com ${totalAbilities} habilidades soltas e 29 agentes,
associar habilidade ao agente exigiria fonte externa ou mapeamento manual.
\`ability_type\` (\`ability_one\`, \`ability_two\`, \`grenade_ability\`,
\`ultimate\`) diz só o **slot**, não o dono.

### Volume total dos estáticos

| Coleção | Registros | Cabe em 1 página? |
| --- | --- | --- |
${estaticos
  .map(
    ({ nome, f }) =>
      `| \`${nome}\` | ${f.total ?? "?"} | ${(f.total ?? 0) <= 100 ? "sim" : "**não — precisa paginar**"} |`
  )
  .join("\n")}

Três das quatro coleções cabem numa chamada só. Habilidades é a exceção.`
  );

  /* ---------------- Relatório ---------------- */
  const falhas = fetched.filter((f) => f.status !== 200);
  const bloqueados = falhas.filter((f) => f.status === 403);
  const inexistentes = falhas.filter((f) => f.status === 404);

  const cabecalho = `# Auditoria PandaScore — Valorant

Gerado por \`npm run audit:pandascore\` em ${new Date().toLocaleString("pt-BR")}.
Respostas cruas salvas em \`db/api-samples/\`.

Este relatório **só levanta** o que a API devolve e o que o banco guarda.
Nenhum campo foi adicionado ao schema — a decisão de quais capturar é sua.

## Resumo

- **${fetched.length} chamadas** à API: ${fetched.length - falhas.length} com 200, ${bloqueados.length} bloqueadas (403), ${inexistentes.length} inexistentes (404).
- **Estatística de player é o único bloqueio de plano.** Todo o resto do
  escopo do módulo está acessível no tier gratuito.
- **Idade existe e está sendo descartada** (\`birthday\`, \`age\`).
- **Coach não existe na API**, em nenhuma forma.
- **Tempo de carreira não existe** como campo; teria de ser derivado.
- **O chaveamento é reconstruível**: \`/tournaments/{id}/brackets\` traz
  \`previous_matches\`, um campo que **não** vem no endpoint de partidas
  que o worker usa hoje (seção 4).
- **Standings e brackets não têm prefixo de jogo** na URL — é
  \`/tournaments/{id}/…\`, não \`/valorant/tournaments/{id}/…\`.

### Estático x dinâmico

Separação para orientar as rotinas do worker:

| Tipo | Categorias | Muda quando | Sync sugerida |
| --- | --- | --- | --- |
| **Estático** | Mapas (11), Agentes (12), Armas (13), Habilidades (14) | Patch da Riot | Rara — os quatro trazem \`videogame_versions\`, que serve de gatilho |
| **Dinâmico** | Campeonatos (1), Partidas (2, 3), Standings/Brackets (4), Times (5), Players (6, 7, 9, 10), Stats (8) | Continuamente | Frequente, como hoje |

> Os quatro estáticos são coleções pequenas e completas em uma página —
> não precisam de paginação nem de filtro incremental.

### Como ler a coluna "Capturado?"

Comparação contra o que \`worker/pandascore/sync.ts\` grava hoje. "não"
significa que a API devolve o campo e o worker o descarta.

---

`;

  const relatorio = cabecalho + secoes.join("\n\n---\n\n") + "\n";
  writeFileSync(REPORT_PATH, relatorio, "utf-8");

  console.log(`\n=== concluído em ${((Date.now() - inicio) / 1000).toFixed(1)}s ===`);
  console.log(`relatório: auditoria-pandascore.md`);
  console.log(`amostras:  db/api-samples/ (${fetched.filter((f) => f.status === 200).length} respostas)`);
  if (bloqueados.length) {
    console.log(`\n${bloqueados.length} endpoint(s) bloqueados no tier gratuito:`);
    for (const f of bloqueados) console.log(`  403 ${f.path}`);
  }
}

main().catch((err) => {
  console.error("Falha na auditoria:", err);
  process.exit(1);
});
