import { listPartidas } from "@/db/queries";
import { JOGOS_HABILITADOS } from "../jogos";
import { ListaPartidas } from "../components";
import { EmDesenvolvimento, Secao } from "../ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Ao vivo · Esports Hub" };

/**
 * Prévia do Módulo 4.
 *
 * O acompanhamento em tempo real (placar por round, atualização por
 * push) ainda não existe. Mas o estado `live` das partidas já vem do
 * worker, então dá para mostrar o que está rolando agora sem prometer o
 * que a tela ainda não faz — melhor que uma seção morta na navegação.
 */
export default async function AoVivoPage() {
  const jogos = JOGOS_HABILITADOS;

  const [aoVivo, proximas] = await Promise.all([
    listPartidas(jogos, "ao-vivo", 20),
    listPartidas(jogos, "proximas", 10),
  ]);

  return (
    <>
      <h1>Ao vivo</h1>
      <p className="muted small">
        Partidas em andamento segundo a última sincronização.
      </p>

      <Secao titulo={`Acontecendo agora (${aoVivo.length})`}>
        <ListaPartidas
          partidas={aoVivo}
          vazio="Nenhuma partida em andamento neste momento."
        />
      </Secao>

      <Secao titulo="A seguir">
        <ListaPartidas
          partidas={proximas}
          vazio="Nenhuma partida agendada à frente."
        />
      </Secao>

      <Secao titulo="O que ainda falta">
        <EmDesenvolvimento
          titulo="Acompanhamento em tempo real"
          motivo="planejado"
          detalhe={
            <>
              Esta página mostra o estado da última sincronização, não um
              placar que se move sozinho. Atualização ao vivo por round,
              com push para o navegador, é o Módulo 4.
            </>
          }
        />
      </Secao>
    </>
  );
}
