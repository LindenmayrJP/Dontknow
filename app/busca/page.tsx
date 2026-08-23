import Link from "next/link";
import { search, type ResultadoJogador, type ResultadoTime } from "@/db/queries";
import { Avatar, EstadoVazio, logoDeTime, Secao, TagJogo } from "../ui";

export const dynamic = "force-dynamic";

const MIN_CARACTERES = 2;

/** Sugestões de saída quando a busca não acha nada. */
function Atalhos() {
  return (
    <>
      <Link href="/times" className="tag">
        Ver todos os times
      </Link>
      <Link href="/jogadores" className="tag">
        Ver jogadores
      </Link>
      <Link href="/campeonatos" className="tag">
        Ver campeonatos
      </Link>
    </>
  );
}

function LinhaTime({
  time,
  homonimo,
}: {
  time: ResultadoTime;
  /** Divide o nome com outra entidade: o detalhe passa a importar. */
  homonimo: boolean;
}) {
  const detalhes = [
    time.acronym,
    time.org_name !== time.name ? time.org_name : null,
    time.region,
    time.roster_size > 0 ? `${time.roster_size} no elenco` : null,
    time.partidas > 0 ? `${time.partidas} partidas` : "sem partidas",
  ].filter(Boolean);

  return (
    <Link className="card card-hover" href={`/times/${time.id}`}>
      <div className="resultado">
        <Avatar
          nome={time.name}
          sigla={time.acronym}
          imagemUrl={logoDeTime(time)}
        />
        <span className="painel-texto">
          <span className="painel-nome">{time.name}</span>
          <span className={`painel-meta${homonimo ? " painel-meta-chave" : ""}`}>
            {detalhes.join(" · ")}
          </span>
        </span>
        <TagJogo jogo={time.game} />
      </div>
    </Link>
  );
}

function LinhaJogador({ jogador }: { jogador: ResultadoJogador }) {
  return (
    <Link className="card card-hover" href={`/jogadores/${jogador.id}`}>
      <div className="resultado">
        <Avatar nome={jogador.name} imagemUrl={jogador.image_url} redondo />
        <span className="painel-texto">
          <span className="painel-nome">{jogador.name}</span>
          <span className="painel-meta">
            {[jogador.team_name ?? "sem time ativo", jogador.nationality]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        {jogador.game && <TagJogo jogo={jogador.game} />}
      </div>
    </Link>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const termo = (q ?? "").trim();

  if (termo.length < MIN_CARACTERES) {
    return (
      <>
        <h1>Busca</h1>
        <EstadoVazio titulo="Digite ao menos 2 caracteres" acao={<Atalhos />}>
          Busque por nome de time, sigla ou nome de jogador. Uma letra só
          casaria com metade do banco.
        </EstadoVazio>
      </>
    );
  }

  const { teams, players } = await search(termo);
  const total = teams.length + players.length;

  // Nomes que se repetem no resultado — o caso "FURIA Esports" em dois
  // jogos, ou os vários MIBR. Marcados para que a linha de apoio ganhe
  // peso justamente onde ela é o que distingue as entidades.
  const repetidos = new Set(
    teams
      .map((t) => t.name.toLowerCase())
      .filter((n, i, todos) => todos.indexOf(n) !== i)
  );

  return (
    <>
      <h1>Busca</h1>
      <p className="muted small">
        {total === 0 ? "Nenhum resultado" : `${total} resultado(s)`} para “
        {termo}”
      </p>

      {total === 0 && (
        <EstadoVazio titulo={`Nada encontrado para “${termo}”`} acao={<Atalhos />}>
          Confira a grafia ou tente a sigla do time. O site mostra só o que
          a última sincronização trouxe — nem todo time da cena está no
          banco ainda.
        </EstadoVazio>
      )}

      {teams.length > 0 && (
        <Secao titulo={`Times (${teams.length})`}>
          {repetidos.size > 0 && (
            <p className="notice">
              Há times com o mesmo nome no resultado. São entidades
              distintas na fonte — normalmente o mesmo clube em jogos
              diferentes, ou uma equipe principal e uma academia. O jogo e a
              linha de detalhe separam uma da outra.
            </p>
          )}
          <div className="stack">
            {teams.map((t) => (
              <LinhaTime
                key={t.id}
                time={t}
                homonimo={repetidos.has(t.name.toLowerCase())}
              />
            ))}
          </div>
        </Secao>
      )}

      {players.length > 0 && (
        <Secao titulo={`Jogadores (${players.length})`}>
          <div className="stack">
            {players.map((p) => (
              <LinhaJogador key={p.id} jogador={p} />
            ))}
          </div>
        </Secao>
      )}
    </>
  );
}
