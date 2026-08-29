import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getPlayer,
  getPlayerMemberships,
  getTrackedStatus,
  type VinculoJogador,
} from "@/db/queries";
import {
  Avatar,
  Card,
  type Coluna,
  DataTable,
  EmDesenvolvimento,
  EstadoVazio,
  logoDeTime,
  Secao,
  Tag,
  TagJogo,
  LacunaInline,
} from "../../ui";

export const dynamic = "force-dynamic";

const data = new Intl.DateTimeFormat("pt-BR");
const hora = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

function fmt(d: Date | null) {
  return d ? data.format(new Date(d)) : "—";
}

/** Tempo decorrido desde o início da partida, para o status ao vivo. */
function decorrido(desde: Date) {
  const mins = Math.max(
    0,
    Math.floor((Date.now() - new Date(desde).getTime()) / 60000)
  );
  return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}min`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const jogador = await getPlayer(Number(id));
  return {
    title: jogador ? `${jogador.name} · Esports Hub` : "Jogador · Esports Hub",
  };
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const playerId = Number(id);
  if (!Number.isInteger(playerId)) notFound();

  const jogador = await getPlayer(playerId);
  if (!jogador) notFound();

  const [vinculos, status] = await Promise.all([
    getPlayerMemberships(playerId),
    getTrackedStatus(playerId),
  ]);

  const atual = vinculos.find((v) => v.left_at === null) ?? null;
  const anteriores = vinculos.filter((v) => v.left_at !== null);

  const colunas: Coluna<VinculoJogador>[] = [
    {
      cabecalho: "Time",
      celula: (v) => (
        <Link href={`/times/${v.team_id}`} className="resultado">
          <Avatar
            nome={v.team_name}
            sigla={v.team_acronym}
            imagemUrl={logoDeTime(v)}
            tamanho="sm"
          />
          <span style={{ fontWeight: 600 }}>{v.team_name}</span>
        </Link>
      ),
    },
    { cabecalho: "Jogo", celula: (v) => <TagJogo jogo={v.game} /> },
    {
      cabecalho: "Entrada",
      celula: (v) => <span className="muted small">{fmt(v.joined_at)}</span>,
    },
    {
      cabecalho: "Saída",
      celula: (v) => <span className="muted small">{fmt(v.left_at)}</span>,
    },
  ];

  return (
    <>
      <div className="crumb">
        <Link href="/jogadores">Jogadores</Link>
        {atual && (
          <>
            {" / "}
            <Link href={`/times/${atual.team_id}`}>{atual.team_name}</Link>
          </>
        )}
        {" / "}
        {jogador.name}
      </div>

      {/* ---------------- Identificação ----------------
          A foto existe para ~21% dos jogadores (6% nos elencos ativos de
          Valorant), então o layout é desenhado para as iniciais: avatar
          de tamanho fixo ao lado do nome, nunca uma imagem grande que
          deixaria um buraco quando faltasse. */}
      <div className="ficha-topo">
        <Avatar
          nome={jogador.name}
          imagemUrl={jogador.image_url}
          tamanho="lg"
          redondo
        />
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0 }}>{jogador.name}</h1>
          <div
            className="row wrapped"
            style={{ gap: "var(--space-2)", marginTop: 6 }}
          >
            {atual ? (
              <>
                <TagJogo jogo={atual.game} />
                <span className="small dim">·</span>
                <Link href={`/times/${atual.team_id}`} className="small">
                  {atual.team_name}
                </Link>
              </>
            ) : (
              <span className="small muted">Sem time ativo</span>
            )}
            {jogador.nationality && (
              <span className="small dim">· {jogador.nationality}</span>
            )}
            {jogador.role ? (
              <span className="small dim">· {jogador.role}</span>
            ) : (
              atual?.game === "valorant" && (
                <LacunaInline lacuna="funcao-valorant" rotulo="sem função" />
              )
            )}
          </div>
        </div>
      </div>

      {/* ---------------- Time atual ---------------- */}
      <Secao titulo="Time atual">
        {atual ? (
          <Card href={`/times/${atual.team_id}`}>
            <div className="resultado">
              <Avatar
                nome={atual.team_name}
                sigla={atual.team_acronym}
                imagemUrl={logoDeTime(atual)}
              />
              <span className="painel-texto">
                <span className="painel-nome">{atual.team_name}</span>
                <span className="painel-meta">
                  {[
                    atual.org_name !== atual.team_name ? atual.org_name : null,
                    `no elenco desde ${fmt(atual.joined_at)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <TagJogo jogo={atual.game} />
            </div>
          </Card>
        ) : (
          <EstadoVazio titulo="Sem time ativo registrado">
            Todas as passagens deste jogador estão encerradas na fonte. Pode
            ser aposentadoria, troca ainda não sincronizada ou simplesmente
            ausência de registro.
          </EstadoVazio>
        )}
      </Secao>

      {/* ---------------- Passagens anteriores ----------------
          Só aparece quando existe. Um "histórico vazio" para quem sempre
          teve um time só não é informação, é ruído: no banco de hoje
          apenas 7 jogadores têm mais de um vínculo. */}
      {anteriores.length > 0 && (
        <Secao titulo={`Passagens anteriores (${anteriores.length})`}>
          <Card flush>
            <DataTable
              colunas={colunas}
              linhas={anteriores}
              chave={(v) => `${v.team_id}-${String(v.joined_at)}`}
            />
          </Card>
        </Secao>
      )}

      {/* ---------------- Em partida agora ----------------
          Omitida quando o jogador não é rastreado: não é funcionalidade
          faltando, é seção que não se aplica a ele. Hoje a tabela de
          rastreamento está vazia (depende de RIOT_API_KEY), então na
          prática ela não aparece para ninguém. */}
      {status && (
        <Secao titulo="Em partida agora">
          {status.in_game ? (
            <Card>
              <div className="row wrapped">
                <Tag tom="success" ponto>
                  em partida
                </Tag>
                <strong>{status.current_game_mode ?? "partida"}</strong>
              </div>
              <div className="small muted" style={{ marginTop: "var(--space-2)" }}>
                {status.current_game_started_at && (
                  <>Há {decorrido(status.current_game_started_at)} · </>
                )}
                Riot ID {status.riot_id} · atualizado{" "}
                {hora.format(new Date(status.updated_at))}
              </div>
            </Card>
          ) : (
            <Card>
              <div className="row wrapped">
                <Tag>fora de partida</Tag>
                <span className="small muted">
                  Riot ID {status.riot_id}
                  {status.summoner_level != null && (
                    <> · nível {status.summoner_level}</>
                  )}{" "}
                  · verificado {hora.format(new Date(status.updated_at))}
                </span>
              </div>
            </Card>
          )}
        </Secao>
      )}

      {/* ---------------- Roadmap ----------------
          Os três têm motivos diferentes e o componente mostra isso: idade
          e carreira são "em breve", estatística é "bloqueado" por plano. */}
      <Secao titulo="Ainda não disponível">
        <div className="stack stack-4">
          <EmDesenvolvimento lacuna="idade-jogador" />
          <EmDesenvolvimento lacuna="tempo-carreira" />
          <EmDesenvolvimento lacuna="stats-jogador" />
        </div>
      </Secao>
    </>
  );
}
