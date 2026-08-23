import type { ReactNode } from "react";
import Link from "next/link";
import { NavPrincipal } from "./ui/nav";
import { BuscaRapida } from "./ui/busca-rapida";
import { rotuloDoRecorte } from "./jogos";
import { fontSans, fontStat } from "./fonts";
import "./globals.css";

export const metadata = {
  title: "Esports Hub",
  // Sai da lista de jogos habilitados, não de um texto fixo: a descrição
  // do site acompanha o que o site de fato mostra.
  description: `Times, jogadores, campeonatos e partidas de ${rotuloDoRecorte()}`,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${fontSans.variable} ${fontStat.variable}`}>
      <body>
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className="logo">
              Esports<span>Hub</span>
            </Link>
            <NavPrincipal />
            <BuscaRapida />
          </div>
        </header>
        <main>
          <div className="wrap">{children}</div>
        </main>
        <footer className="site-footer">
          <div className="wrap">
            <span className="xs dim">
              Dados de partidas e elencos via PandaScore. Este site não é
              afiliado à Riot Games.
            </span>
            <Link href="/design-system" className="xs dim">
              Design system
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
