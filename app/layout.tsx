import type { ReactNode } from "react";

export const metadata = {
  title: "Esports Hub",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
