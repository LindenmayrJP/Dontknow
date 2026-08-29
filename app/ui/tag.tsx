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

const JOGO = {
  lol: { rotulo: "League of Legends", arquivo: "/jogos/lol.svg" },
  valorant: { rotulo: "Valorant", arquivo: "/jogos/valorant.svg" },
} as const;

/**
 * Atalho para o jogo, que aparece em quase toda listagem.
 *
 * Mostra a marca do jogo em vez do nome escrito. O nome continua no
 * `aria-label` e no `title`: sem ele a tag violaria a regra acima —
 * a cor de marca do Valorant e a de erro são o mesmo vermelho, e sem
 * texto sobraria só a forma para distinguir. Leitor de tela e mouse
 * parado continuam recebendo a palavra.
 *
 * O SVG entra como máscara CSS, não como `<img>`: assim a marca herda
 * a cor da tag (`currentColor` não se aplica a SVG carregado por
 * `<img>`). Arquivos em `public/jogos/`, servidos do nosso domínio —
 * nenhuma requisição externa.
 */
export function TagJogo({ jogo }: { jogo: "lol" | "valorant" }) {
  const { rotulo, arquivo } = JOGO[jogo];
  return (
    <Tag tom={jogo}>
      <span
        className={`logo-jogo logo-jogo-${jogo}`}
        style={{ maskImage: `url(${arquivo})`, WebkitMaskImage: `url(${arquivo})` }}
        role="img"
        aria-label={rotulo}
        title={rotulo}
      />
    </Tag>
  );
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
