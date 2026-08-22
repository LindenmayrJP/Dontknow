import { getPool } from "../db/pool";
import { Counters } from "./lib/counters";
import { syncValorantCatalog } from "./pandascore/catalog";

/**
 * `npm run sync:catalog` — catálogo estático de Valorant.
 *
 * Separado do `npm run sync` de propósito: mapas, agentes, armas e
 * habilidades só mudam quando a Riot lança patch. Rodar isso a cada sync
 * gastaria cota à toa.
 */
async function main() {
  const inicio = Date.now();
  const counters = new Counters();

  console.log("=== catálogo estático de Valorant ===");

  try {
    await syncValorantCatalog(counters);
  } catch (err) {
    console.error("\n[catálogo] FALHOU:", err instanceof Error ? err.message : err);
    await getPool().end();
    process.exit(1);
  }

  counters.print("=== resumo ===");
  console.log(`\nduração: ${((Date.now() - inicio) / 1000).toFixed(1)}s`);
  await getPool().end();
}

main().catch(async (err) => {
  console.error("Falha inesperada no catálogo:", err);
  await getPool().end().catch(() => {});
  process.exit(1);
});
