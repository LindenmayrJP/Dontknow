import { getPool } from "./pool";

/**
 * Remove o que sobrou do seed do Módulo 1 depois que a ingestão real
 * (Módulo 2) já rodou.
 *
 * O seed inventou rosters para dar dado de teste antes do worker existir.
 * Quando a sync roda, as linhas que correspondem a dado real são adotadas
 * (ganham pandascore_id); as que sobram marcadas com `#SEED` são jogadores
 * que não existem mais naquele time — dado fictício que não deve aparecer
 * nas páginas de wiki do Módulo 3.
 *
 * Só apaga o que ainda está marcado como seed e nunca foi adotado.
 */
async function main() {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const players = await client.query(
      `DELETE FROM players
        WHERE pandascore_id IS NULL AND riot_id LIKE '%#SEED'`
    );

    // Times/orgs do seed que a sync nunca adotou (não vieram do PandaScore).
    const teams = await client.query(
      `DELETE FROM teams
        WHERE pandascore_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM matches m
                           WHERE m.team_a_id = teams.id OR m.team_b_id = teams.id)`
    );

    const orgs = await client.query(
      `DELETE FROM organizations
        WHERE pandascore_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM teams t WHERE t.organization_id = organizations.id)`
    );

    await client.query("COMMIT");

    console.log(`removidos: ${players.rowCount} jogadores, ${teams.rowCount} times, ${orgs.rowCount} organizações`);
    console.log("(vínculos em team_memberships caem junto por ON DELETE CASCADE)");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await getPool().end();
  }
}

main().catch((err) => {
  console.error("Falha ao limpar o seed:", err);
  process.exit(1);
});
