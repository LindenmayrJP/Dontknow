import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pool } from "./pool";

const MIGRATIONS_DIR = join(__dirname, "migrations");

async function main() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const { rows } = await client.query(
        "SELECT 1 FROM schema_migrations WHERE name = $1",
        [file]
      );
      if (rows.length > 0) {
        console.log(`já aplicada: ${file}`);
        continue;
      }

      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
      console.log(`aplicando: ${file}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (name) VALUES ($1)",
          [file]
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }

    console.log("migrations em dia");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Falha ao rodar migrations:", err);
  process.exit(1);
});
