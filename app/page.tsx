import Link from "next/link";
import {
  getStats,
  listPartidas,
  listTimesEmDestaque,
  listTorneiosAtivos,
} from "@/db/queries";
import { JOGOS_HABILITADOS, rotuloDoRecorte } from "./jogos";
import { CardTorneio, ListaPartidas, TeamCard } from "./components";
import { Secao, Stat } from "./ui";

// Lê do banco a cada request: o worker atualiza o Postgres por fora, então
// pré-renderizar deixaria a página velha.
export const dynamic = "force-dynamic";

export default async function Home() {
  const jogos = JOGOS_HABILITADOS;

  // Uma rodada só de banco para a página inteira. São seis queries curtas
  // e independentes — em série custariam seis vezes a latência do Neon.
  const [stats, torneios, aoVivo, recentes, proximas, destaques] =
    await Promise.all([
      getStats(jogos),
      listTorneiosAtivos(jogos, 4),
      listPartidas(jogos, "ao-vivo", 5),
      listPartidas(jogos, "recentes", 6),
      listPartidas(jogos, "proximas", 6),
      listTimesEmDestaque(jogos, 6),
    ]);

  return (
    <>
      <div className="hero">
        {/* Sem nome de jogo: o recorte é dito no subtítulo, que sai da
            lista de jogos habilitados. Um título cravado em "Valorant"
            passaria a mentir no dia em que LoL fosse ligado. */}
        <h1>Do elenco ao placar</h1>
        <p className="muted">
          Times, jogadores, campeonatos e resultados de {rotuloDoRecorte()} —
          reunidos e atualizados automaticamente.
        </p>
      </div>

      {/* Só aparece quando há partida rolando: uma seção "ao vivo" vazia
          na maior parte do dia treinaria o usuário a ignorá-la. */}
      {aoVivo.length > 0 && (
        <Secao
          titulo="Ao vivo agora"
          acao={
            <Link href="/ao-vivo" className="ver-todos">
              Ver tudo →
            </Link>
          }
        >
          <ListaPartidas partidas={aoVivo} vazio="" />
        </Secao>
      )}

      <Secao
        titulo="Campeonatos"
        acao={
          <Link href="/campeonatos" className="ver-todos">
            Ver todos →
          </Link>
        }
      >
        {torneios.length === 0 ? (
          <div className="empty">
            Nenhum campeonato em andamento ou anunciado. Rode{" "}
            <code>npm run sync</code> para atualizar.
          </div>
        ) : (
          <div className="grid grid-pares">
            {torneios.map((t) => (
              <CardTorneio key={t.id} torneio={t} />
            ))}
          </div>
        )}
      </Secao>

      <div className="grid grid-pares" style={{ marginTop: "var(--space-6)" }}>
        <section>
          <h2 style={{ marginTop: 0 }}>Últimos resultados</h2>
          <ListaPartidas
            partidas={recentes}
            vazio="Nenhuma partida encerrada no banco ainda."
          />
        </section>

        <section>
          <h2 style={{ marginTop: 0 }}>Próximas partidas</h2>
          <ListaPartidas
            partidas={proximas}
            vazio="Nenhuma partida agendada à frente."
          />
        </section>
      </div>

      <Secao
        titulo="Times em destaque"
        acao={
          <Link href="/times" className="ver-todos">
            Ver todos →
          </Link>
        }
      >
        <p className="xs dim" style={{ marginTop: 0 }}>
          Quem mais tem partidas nos campeonatos ainda abertos.
        </p>
        {destaques.length === 0 ? (
          <div className="empty">Nenhum time em campeonato aberto agora.</div>
        ) : (
          <div className="grid">
            {destaques.map((t) => (
              <TeamCard key={t.id} team={t} />
            ))}
          </div>
        )}
      </Secao>

      <Secao titulo="No banco">
        <div className="grid grid-stats">
          <Stat valor={stats.tournaments} rotulo="Campeonatos" />
          <Stat valor={stats.teams} rotulo="Times" />
          <Stat
            valor={stats.players}
            rotulo="Jogadores"
            dica="com elenco ativo"
          />
          <Stat valor={stats.matches} rotulo="Partidas" />
        </div>
      </Secao>
    </>
  );
}
