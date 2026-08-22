import { search } from "@/db/queries";
import { PlayerCard, TeamCard } from "../components";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const term = (q ?? "").trim();

  if (term.length < 2) {
    return (
      <>
        <h1>Busca</h1>
        <div className="empty">Digite ao menos 2 caracteres para buscar.</div>
      </>
    );
  }

  const { teams, players } = await search(term);
  const total = teams.length + players.length;

  return (
    <>
      <h1>Busca</h1>
      <p className="muted small">
        {total === 0 ? "Nenhum resultado" : `${total} resultado(s)`} para “{term}”
      </p>

      {total === 0 && (
        <div className="empty">
          Nada encontrado. O banco só tem o que a última sync trouxe — rode{" "}
          <code>npm run sync</code> com <code>PANDASCORE_MAX_PAGES</code> maior
          para ampliar a cobertura.
        </div>
      )}

      {teams.length > 0 && (
        <>
          <h2>Times ({teams.length})</h2>
          <div className="grid">
            {teams.map((t) => (
              <TeamCard key={t.id} team={t} />
            ))}
          </div>
        </>
      )}

      {players.length > 0 && (
        <>
          <h2>Jogadores ({players.length})</h2>
          <div className="grid">
            {players.map((p) => (
              <PlayerCard key={p.id} player={p} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
