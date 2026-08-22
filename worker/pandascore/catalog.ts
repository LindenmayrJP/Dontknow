import type { PoolClient } from "pg";
import { getPool } from "../../db/pool";
import { Counters } from "../lib/counters";
import {
  PandaScoreClient,
  type CatalogResource,
  type PsCatalogItem,
} from "./client";
import { dedupe, tally } from "./sync";

/**
 * Catálogo estático de Valorant: mapas, agentes, armas e habilidades.
 *
 * Roda separado do `npm run sync` porque só muda quando a Riot lança
 * patch — sincronizar isso a cada execução seria desperdício de cota.
 */

type Recurso = {
  recurso: CatalogResource;
  tabela: string;
  /** Colunas próprias além de pandascore_id/name/videogame_versions. */
  extras: { coluna: string; tipo: "text" | "int"; campo: keyof PsCatalogItem }[];
};

const RECURSOS: Recurso[] = [
  {
    recurso: "maps",
    tabela: "valorant_maps",
    extras: [
      { coluna: "slug", tipo: "text", campo: "slug" },
      { coluna: "image_url", tipo: "text", campo: "image_url" },
    ],
  },
  {
    recurso: "agents",
    tabela: "valorant_agents",
    // Agente usa portrait_url, não image_url.
    extras: [{ coluna: "portrait_url", tipo: "text", campo: "portrait_url" }],
  },
  {
    recurso: "weapons",
    tabela: "valorant_weapons",
    extras: [
      { coluna: "creds", tipo: "int", campo: "creds" },
      { coluna: "image_url", tipo: "text", campo: "image_url" },
    ],
  },
  {
    recurso: "abilities",
    tabela: "valorant_abilities",
    // ability_type é o SLOT da habilidade, não o agente dono — a origem
    // não liga habilidade a agente (ver comentário na migration 0004).
    extras: [
      { coluna: "ability_type", tipo: "text", campo: "ability_type" },
      { coluna: "creds", tipo: "int", campo: "creds" },
      { coluna: "image_url", tipo: "text", campo: "image_url" },
    ],
  },
];

/**
 * Upsert em lote de um recurso do catálogo.
 *
 * `videogame_versions` é um array por linha, e o Postgres não aceita
 * `unnest` de array irregular. A solução é passar cada lista como JSON
 * numa coluna de texto e reconstituir o `text[]` dentro do SQL.
 */
async function upsertRecurso(
  db: PoolClient,
  counters: Counters,
  { tabela, extras }: Recurso,
  itens: PsCatalogItem[]
) {
  const linhas = dedupe(
    itens.filter((i) => typeof i.id === "number"),
    (i) => i.id
  );
  if (linhas.length === 0) return;

  const colunasExtras = extras.map((e) => e.coluna);
  // $1 = ids, $2 = names, $3 = versions(json), extras a partir de $4.
  const paramsExtras = extras.map(
    (e, i) => `$${i + 4}::${e.tipo === "int" ? "int" : "text"}[]`
  );
  const selectExtras = extras.map((e) => `v.${e.coluna}`);
  const updateExtras = extras.map((e) => `${e.coluna} = EXCLUDED.${e.coluna}`);

  const sql = `
    INSERT INTO ${tabela}
      (pandascore_id, name, videogame_versions${colunasExtras.length ? ", " + colunasExtras.join(", ") : ""}, updated_at)
    SELECT v.id, v.name,
           ARRAY(SELECT jsonb_array_elements_text(v.versions::jsonb))${selectExtras.length ? ", " + selectExtras.join(", ") : ""},
           now()
      FROM unnest($1::int[], $2::text[], $3::text[]${paramsExtras.length ? ", " + paramsExtras.join(", ") : ""})
           AS v(id, name, versions${colunasExtras.length ? ", " + colunasExtras.join(", ") : ""})
    ON CONFLICT (pandascore_id) DO UPDATE
      SET name = EXCLUDED.name,
          videogame_versions = EXCLUDED.videogame_versions${updateExtras.length ? ",\n          " + updateExtras.join(",\n          ") : ""},
          updated_at = now()
    RETURNING (xmax = 0) AS inserted`;

  const valores: unknown[] = [
    linhas.map((i) => i.id),
    linhas.map((i) => i.name),
    linhas.map((i) => JSON.stringify(i.videogame_versions ?? [])),
    ...extras.map((e) => linhas.map((i) => i[e.campo] ?? null)),
  ];

  const { rows } = await db.query<{ inserted: boolean }>(sql, valores);
  tally(counters, tabela, rows);
}

export async function syncValorantCatalog(counters: Counters) {
  const apiKey = process.env.PANDASCORE_API_KEY;
  if (!apiKey) throw new Error("PANDASCORE_API_KEY não definida no .env");

  const client = new PandaScoreClient(apiKey);
  const db = await getPool().connect();

  try {
    for (const recurso of RECURSOS) {
      // Habilidades têm 116 registros e exigem duas páginas; as outras
      // três cabem em uma. `getAll` para na página incompleta.
      const itens = await client.listCatalog<PsCatalogItem>(recurso.recurso, 3);
      console.log(`[catálogo] ${recurso.recurso}: ${itens.length} da API`);

      await db.query("BEGIN");
      try {
        await upsertRecurso(db, counters, recurso, itens);
        await db.query("COMMIT");
      } catch (err) {
        await db.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    db.release();
  }
}
