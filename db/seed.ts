import { getPool } from "./pool";

type SeedTeam = {
  organization: string;
  region: string;
  game: "lol" | "valorant";
  teamName: string;
  roster: string[];
  joinedAt: string;
};

// Dado de teste apenas — organizações/rosters reais e conhecidos, usados só
// até o worker de ingestão (Módulo 2) popular o banco com dado real do
// PandaScore/Riot. Rosters podem estar desatualizados, não é o dado oficial.
const SEED_TEAMS: SeedTeam[] = [
  { organization: "T1", region: "LCK", game: "lol", teamName: "T1", roster: ["Zeus", "Oner", "Faker", "Gumayusi", "Keria"], joinedAt: "2024-01-01" },
  { organization: "G2 Esports", region: "LEC", game: "lol", teamName: "G2", roster: ["BrokenBlade", "Yike", "Caps", "Hans Sama", "Mikyx"], joinedAt: "2024-01-01" },
  { organization: "Cloud9", region: "LTA North", game: "lol", teamName: "Cloud9", roster: ["Fudge", "Blaber", "EMENES", "Berserker", "Zven"], joinedAt: "2024-01-01" },
  { organization: "JD Gaming", region: "LPL", game: "lol", teamName: "JDG", roster: ["369", "Kanavi", "knight", "Ruler", "Missing"], joinedAt: "2024-01-01" },
  { organization: "Gen.G", region: "LCK", game: "lol", teamName: "Gen.G", roster: ["Kiin", "Canyon", "Chovy", "Peyz", "Lehends"], joinedAt: "2024-01-01" },

  { organization: "Sentinels", region: "Americas", game: "valorant", teamName: "Sentinels", roster: ["Zekken", "Sacy", "Bang", "Zellsis", "pANcada"], joinedAt: "2024-01-01" },
  { organization: "Fnatic", region: "EMEA", game: "valorant", teamName: "Fnatic", roster: ["Boaster", "Derke", "Alfajer", "Chronicle", "Leo"], joinedAt: "2024-01-01" },
  { organization: "LOUD", region: "Americas", game: "valorant", teamName: "LOUD", roster: ["aspas", "Less", "saadhak", "Cauanzin", "tuyz"], joinedAt: "2024-01-01" },
  { organization: "Paper Rex", region: "Pacific", game: "valorant", teamName: "Paper Rex", roster: ["mindfreak", "f0rsakeN", "something", "Jinggg", "d4v41"], joinedAt: "2024-01-01" },
  { organization: "DRX", region: "Pacific", game: "valorant", teamName: "DRX", roster: ["stax", "Rb", "Zest", "MaKo", "BuZz"], joinedAt: "2024-01-01" },
];

async function main() {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    for (const team of SEED_TEAMS) {
      const orgResult = await client.query<{ id: number }>(
        `INSERT INTO organizations (name, region)
         VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET region = EXCLUDED.region
         RETURNING id`,
        [team.organization, team.region]
      );
      const organizationId = orgResult.rows[0].id;

      const teamResult = await client.query<{ id: number }>(
        `INSERT INTO teams (organization_id, game, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (organization_id, game) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [organizationId, team.game, team.teamName]
      );
      const teamId = teamResult.rows[0].id;

      for (const playerName of team.roster) {
        const playerResult = await client.query<{ id: number }>(
          `INSERT INTO players (name, riot_id)
           VALUES ($1, $2)
           ON CONFLICT (riot_id) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [playerName, `${playerName}#SEED`]
        );
        const playerId = playerResult.rows[0].id;

        await client.query(
          `INSERT INTO team_memberships (player_id, team_id, joined_at)
           SELECT $1, $2, $3
           WHERE NOT EXISTS (
             SELECT 1 FROM team_memberships
             WHERE player_id = $1 AND team_id = $2 AND left_at IS NULL
           )`,
          [playerId, teamId, team.joinedAt]
        );
      }

      console.log(`seed: ${team.organization} (${team.game}) — ${team.roster.length} jogadores`);
    }

    await client.query("COMMIT");
    console.log("seed concluído");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await getPool().end();
  }
}

main().catch((err) => {
  console.error("Falha ao rodar seed:", err);
  process.exit(1);
});
