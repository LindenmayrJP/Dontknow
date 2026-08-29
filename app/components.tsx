import Link from "next/link";
import type {
  PartidaResumo,
  TeamSummary,
  TorneioResumo,
} from "@/db/queries";
import { Avatar, Tag, TagJogo } from "./ui";
import { logoDeTime } from "./ui/avatar";

/**
 * Componentes de conteúdo do Módulo 3.
 *
 * As primitivas visuais (avatar, tag) vivem em `app/ui` — aqui ficam só
 * as composições ligadas ao dado da wiki.
 *
 * Os apelidos `Badge`/`GameTag` do Módulo 3 foram removidos no 3.11:
 * existiam só enquanto as telas antigas não usavam `Avatar`/`TagJogo`
 * direto, e manter dois nomes para a mesma coisa convida a divergir.
 */
export function TeamCard({ team }: { team: TeamSummary }) {
  return (
    <Link className="card" href={`/times/${team.id}`}>
      <div className="row">
        <Avatar
          nome={team.name}
          sigla={team.acronym}
          imagemUrl={logoDeTime(team)}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {team.name}
          </div>
          <div className="small muted">
            <TagJogo jogo={team.game} />{" "}
            {team.region ? `${team.region} · ` : ""}
            {team.roster_size} no elenco
          </div>
        </div>
      </div>
    </Link>
  );
}

/** Data curta; a hora só aparece quando ainda importa (partida futura). */
function quando(d: Date | null, comHora: boolean) {
  if (!d) return "a definir";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    ...(comHora ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(d));
}

/**
 * Linha de partida com escudo dos dois lados.
 *
 * Mostra placar quando existe e horário quando não — o mesmo componente
 * serve para resultado, partida ao vivo e partida agendada, porque a
 * diferença entre os três está no dado, não no layout.
 */
export function LinhaPartida({ partida }: { partida: PartidaResumo }) {
  const encerrada = partida.status === "finished";
  const temPlacar = partida.team_a_score != null && partida.team_b_score != null;
  const venceuA = partida.winner_team_id === partida.team_a_id;
  const venceuB = partida.winner_team_id === partida.team_b_id;

  return (
    <div className="match">
      <div className="when">
        {quando(partida.scheduled_at, !encerrada)}
        {partida.status === "live" && (
          <div style={{ marginTop: 2 }}>
            <Tag tom="success" ponto>
              ao vivo
            </Tag>
          </div>
        )}
      </div>

      <div className="match-duelo">
        <div className="match-lado">
          <Avatar
            nome={partida.team_a_name}
            sigla={partida.team_a_acronym}
            imagemUrl={logoDeTime({
              image_url: partida.team_a_image,
              dark_mode_image_url: partida.team_a_dark_image,
            })}
            tamanho="sm"
          />
          <Link
            href={`/times/${partida.team_a_id}`}
            className={`nome${encerrada && venceuB ? " loss" : ""}`}
          >
            {partida.team_a_name}
          </Link>
        </div>

        <span className="score">
          {temPlacar ? (
            `${partida.team_a_score} – ${partida.team_b_score}`
          ) : (
            <span className="muted small">vs</span>
          )}
        </span>

        <div className="match-lado">
          <Avatar
            nome={partida.team_b_name}
            sigla={partida.team_b_acronym}
            imagemUrl={logoDeTime({
              image_url: partida.team_b_image,
              dark_mode_image_url: partida.team_b_dark_image,
            })}
            tamanho="sm"
          />
          <Link
            href={`/times/${partida.team_b_id}`}
            className={`nome${encerrada && venceuA ? " loss" : ""}`}
          >
            {partida.team_b_name}
          </Link>
        </div>
      </div>

      <div className="small muted" style={{ textAlign: "right", maxWidth: 220 }}>
        <span className="nome" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {partida.tournament_name}
        </span>
      </div>
    </div>
  );
}

/** Lista de partidas com estado vazio próprio. */
export function ListaPartidas({
  partidas,
  vazio,
}: {
  partidas: PartidaResumo[];
  vazio: string;
}) {
  if (partidas.length === 0) return <div className="empty">{vazio}</div>;
  return (
    <div className="matches">
      {partidas.map((p) => (
        <LinhaPartida key={p.id} partida={p} />
      ))}
    </div>
  );
}

/**
 * Card de torneio.
 *
 * A barra de progresso usa partidas encerradas sobre o total — é o único
 * sinal de andamento que o tier gratuito dá, e responde à pergunta que o
 * usuário faz olhando a home: "isso está começando ou terminando?".
 */
export function CardTorneio({ torneio }: { torneio: TorneioResumo }) {
  const progresso =
    torneio.partidas > 0
      ? Math.round((torneio.encerradas / torneio.partidas) * 100)
      : 0;

  return (
    <div className="card">
      <div className="row row-between" style={{ alignItems: "flex-start", gap: "var(--space-3)" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{torneio.name}</div>
          <div className="torneio-meta">
            <TagJogo jogo={torneio.game} />
            {torneio.league_name && <span>{torneio.league_name}</span>}
            <span>·</span>
            <span>
              {quando(torneio.start_date, false)} – {quando(torneio.end_date, false)}
            </span>
          </div>
        </div>
        {torneio.ao_vivo > 0 ? (
          <Tag tom="success" ponto>
            {torneio.ao_vivo} ao vivo
          </Tag>
        ) : (
          <Tag tom={torneio.em_andamento ? "accent" : "neutro"}>
            {torneio.em_andamento ? "Em andamento" : "Em breve"}
          </Tag>
        )}
      </div>

      {torneio.partidas > 0 && (
        <>
          <div className="barra-progresso" title={`${torneio.encerradas} de ${torneio.partidas} partidas encerradas`}>
            <span style={{ width: `${progresso}%` }} />
          </div>
          <div className="xs dim" style={{ marginTop: "var(--space-2)" }}>
            {torneio.encerradas} de {torneio.partidas} partidas encerradas
          </div>
        </>
      )}
    </div>
  );
}
