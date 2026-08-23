import { type NextRequest } from "next/server";
import { search } from "@/db/queries";

/**
 * Busca incremental do cabeçalho.
 *
 * Existe porque o painel que abre enquanto se digita precisa de um
 * endpoint leve — a página `/busca` continua sendo renderizada no
 * servidor e é ela que responde ao Enter, a links compartilhados e a
 * quem está sem JavaScript. Esta rota é o atalho, não o caminho único.
 */

export const dynamic = "force-dynamic";

/** Poucos resultados: o painel é atalho, a página inteira é o acervo. */
const POR_TIPO = 5;

export async function GET(req: NextRequest) {
  const termo = (req.nextUrl.searchParams.get("q") ?? "").trim();

  // Uma letra casaria com meio banco e não ajudaria ninguém.
  if (termo.length < 2) {
    return Response.json({ teams: [], players: [] });
  }

  const resultados = await search(termo, POR_TIPO);

  return Response.json(resultados, {
    // Resultado de busca não deve ser guardado por intermediário: o
    // banco muda a cada sync e a resposta é específica do termo.
    headers: { "Cache-Control": "no-store" },
  });
}
