import { Inter, Barlow_Semi_Condensed } from "next/font/google";

/**
 * `next/font/google` baixa os arquivos no build e os serve do próprio
 * domínio — nenhuma requisição sai para o Google em runtime, o que
 * mantém a regra do projeto de zero chamada externa no carregamento.
 */

/** Texto corrido: alta legibilidade em tamanho pequeno e denso. */
export const fontSans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

/**
 * Números e estatísticas. Condensada para caber mais dado por linha em
 * tabela, que é o padrão de vlr.gg / tracker.gg.
 */
export const fontStat = Barlow_Semi_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-stat",
});
