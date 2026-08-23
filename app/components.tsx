import Link from "next/link";
import type { Game, MatchRow, PlayerSummary, TeamSummary } from "@/db/queries";
import { Avatar, Tag, TagJogo } from "./ui";

/**
 * Componentes de conteúdo do Módulo 3.
 *
 * As primitivas visuais (avatar, tag) vivem em `app/ui` — aqui ficam só
 * as composições ligadas ao dado da wiki. `Badge` e `GameTag` seguem
 * exportados como apelidos para não quebrar as páginas que já os usam.
 */
export const Badge = ({ name, acronym }: { name: string; acronym?: string | null }) => (
  <Avatar nome={name} sigla={acronym} />
);

export const GameTag = ({ game }: { game: Game }) => <TagJogo jogo={game} />;

export function TeamCard({ team }: { team: TeamSummary }) {
  return (
    <Link className="card" href={`/times/${team.id}`}>
      <div className="row">
        <Badge name={team.name} acronym={team.acronym} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {team.name}
          </div>
          <div className="small muted">
            <GameTag game={team.game} />{" "}
            {team.region ? `${team.region} · ` : ""}
            {team.roster_size} no elenco
          </div>
        </div>
      </div>
    </Link>
  );
}

export function PlayerCard({ player }: { player: PlayerSummary }) {
  return (
    <Link className="card" href={`/jogadores/${player.id}`}>
      <div className="row">
        <Badge name={player.name} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{player.name}</div>
          <div className="small muted">
            {player.role ? `${player.role} · ` : ""}
            {player.team_name ?? "sem time"}
          </div>
        </div>
      </div>
    </Link>
  );
}

function formatDate(d: Date | null) {
  if (!d) return "a definir";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(d));
}

export function MatchList({ matches, teamId }: { matches: MatchRow[]; teamId?: number }) {
  if (matches.length === 0) {
    return <div className="empty">Nenhuma partida no banco ainda.</div>;
  }

  return (
    <div className="matches">
      {matches.map((m) => {
        const finished = m.status === "finished";
        const won = teamId != null && m.winner_team_id === teamId;
        const lost = teamId != null && finished && m.winner_team_id != null && !won;

        return (
          <div className="match" key={m.id}>
            <div className="when">
              {formatDate(m.scheduled_at)}
              {m.status === "live" && <> · <Tag tom="success" ponto>ao vivo</Tag></>}
            </div>
            <div className="teams">
              <Link href={`/times/${m.team_a_id}`}>{m.team_a_name}</Link>
              <span className="muted">vs</span>
              <Link href={`/times/${m.team_b_id}`}>{m.team_b_name}</Link>
              <span className="small muted">· {m.tournament_name}</span>
            </div>
            <div className={`score ${won ? "win" : lost ? "loss" : ""}`}>
              {finished && m.team_a_score != null
                ? `${m.team_a_score} – ${m.team_b_score}`
                : <span className="muted small">agendada</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SearchBox({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <form className="searchbox" action="/busca">
      <input
        name="q"
        defaultValue={defaultValue}
        placeholder="Buscar time ou jogador…"
        aria-label="Buscar time ou jogador"
      />
      <button type="submit">Buscar</button>
    </form>
  );
}
