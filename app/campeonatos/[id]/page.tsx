import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getArestasChave,
  getClassificacao,
  getTorneio,
  getTorneioPartidas,
  type LinhaClassificacao,
  type PartidaTorneio,
} from "@/db/queries";
import { LinhaPartida } from "../../components";
import {
  ArvoreChave,
  Avatar,
  Card,
  type Coluna,
  DataTable,
  EstadoVazio,
  logoDeTime,
  montarChave,
  Secao,
  Stat,
  TagJogo,
} from "../../ui";

export const dynamic = "force-dynamic";

const dataLonga = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
});
const dataCurta = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function periodo(inicio: Date | null, fim: Date | null) {
  if (!inicio && !fim) return null;
  if (!fim) return `desde ${dataCurta.format(new Date(inicio!))}`;
  if (!inicio) return `até ${dataCurta.format(new Date(fim))}`;
  return `${dataCurta.format(new Date(inicio))} – ${dataCurta.format(new Date(fim))}`;
}

/** Chave de agrupamento por dia; partida sem data cai num grupo próprio. */
function diaDe(p: PartidaTorneio) {
  if (!p.scheduled_at) return "sem-data";
  return new Date(p.scheduled_at).toISOString().slice(0, 10);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTorneio(Number(id));
  return { title: t ? `${t.name} · Esports Hub` : "Campeonato · Esports Hub" };
}

export default async function TorneioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const torneioId = Number(id);
  if (!Number.isInteger(torneioId)) notFound();

  const torneio = await getTorneio(torneioId);
  if (!torneio) notFound();

  const [partidas, classificacao, arestas] = await Promise.all([
    getTorneioPartidas(torneioId),
    getClassificacao(torneioId),
    getArestasChave(torneioId),
  ]);

  const chave = montarChave(arestas, partidas);

  // Agrupa o calendário por dia, em ordem cronológica — é assim que um
  // calendário de torneio se lê, do primeiro ao último dia.
  const dias = new Map<string, PartidaTorneio[]>();
  for (const p of partidas) {
    const d = diaDe(p);
    dias.set(d, [...(dias.get(d) ?? []), p]);
  }

  const colunasTabela: Coluna<LinhaClassificacao>[] = [
    {
      cabecalho: "#",
      largura: "48px",
      numerica: true,
      celula: (l) => l.rank,
    },
    {
      cabecalho: "Time",
      celula: (l) => (
        <Link href={`/times/${l.team_id}`} className="resultado">
          <Avatar
            nome={l.team_name}
            sigla={l.team_acronym}
            imagemUrl={logoDeTime(l)}
            tamanho="sm"
          />
          <span style={{ fontWeight: 600 }}>{l.team_name}</span>
        </Link>
      ),
    },
  ];

  const intervalo = periodo(torneio.start_date, torneio.end_date);

  return (
    <>
      <div className="crumb">
        <Link href="/campeonatos">Campeonatos</Link> / {torneio.name}
      </div>

      {/* ---------------- Identificação ----------------
          Sem avatar: torneio não tem logo na fonte, e um quadrado de
          iniciais aqui seria enfeite sem informação. */}
      <div className="ficha-topo" style={{ display: "block" }}>
        <h1 style={{ margin: 0 }}>{torneio.name}</h1>
        <div className="row wrapped" style={{ gap: "var(--space-2)", marginTop: 8 }}>
          <TagJogo jogo={torneio.game} />
          {torneio.league_name && (
            <span className="small dim">· {torneio.league_name}</span>
          )}
          {torneio.serie_name && (
            <span className="small dim">· {torneio.serie_name}</span>
          )}
          {intervalo && <span className="small dim">· {intervalo}</span>}
        </div>
      </div>

      <Secao titulo="Resumo">
        <div className="grid grid-stats">
          <Stat valor={torneio.partidas} rotulo="Partidas" />
          <Stat
            valor={torneio.encerradas}
            rotulo="Encerradas"
            dica={
              torneio.partidas > 0
                ? `${Math.round((torneio.encerradas / torneio.partidas) * 100)}% do total`
                : undefined
            }
          />
          <Stat valor={torneio.times} rotulo="Times" />
          <Stat
            valor={
              torneio.formatos.length === 1
                ? `MD${torneio.formatos[0]}`
                : torneio.formatos.length > 1
                  ? torneio.formatos.map((f) => `MD${f}`).join(" / ")
                  : "—"
            }
            rotulo="Formato"
            dica={torneio.formatos.length === 0 ? "não informado" : undefined}
          />
        </div>
      </Secao>

      {/* ---------------- Chaveamento ---------------- */}
      <Secao titulo="Chaveamento">
        {chave.total === 0 ? (
          <EstadoVazio titulo="Este campeonato não tem chave">
            A origem não publica chaveamento para esta competição — é o
            normal em fase de grupos e liga corrida, onde não há árvore de
            eliminação. Não é dado faltando.
          </EstadoVazio>
        ) : (
          <ArvoreChave chave={chave} />
        )}
      </Secao>

      {/* ---------------- Classificação ----------------
          Ausência aqui é estado normal, não lacuna do produto: torneio de
          chave direta simplesmente não publica tabela, e a origem
          responde 404 (ver Módulo 3.6). Por isso EstadoVazio, e não o
          componente "em desenvolvimento". */}
      <Secao titulo="Classificação">
        {classificacao.length === 0 ? (
          <EstadoVazio titulo="Sem tabela de classificação">
            Este campeonato não publica classificação na origem. Acontece
            com formatos de eliminação direta, em que a colocação só existe
            no fim.
          </EstadoVazio>
        ) : (
          <>
            <Card flush>
              <DataTable
                colunas={colunasTabela}
                linhas={classificacao}
                chave={(l) => l.team_id}
              />
            </Card>
            <p className="xs dim" style={{ marginTop: "var(--space-3)" }}>
              A origem fornece apenas a colocação — não há vitórias,
              derrotas nem saldo no tier gratuito. Posições empatadas
              aparecem com o mesmo número.
            </p>
          </>
        )}
      </Secao>

      {/* ---------------- Calendário ---------------- */}
      <Secao titulo={`Calendário (${partidas.length})`}>
        {partidas.length === 0 ? (
          <EstadoVazio titulo="Nenhuma partida registrada">
            A sincronização ainda não trouxe partidas para este campeonato.
          </EstadoVazio>
        ) : (
          [...dias.entries()].map(([dia, doDia]) => (
            <div key={dia}>
              <div className="dia-titulo">
                {dia === "sem-data"
                  ? "Data a definir"
                  : dataLonga.format(new Date(`${dia}T12:00:00`))}
              </div>
              <div className="matches">
                {doDia.map((p) => (
                  <LinhaPartida key={p.id} partida={p} />
                ))}
              </div>
            </div>
          ))
        )}
      </Secao>
    </>
  );
}
