import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getPlayer,
  getPlayerMemberships,
  getTrackedStatus,
} from "@/db/queries";
import { Badge, GameTag } from "../../components";

export const dynamic = "force-dynamic";

function fmt(d: Date | null) {
  return d ? new Intl.DateTimeFormat("pt-BR").format(new Date(d)) : "—";
}

/** Tempo decorrido desde o início da partida, para o status ao vivo. */
function elapsed(since: Date) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60000));
  return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}min`;
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const playerId = Number(id);
  if (!Number.isInteger(playerId)) notFound();

  const player = await getPlayer(playerId);
  if (!player) notFound();

  const [memberships, status] = await Promise.all([
    getPlayerMemberships(playerId),
    getTrackedStatus(playerId),
  ]);

  const current = memberships.find((m) => m.left_at === null) ?? null;
  const history = memberships.filter((m) => m.left_at !== null);

  return (
    <>
      <div className="crumb">
        {current ? (
          <>
            <Link href="/">Times</Link> /{" "}
            <Link href={`/times/${current.team_id}`}>{current.team_name}</Link> /{" "}
          </>
        ) : (
          <>
            <Link href="/">Times</Link> /{" "}
          </>
        )}
        {player.name}
      </div>

      <div className="row" style={{ gap: 16, marginBottom: 8 }}>
        <Badge name={player.name} />
        <div>
          <h1>{player.name}</h1>
          <div className="small muted">
            {player.role ?? "função não informada"}
            {player.nationality && <> · {player.nationality}</>}
            {current && (
              <>
                {" · "}
                <GameTag game={current.game} />
              </>
            )}
          </div>
        </div>
      </div>

      <h2>Time atual</h2>
      {current ? (
        <Link className="card" href={`/times/${current.team_id}`}>
          <div className="row">
            <Badge name={current.team_name} />
            <div>
              <div style={{ fontWeight: 600 }}>{current.team_name}</div>
              <div className="small muted">
                {current.org_name} · desde {fmt(current.joined_at)}
              </div>
            </div>
          </div>
        </Link>
      ) : (
        <div className="empty">Sem time ativo registrado.</div>
      )}

      <h2>Status ao vivo</h2>
      {status ? (
        status.in_game ? (
          <div className="status-live">
            <div className="row" style={{ gap: 10 }}>
              <span className="tag live">em partida agora</span>
              <strong>{status.current_game_mode ?? "partida"}</strong>
            </div>
            <div className="small muted" style={{ marginTop: 8 }}>
              {status.current_game_started_at && (
                <>Há {elapsed(status.current_game_started_at)} · </>
              )}
              {status.current_game_champion_id != null && (
                <>campeão #{status.current_game_champion_id} · </>
              )}
              Riot ID {status.riot_id} · atualizado{" "}
              {new Intl.DateTimeFormat("pt-BR", {
                hour: "2-digit", minute: "2-digit",
              }).format(new Date(status.updated_at))}
            </div>
          </div>
        ) : (
          <div className="card">
            <span className="tag">fora de partida</span>
            <div className="small muted" style={{ marginTop: 8 }}>
              Riot ID {status.riot_id}
              {status.summoner_level != null && <> · nível {status.summoner_level}</>}{" "}
              · verificado{" "}
              {new Intl.DateTimeFormat("pt-BR", {
                hour: "2-digit", minute: "2-digit",
              }).format(new Date(status.updated_at))}
            </div>
          </div>
        )
      ) : (
        <div className="empty">
          Este jogador não está na lista de rastreamento da Riot
          (<code>worker/tracked-players.json</code>).
        </div>
      )}

      <h2>Histórico de times</h2>
      {history.length === 0 ? (
        <div className="empty">
          Nenhuma passagem anterior registrada. O histórico começa a se formar
          quando a sync detecta o jogador saindo de um elenco.
        </div>
      ) : (
        <table className="plain">
          <thead>
            <tr>
              <th>Time</th>
              <th>Jogo</th>
              <th>Entrada</th>
              <th>Saída</th>
            </tr>
          </thead>
          <tbody>
            {history.map((m) => (
              <tr key={`${m.team_id}-${String(m.joined_at)}`}>
                <td>
                  <Link href={`/times/${m.team_id}`} style={{ fontWeight: 600 }}>
                    {m.team_name}
                  </Link>
                </td>
                <td><GameTag game={m.game} /></td>
                <td className="muted small">{fmt(m.joined_at)}</td>
                <td className="muted small">{fmt(m.left_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
