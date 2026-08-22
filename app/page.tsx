import { getStats, listTeams, type Game } from "@/db/queries";
import { TeamCard } from "./components";

// Lê do banco a cada request: o worker atualiza o Postgres por fora, então
// pré-renderizar deixaria a página velha.
export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ jogo?: string }>;
}) {
  const { jogo } = await searchParams;
  const game = jogo === "lol" || jogo === "valorant" ? (jogo as Game) : undefined;

  const [stats, teams] = await Promise.all([getStats(), listTeams(game, 48)]);

  return (
    <>
      <h1>Times</h1>
      <p className="muted small">
        {stats.teams} times · {stats.players} jogadores · {stats.matches} partidas ·{" "}
        {stats.tournaments} torneios no banco
      </p>

      <h2>Filtrar por jogo</h2>
      <div className="row" style={{ gap: 8, marginBottom: 20 }}>
        <FilterLink label="Todos" href="/" active={!game} />
        <FilterLink label="League of Legends" href="/?jogo=lol" active={game === "lol"} />
        <FilterLink label="Valorant" href="/?jogo=valorant" active={game === "valorant"} />
      </div>

      {teams.length === 0 ? (
        <div className="empty">
          Nenhum time no banco. Rode <code>npm run sync</code> para popular.
        </div>
      ) : (
        <div className="grid">
          {teams.map((t) => (
            <TeamCard key={t.id} team={t} />
          ))}
        </div>
      )}
    </>
  );
}

function FilterLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <a
      href={href}
      className="tag"
      style={active ? { color: "var(--accent)", borderColor: "var(--accent)" } : undefined}
    >
      {label}
    </a>
  );
}
