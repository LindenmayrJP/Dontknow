import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Card — container padrão de conteúdo.
 *
 * Duas formas: solto (padding próprio) ou "flush", para quando o miolo
 * é uma tabela que precisa encostar nas bordas.
 */
export function Card({
  children,
  titulo,
  acao,
  flush = false,
  href,
}: {
  children: ReactNode;
  /** Cabeçalho com filete separando do miolo. */
  titulo?: ReactNode;
  /** Canto direito do cabeçalho: link "ver tudo", contagem, filtro. */
  acao?: ReactNode;
  /** Remove o padding — use quando o filho for tabela ou lista. */
  flush?: boolean;
  /** Torna o card inteiro clicável. */
  href?: string;
}) {
  const classes = ["card"];
  if (flush || titulo) classes.push("card-flush");

  const miolo = (
    <>
      {titulo && (
        <div className="card-head">
          <span className="card-title">{titulo}</span>
          {acao}
        </div>
      )}
      {flush ? children : <div style={{ padding: "var(--space-4)" }}>{children}</div>}
    </>
  );

  // Sem cabeçalho e sem flush: o padding do próprio .card já basta.
  const conteudo = titulo || flush ? miolo : children;

  if (href) {
    return (
      <Link className={classes.join(" ")} href={href}>
        {conteudo}
      </Link>
    );
  }
  return <div className={classes.join(" ")}>{conteudo}</div>;
}

/**
 * Stat — número em destaque com rótulo, na fonte condensada.
 * É o bloco de "dado primário" das páginas de time e jogador.
 */
export function Stat({
  valor,
  rotulo,
  dica,
  tom,
}: {
  valor: ReactNode;
  rotulo: string;
  /** Linha auxiliar embaixo: contexto, período, origem. */
  dica?: string;
  /** Colore o número para leitura rápida de bom/ruim. */
  tom?: "up" | "down";
}) {
  return (
    <div className="stat">
      <div className={`stat-value${tom ? ` ${tom}` : ""}`}>{valor}</div>
      <div className="stat-label">{rotulo}</div>
      {dica && <div className="stat-hint">{dica}</div>}
    </div>
  );
}

/** Título de seção com ação opcional à direita. */
export function Secao({
  titulo,
  acao,
  children,
}: {
  titulo: string;
  acao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="row row-between">
        <h2>{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}
