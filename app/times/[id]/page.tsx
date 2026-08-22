import Link from "next/link";
import { notFound } from "next/navigation";
import {
  GAME_LABEL,
  getTeam,
  getTeamMatches,
  getTeamRoster,
} from "@/db/queries";
import { Badge, GameTag, MatchList } from "../../components";

export const dynamic = "force-dynamic";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const teamId = Number(id);
  if (!Number.isInteger(teamId)) notFound();

  const team = await getTeam(teamId);
  if (!team) notFound();

  const [roster, matches] = await Promise.all([
    getTeamRoster(teamId),
    getTeamMatches(teamId),
  ]);

  const finished = matches.filter((m) => m.status === "finished");
  const upcoming = matches
    .filter((m) => m.status !== "finished")
    .sort((a, b) => (a.scheduled_at?.valueOf() ?? 0) - (b.scheduled_at?.valueOf() ?? 0));

  return (
    <>
      <div className="crumb">
        <Link href="/">Times</Link> / {team.name}
      </div>

      <div className="row" style={{ gap: 16, marginBottom: 8 }}>
        <Badge name={team.name} acronym={team.acronym} />
        <div>
          <h1>{team.name}</h1>
          <div className="small muted">
            <GameTag game={team.game} /> {GAME_LABEL[team.game]}
            {team.org_name !== team.name && <> · organização: {team.org_name}</>}
            {team.region && <> · {team.region}</>}
          </div>
        </div>
      </div>

      <h2>Elenco atual ({roster.length})</h2>
      <p className="notice">
        O PandaScore não distingue titular de reserva no tier gratuito, então
        a lista abaixo é o elenco completo registrado — pode incluir reservas,
        substitutos e jogadores inativos. A informação de titularidade não
        está disponível.
      </p>

      {roster.length === 0 ? (
        <div className="empty">Nenhum jogador vinculado a este time no banco.</div>
      ) : (
        <table className="plain">
          <thead>
            <tr>
              <th>Jogador</th>
              <th>Função</th>
              <th>País</th>
              <th>No elenco desde</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/jogadores/${p.id}`} style={{ fontWeight: 600 }}>
                    {p.name}
                  </Link>
                </td>
                <td className="muted">{p.role ?? "—"}</td>
                <td className="muted">{p.nationality ?? "—"}</td>
                <td className="muted small">
                  {new Intl.DateTimeFormat("pt-BR").format(new Date(p.joined_at))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {upcoming.length > 0 && (
        <>
          <h2>Próximas partidas</h2>
          <MatchList matches={upcoming} teamId={teamId} />
        </>
      )}

      <h2>Últimos resultados</h2>
      <MatchList matches={finished.slice(0, 15)} teamId={teamId} />
    </>
  );
}
