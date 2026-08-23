"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navegação principal.
 *
 * Client component só por causa do estado ativo — `usePathname` é a
 * única coisa aqui que precisa do navegador. O resto do cabeçalho
 * (logo, busca) continua sendo renderizado no servidor.
 *
 * As seções são dado, não markup: acrescentar uma é uma linha na lista,
 * e nenhuma delas menciona jogo. O recorte por jogo é decidido em
 * `app/jogos.ts` e aplicado dentro de cada página.
 */

export type ItemNav = {
  rotulo: string;
  href: string;
  /** Marca a seção como ainda não pronta — vira selo "em breve". */
  emBreve?: boolean;
};

export const SECOES: ItemNav[] = [
  { rotulo: "Times", href: "/times" },
  { rotulo: "Jogadores", href: "/jogadores" },
  { rotulo: "Campeonatos", href: "/campeonatos" },
  // A página existe e explica o que falta; o selo evita prometer mais do
  // que ela entrega hoje (ver Módulo 4).
  { rotulo: "Ao vivo", href: "/ao-vivo", emBreve: true },
];

export function NavPrincipal() {
  const caminho = usePathname();

  return (
    <nav className="nav-principal" aria-label="Seções do site">
      {SECOES.map((item) => {
        // `startsWith` para que /times/123 mantenha "Times" aceso.
        const ativo =
          caminho === item.href || caminho.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link${ativo ? " nav-link-ativo" : ""}`}
            aria-current={ativo ? "page" : undefined}
          >
            {item.rotulo}
            {item.emBreve && <span className="nav-selo">em breve</span>}
          </Link>
        );
      })}
    </nav>
  );
}
