import { getPool } from "./pool";

async function main() {
  const client = await getPool().connect();
  try {
    await client.query("SELECT 1");
    console.log("conectado");
  } finally {
    client.release();
    await getPool().end();
  }
}

main().catch((err) => {
  console.error("Falha ao conectar no banco:", err.message || err);
  process.exit(1);
});
