import "dotenv/config";
import { Pool } from "pg";

/**
 * Cache no globalThis: o hot-reload do Next reavalia os módulos a cada
 * mudança de arquivo, e sem isso cada reload abriria um pool novo,
 * vazando conexões até o Postgres recusar.
 */
const globalForPool = globalThis as typeof globalThis & { __pgPool?: Pool };

/**
 * Pool preguiçoso: a validação acontece no primeiro uso, não na
 * importação. Se ela rodasse na importação, `next build` quebraria só de
 * carregar o módulo, mesmo em páginas que nunca consultam o banco.
 */
export function getPool(): Pool {
  if (globalForPool.__pgPool) return globalForPool.__pgPool;

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não definida (veja .env.example)");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  globalForPool.__pgPool = pool;
  return pool;
}
