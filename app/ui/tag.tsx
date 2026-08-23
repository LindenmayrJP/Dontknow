import type { ReactNode } from "react";

/**
 * Tag / badge — rótulo curto de categoria ou estado.
 *
 * A cor nunca carrega o significado sozinha: toda tag tem texto legível.
 * Isso importa porque a cor de marca do Valorant e a de erro são ambas
 * vermelhas — o que as distingue é a palavra dentro, não o tom.
 */

export type TomTag =
  | "neutro"
  | "accent"
  | "success"
  | "danger"
  | "warning"
  | "lol"
  | "valorant";

export function Tag({
  children,
  tom = "neutro",
  ponto = false,
}: {
  children: ReactNode;
  tom?: TomTag;
  /** Bolinha pulsante à esquerda — só para estado ao vivo. */
  ponto?: boolean;
}) {
  const classes = ["tag"];
  if (tom !== "neutro") classes.push(`tag-${tom}`);
  if (ponto) classes.push("tag-live");

  return (
    <span className={classes.join(" ")}>
      {ponto && <span className="dot" />}
      {children}
    </span>
  );
}

/** Atalho para o jogo, que aparece em quase toda listagem. */
export function TagJogo({ jogo }: { jogo: "lol" | "valorant" }) {
  return <Tag tom={jogo}>{jogo === "lol" ? "LoL" : "Valorant"}</Tag>;
}

/** Estado de partida ou torneio, com a cor certa para cada um. */
export function TagStatus({
  status,
}: {
  status: "scheduled" | "live" | "finished";
}) {
  if (status === "live") {
    return (
      <Tag tom="success" ponto>
        Ao vivo
      </Tag>
    );
  }
  if (status === "finished") return <Tag>Encerrada</Tag>;
  return <Tag tom="accent">Agendada</Tag>;
}
