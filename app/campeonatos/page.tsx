import { listTorneiosAtivos } from "@/db/queries";
import { JOGOS_HABILITADOS, rotuloDoRecorte } from "../jogos";
import { CardTorneio } from "../components";
import { EmDesenvolvimento, Secao } from "../ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Campeonatos · Esports Hub" };

export default async function CampeonatosPage() {
  const torneios = await listTorneiosAtivos(JOGOS_HABILITADOS, 30);

  const emAndamento = torneios.filter((t) => t.em_andamento);
  const futuros = torneios.filter((t) => !t.em_andamento);

  return (
    <>
      <h1>Campeonatos</h1>
      <p className="muted small">
        Competições de {rotuloDoRecorte()} em andamento ou anunciadas.
      </p>

      <Secao titulo={`Em andamento (${emAndamento.length})`}>
        {emAndamento.length === 0 ? (
          <div className="empty">Nenhum campeonato em andamento agora.</div>
        ) : (
          <div className="grid grid-pares">
            {emAndamento.map((t) => (
              <CardTorneio key={t.id} torneio={t} />
            ))}
          </div>
        )}
      </Secao>

      <Secao titulo={`Em breve (${futuros.length})`}>
        {futuros.length === 0 ? (
          <div className="empty">Nenhum campeonato anunciado à frente.</div>
        ) : (
          <div className="grid grid-pares">
            {futuros.map((t) => (
              <CardTorneio key={t.id} torneio={t} />
            ))}
          </div>
        )}
      </Secao>

      {/* O dado destas duas telas já está sincronizado no banco desde o
          Módulo 3.6 — falta só a página do torneio (Módulo 3.12). */}
      <Secao titulo="Ainda não disponível">
        <div className="stack stack-4">
          <EmDesenvolvimento lacuna="chaveamento" />
          <EmDesenvolvimento lacuna="classificacao" />
        </div>
      </Secao>
    </>
  );
}
