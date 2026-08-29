import type { ArestaChave, PartidaTorneio } from "@/db/queries";
import { Avatar, logoDeTime } from "./avatar";
import { Tag } from "./tag";

/**
 * Chaveamento de eliminação, reconstruído das arestas do Módulo 3.6.
 *
 * A origem não entrega uma árvore pronta: entrega pares "esta partida
 * recebe o vencedor (ou o perdedor) daquela". Lado da chave e número da
 * rodada são derivados aqui.
 *
 * O ponto delicado é que **nem todo nó tem partida**. Final e final da
 * chave inferior costumam ser "TBD vs TBD" enquanto os classificados não
 * se conhecem, e partida sem os dois times não cabe em `matches`. Esses
 * nós existem só como `pandascore_id` na tabela de arestas — e precisam
 * aparecer na árvore, senão o chaveamento de um torneio em andamento
 * apareceria sem justamente as partidas que ainda importam.
 */

export type LadoChave = "superior" | "inferior" | "final";

export type NoChave = {
  psId: number;
  /** Nulo quando a partida ainda não existe (confronto indefinido). */
  partida: PartidaTorneio | null;
  lado: LadoChave;
  /** Profundidade: maior distância até uma partida de entrada. */
  rodada: number;
  origens: { psId: number; tipo: "winner" | "loser" }[];
};

export type Chave = {
  superior: NoChave[][];
  inferior: NoChave[][];
  final: NoChave[];
  /** Nós no total — 0 significa que o torneio não publica chave. */
  total: number;
};

/**
 * Monta a árvore. Função pura: recebe arestas e partidas, devolve
 * colunas por lado. Sem isto embutido no componente, não daria para
 * conferir a topologia sem renderizar uma página.
 */
export function montarChave(
  arestas: ArestaChave[],
  partidas: PartidaTorneio[]
): Chave {
  if (arestas.length === 0) {
    return { superior: [], inferior: [], final: [], total: 0 };
  }

  const porPsId = new Map<number, PartidaTorneio>();
  for (const p of partidas) {
    if (p.pandascore_id != null) porPsId.set(p.pandascore_id, p);
  }

  const entradas = new Map<number, { psId: number; tipo: "winner" | "loser" }[]>();
  const ids = new Set<number>();
  for (const a of arestas) {
    ids.add(a.destino);
    ids.add(a.origem);
    const lista = entradas.get(a.destino) ?? [];
    lista.push({ psId: a.origem, tipo: a.edge_type });
    entradas.set(a.destino, lista);
  }

  // Profundidade = maior caminho até uma entrada. O `visitando` protege
  // contra ciclo: a origem não deveria produzir um, mas uma árvore que
  // entra em recursão infinita derrubaria a página inteira.
  const rodadas = new Map<number, number>();
  const visitando = new Set<number>();
  function rodadaDe(id: number): number {
    const pronto = rodadas.get(id);
    if (pronto !== undefined) return pronto;
    if (visitando.has(id)) return 0;
    visitando.add(id);
    const pais = entradas.get(id) ?? [];
    const r = pais.length === 0 ? 0 : 1 + Math.max(...pais.map((p) => rodadaDe(p.psId)));
    visitando.delete(id);
    rodadas.set(id, r);
    return r;
  }
  for (const id of ids) rodadaDe(id);

  // Lado da chave, resolvido da raiz para as folhas (rodada crescente):
  // - sem entrada          -> chave superior (é uma partida de abertura)
  // - recebe algum perdedor -> chave inferior
  // - só vencedores        -> herda o lado de quem alimenta; se vier dos
  //   dois lados, é a grande final.
  const lados = new Map<number, LadoChave>();
  const ordenados = [...ids].sort((a, b) => rodadaDe(a) - rodadaDe(b));
  for (const id of ordenados) {
    const pais = entradas.get(id) ?? [];
    if (pais.length === 0) {
      lados.set(id, "superior");
      continue;
    }
    if (pais.some((p) => p.tipo === "loser")) {
      lados.set(id, "inferior");
      continue;
    }
    const ladosPais = pais.map((p) => lados.get(p.psId) ?? "superior");
    const temSuperior = ladosPais.includes("superior");
    const temInferior = ladosPais.includes("inferior");
    lados.set(id, temSuperior && temInferior ? "final" : temInferior ? "inferior" : "superior");
  }

  const nos: NoChave[] = [...ids].map((psId) => ({
    psId,
    partida: porPsId.get(psId) ?? null,
    lado: lados.get(psId) ?? "superior",
    rodada: rodadas.get(psId) ?? 0,
    origens: entradas.get(psId) ?? [],
  }));

  /** Agrupa em colunas por rodada, compactando os saltos de numeração. */
  function colunas(lista: NoChave[]): NoChave[][] {
    const distintas = [...new Set(lista.map((n) => n.rodada))].sort((a, b) => a - b);
    return distintas.map((r) =>
      lista
        .filter((n) => n.rodada === r)
        .sort((a, b) => a.psId - b.psId)
    );
  }

  return {
    superior: colunas(nos.filter((n) => n.lado === "superior")),
    inferior: colunas(nos.filter((n) => n.lado === "inferior")),
    final: nos.filter((n) => n.lado === "final").sort((a, b) => a.rodada - b.rodada),
    total: nos.length,
  };
}

