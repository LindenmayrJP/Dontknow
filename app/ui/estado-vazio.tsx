import type { ReactNode } from "react";

/**
 * Estado vazio — a consulta rodou e não havia nada.
 *
 * Distinto de `EmDesenvolvimento` de propósito, e a diferença não é
 * estética: "não achamos nada com esse nome" e "esta tela ainda não
 * existe" pedem reações opostas de quem lê. A primeira convida a tentar
 * de novo; a segunda pede para voltar depois. Misturar as duas ensina o
 * usuário a ignorar as duas.
 *
 * O Módulo 3.7 desenhou este estado como a classe `.empty` aplicada à
 * mão em cada tela. Virou componente no 3.9, quando a busca precisou de
 * título, explicação e sugestões no mesmo bloco.
 */
export function EstadoVazio({
  titulo,
  children,
  acao,
}: {
  /** Uma linha dizendo o que não foi encontrado. */
  titulo: string;
  /** Por que pode estar vazio, ou o que tentar em seguida. */
  children?: ReactNode;
  /** Botões ou links de saída — sugestões de busca, "ver todos". */
  acao?: ReactNode;
}) {
  return (
    <div className="empty empty-bloco">
      <svg
        className="empty-icone"
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m15.5 15.5 4 4" />
      </svg>
      <div className="empty-titulo">{titulo}</div>
      {children && <div className="empty-detalhe">{children}</div>}
      {acao && <div className="empty-acao">{acao}</div>}
    </div>
  );
}
