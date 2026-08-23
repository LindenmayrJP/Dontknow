import type { ReactNode } from "react";
import Link from "next/link";
import { SearchBox } from "./components";
import { fontSans, fontStat } from "./fonts";
import "./globals.css";

export const metadata = {
  title: "Esports Hub",
  description: "Wiki e partidas ao vivo de League of Legends e Valorant",
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
            <SearchBox />
          </div>
        </header>
        <main>
          <div className="wrap">{children}</div>
        </main>
      </body>
    </html>
  );
}