/** "Upper bracket final: NS vs GE" -> "Upper bracket final". */
function rotuloRodada(nome: string | null) {
  if (!nome) return null;
  const corte = nome.indexOf(":");
  return corte > 0 ? nome.slice(0, corte).trim() : nome.trim();
}

/** Um lado do confronto, com escudo e placar. */
function Lado({
  nome,
  sigla,
  imagem,
  imagemDark,
  placar,
  venceu,
  perdeu,
}: {
  nome: string;
  sigla: string | null;
  imagem: string | null;
  imagemDark: string | null;
  placar: number | null;
  venceu: boolean;
  perdeu: boolean;
}) {
  return (
    <div className={`chave-lado${venceu ? " venceu" : ""}${perdeu ? " perdeu" : ""}`}>
      <Avatar
        nome={nome}
        sigla={sigla}
        imagemUrl={logoDeTime({ image_url: imagem, dark_mode_image_url: imagemDark })}
        tamanho="sm"
      />
      <span className="chave-nome">{nome}</span>
      <span className="chave-placar">{placar ?? "–"}</span>
    </div>
  );
}

function NoCard({ no, mapa }: { no: NoChave; mapa: Map<number, NoChave> }) {
  const p = no.partida;
  const rotulo = rotuloRodada(p?.nome ?? null);

  if (!p) {
    // Nó ainda indefinido. Em vez de sumir com ele, dizemos de onde os
    // participantes virão — é a informação que existe neste momento.
    return (
      <div className="chave-no chave-no-tbd">
        <div className="chave-topo">
          <span className="chave-rotulo">{rotulo ?? "Confronto a definir"}</span>
          <Tag>a definir</Tag>
        </div>
        {no.origens.map((o) => {
          const origem = mapa.get(o.psId);
          const de = rotuloRodada(origem?.partida?.nome ?? null);
          return (
            <div className="chave-lado chave-lado-tbd" key={`${o.psId}-${o.tipo}`}>
              <span className="chave-nome">
                {o.tipo === "winner" ? "Vencedor" : "Perdedor"}
                {de ? ` de ${de}` : " da chave"}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  const venceuA = p.winner_team_id === p.team_a_id;
  const venceuB = p.winner_team_id === p.team_b_id;
  const decidida = p.winner_team_id != null;

  return (
    <div className="chave-no">
      <div className="chave-topo">
        <span className="chave-rotulo">{rotulo ?? "Partida"}</span>
        {p.status === "live" ? (
          <Tag tom="success" ponto>
            ao vivo
          </Tag>
        ) : (
          p.number_of_games != null && (
            <span className="chave-md">MD{p.number_of_games}</span>
          )
        )}
      </div>
      <Lado
        nome={p.team_a_name}
        sigla={p.team_a_acronym}
        imagem={p.team_a_image}
        imagemDark={p.team_a_dark_image}
        placar={p.team_a_score}
        venceu={venceuA}
        perdeu={decidida && !venceuA}
      />
      <Lado
        nome={p.team_b_name}
        sigla={p.team_b_acronym}
        imagem={p.team_b_image}
        imagemDark={p.team_b_dark_image}
        placar={p.team_b_score}
        venceu={venceuB}
        perdeu={decidida && !venceuB}
      />
    </div>
  );
}

function Colunas({
  titulo,
  colunas,
  mapa,
}: {
  titulo: string;
  colunas: NoChave[][];
  mapa: Map<number, NoChave>;
}) {
  if (colunas.length === 0) return null;
  return (
    <div className="chave-bloco">
      <div className="chave-bloco-titulo">{titulo}</div>
      {/* Rola na horizontal: uma chave de 5 rodadas não cabe em 1100px,
          e encolher os cards tornaria os nomes ilegíveis. */}
      <div className="chave-scroll">
        <div className="chave-colunas">
          {colunas.map((coluna, i) => (
            <div className="chave-coluna" key={i}>
              <div className="chave-coluna-titulo">Rodada {i + 1}</div>
              {coluna.map((no) => (
                <NoCard key={no.psId} no={no} mapa={mapa} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ArvoreChave({ chave }: { chave: Chave }) {
  const mapa = new Map<number, NoChave>();
  for (const grupo of [...chave.superior, ...chave.inferior, chave.final]) {
    for (const no of grupo) mapa.set(no.psId, no);
  }

  return (
    <div className="stack stack-4">
      <Colunas
        titulo={chave.inferior.length > 0 ? "Chave superior" : "Eliminatória"}
        colunas={chave.superior}
        mapa={mapa}
      />
      <Colunas titulo="Chave inferior" colunas={chave.inferior} mapa={mapa} />
      {chave.final.length > 0 && (
        <Colunas titulo="Final" colunas={[chave.final]} mapa={mapa} />
      )}
    </div>
  );
}
