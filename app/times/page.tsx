import { listTeams } from "@/db/queries";
import { JOGOS_HABILITADOS, rotuloDoRecorte } from "../jogos";
import { TeamCard } from "../components";

export const dynamic = "force-dynamic";

export const metadata = { title: "Times · Esports Hub" };

export default async function TimesPage() {
  const times = await listTeams(JOGOS_HABILITADOS, 60);

  return (
    <>
      <h1>Times</h1>
      <p className="muted small">
        {times.length} times de {rotuloDoRecorte()}, com elenco conhecido
        primeiro.
      </p>

      {times.length === 0 ? (
        <div className="empty">
          Nenhum time no banco. Rode <code>npm run sync</code> para popular.
        </div>
      ) : (
        <div className="grid">
          {times.map((t) => (
            <TeamCard key={t.id} team={t} />
          ))}
        </div>
      )}
    </>
  );
}
