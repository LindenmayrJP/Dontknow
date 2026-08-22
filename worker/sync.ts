import { getPool } from "../db/pool";
import { Counters } from "./lib/counters";
import { HttpError } from "./lib/http";
import { syncPandaScore } from "./pandascore/sync";
import { syncRiot } from "./riot/sync";

/**
 * Roda os dois clientes em sequência. O PandaScore vem primeiro porque é a
 * fonte da camada de wiki; o Riot depende de uma chave que expira em 24h
 * enquanto não sai a chave pessoal, então a falha dele é esperada e não
 * pode derrubar a sync inteira.
 */
async function main() {
  const startedAt = Date.now();
  const counters = new Counters();
  let pandascoreFailed = false;
  let riotError: string | null = null;

  console.log("=== sync iniciada ===");

  try {
    await syncPandaScore(counters);
  } catch (err) {
    pandascoreFailed = true;
    console.error("\n[pandascore] FALHOU:", err instanceof Error ? err.message : err);
  }

  try {
    console.log("\n[riot] iniciando");
    await syncRiot(counters);
  } catch (err) {
    riotError = err instanceof Error ? err.message : String(err);

    if (err instanceof HttpError && err.isAuthError) {
      riotError =
        `chave da Riot rejeitada (HTTP ${err.status}) — provavelmente expirou. ` +
        "Gere uma nova em developer.riotgames.com e atualize RIOT_API_KEY no .env";
    }

    console.error(`\n[riot] FALHOU: ${riotError}`);
    console.error("[riot] seguindo mesmo assim — dado do PandaScore não é afetado");
  }

  counters.print("=== resumo ===");
  console.log(`\nduração: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);

  if (pandascoreFailed) {
    console.error("\nsync terminou COM FALHA no PandaScore");
    await getPool().end();
    process.exit(1);
  }

  if (riotError) {
    console.warn("\nsync terminou OK, mas o cliente Riot falhou (ver acima)");
  } else {
    console.log("\nsync concluída");
  }

  await getPool().end();
}

main().catch(async (err) => {
  console.error("Falha inesperada na sync:", err);
  await getPool().end().catch(() => {});
  process.exit(1);
});
