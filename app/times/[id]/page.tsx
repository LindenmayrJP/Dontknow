import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCampanhaTime,
  getTeam,
  getTeamMatches,
  getTeamRoster,
} from "@/db/queries";
import { ListaPartidas } from "../../components";
import {
  Avatar,
  Card,
  type Coluna,
  DataTable,
  EmDesenvolvimento,
  EstadoVazio,
  LacunaInline,
  logoDeTime,
  Secao,
  Stat,
  TagJogo,
} from "../../ui";

export const dynamic = "force-dynamic";

type LinhaRoster = Awaited<ReturnType<typeof getTeamRoster>>[number];

const dataCurta = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const time = await getTeam(Number(id));
  return { title: time ? `${time.name} · Esports Hub` : "Time · Esports Hub" };
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const teamId = Number(id);
  if (!Number.isInteger(teamId)) notFound();

  const time = await getTeam(teamId);
  if (!time) notFound();

  const [roster, partidas, campanha] = await Promise.all([
    getTeamRoster(teamId),
    getTeamMatches(teamId),
    getCampanhaTime(teamId),
  ]);

  const encerradas = partidas.filter((m) => m.status === "finished");
  const futuras = partidas
    .filter((m) => m.status !== "finished")
    .sort(
      (a, b) =>
        (a.scheduled_at?.valueOf() ?? 0) - (b.scheduled_at?.valueOf() ?? 0)
    );

  // Só faz sentido falar em aproveitamento se houver partida decidida.
  const aproveitamento =
    campanha.vitorias + campanha.derrotas > 0
      ? Math.round(
          (campanha.vitorias / (campanha.vitorias + campanha.derrotas)) * 100
        )
      : null;

  const colunas: Coluna<LinhaRoster>[] = [
    {
      cabecalho: "Jogador",
      celula: (p) => (
        <Link href={`/jogadores/${p.id}`} className="resultado">
          <Avatar
            nome={p.name}
            imagemUrl={p.image_url}
            tamanho="sm"
            redondo
          />
          <span style={{ fontWeight: 600 }}>{p.name}</span>
        </Link>
      ),
    },
    {
      cabecalho: "Função",
      // Em Valorant a origem nunca preenche `role`, e a lacuna explica
      // por quê. Em LoL o campo existe, então lá um vazio é só um vazio
      // — mostrar o texto de Valorant ali confundiria.
      celula: (p) =>
        p.role ??
        (time.game === "valorant" ? (
          <LacunaInline lacuna="funcao-valorant" rotulo="não estruturada" />
        ) : (
          <span className="dim">—</span>
        )),
    },
    {
      cabecalho: "País",
      celula: (p) => p.nationality ?? <span className="dim">—</span>,
    },
    {
      cabecalho: "No elenco desde",
      celula: (p) => (
        <span className="muted small">
          {dataCurta.format(new Date(p.joined_at))}
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="crumb">
        <Link href="/times">Times</Link> / {time.name}
      </div>

      {/* ---------------- Identificação ---------------- */}
      <div className="ficha-topo">
        <Avatar
          nome={time.name}
          sigla={time.acronym}
          imagemUrl={logoDeTime(time)}
          tamanho="lg"
        />
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0 }}>{time.name}</h1>
          <div className="row wrapped" style={{ gap: "var(--space-2)", marginTop: 6 }}>
            <TagJogo jogo={time.game} />
            {time.acronym && (
              <span className="small dim">· {time.acronym}</span>
            )}
            {time.org_name !== time.name && (
              <span className="small dim">· {time.org_name}</span>
            )}
            {time.region && <span className="small dim">· {time.region}</span>}
          </div>
        </div>
      </div>

      {/* ---------------- Campanha ----------------
          Derivada de winner_team_id, que a origem preenche em 100% das
          partidas encerradas. É contagem, não estatística de jogo. */}
      <Secao titulo="Campanha">
        <div className="grid grid-stats">
          <Stat valor={campanha.partidas} rotulo="Partidas" />
          <Stat
            valor={campanha.vitorias}
            rotulo="Vitórias"
            tom={campanha.vitorias > 0 ? "up" : undefined}
          />
          <Stat
            valor={campanha.derrotas}
            rotulo="Derrotas"
            tom={campanha.derrotas > 0 ? "down" : undefined}
          />
          <Stat
            valor={aproveitamento === null ? "—" : `${aproveitamento}%`}
            rotulo="Aproveitamento"
            dica={aproveitamento === null ? "sem partida decidida" : undefined}
          />
          <Stat valor={campanha.torneios} rotulo="Campeonatos" />
        </div>
        <p className="xs dim" style={{ marginTop: "var(--space-3)" }}>
          Contado sobre as partidas que estão no banco, não sobre a carreira
          inteira do time — a sincronização cobre um recorte recente da
          fonte.
        </p>
      </Secao>

      {/* ---------------- Elenco ---------------- */}
      <Secao titulo={`Elenco (${roster.length})`}>
        {roster.length === 0 ? (
          <EstadoVazio titulo="Nenhum jogador vinculado a este time">
            A fonte não traz elenco para este time. Acontece com boa parte
            dos times registrados — é estado real da origem, não falha de
            ingestão.
          </EstadoVazio>
        ) : (
          <>
            <p className="notice">
              Elenco completo como a fonte registra. O PandaScore não
              distingue titular de reserva no tier gratuito, então a lista
              pode misturar os dois — não inferimos titularidade.
            </p>
            <Card flush>
              <DataTable colunas={colunas} linhas={roster} chave={(p) => p.id} />
            </Card>
          </>
        )}
      </Secao>

      {/* ---------------- Partidas ---------------- */}
      {futuras.length > 0 && (
        <Secao titulo={`Próximas partidas (${futuras.length})`}>
          <ListaPartidas partidas={futuras} vazio="" />
        </Secao>
      )}

      <Secao titulo="Últimos resultados">
        <ListaPartidas
          partidas={encerradas.slice(0, 15)}
          vazio="Nenhuma partida encerrada deste time no banco."
        />
      </Secao>

      {/* ---------------- Roadmap ----------------
          Seção mantida de propósito: some-la faria parecer que o produto
          nunca pensou nesses dados. Cada uma diz por que falta. */}
      <Secao titulo="Ainda não disponível">
        <div className="stack stack-4">
          <EmDesenvolvimento lacuna="coach" />
          <EmDesenvolvimento lacuna="stats-jogador" />
          <EmDesenvolvimento lacuna="titular-reserva" />
        </div>
      </Secao>
    </>
  );
}
