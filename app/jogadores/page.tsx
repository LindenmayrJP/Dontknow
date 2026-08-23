import Link from "next/link";
import { listJogadores } from "@/db/queries";
import { JOGOS_HABILITADOS, rotuloDoRecorte } from "../jogos";
import { Avatar } from "../ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Jogadores · Esports Hub" };

export default async function JogadoresPage() {
  const jogadores = await listJogadores(JOGOS_HABILITADOS, 60);

  return (
    <>
      <h1>Jogadores</h1>
      <p className="muted small">
        {jogadores.length} jogadores com vínculo ativo em times de{" "}
        {rotuloDoRecorte()}, agrupados por time.
      </p>

      {jogadores.length === 0 ? (
        <div className="empty">
          Nenhum jogador no banco. Rode <code>npm run sync</code> para popular.
        </div>
      ) : (
        <div className="grid">
          {jogadores.map((j) => (
            <Link className="card" href={`/jogadores/${j.id}`} key={j.id}>
              <div className="row">
                {/* Só ~21% dos jogadores têm foto na fonte: aqui o fallback
                    de iniciais é o caso comum, não a exceção. */}
                <Avatar nome={j.name} imagemUrl={j.image_url} redondo />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{j.name}</div>
                  <div className="small muted">
                    {j.team_name ?? "sem time"}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
