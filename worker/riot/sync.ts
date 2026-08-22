import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pool } from "../../db/pool";
import { Counters } from "../lib/counters";
import { HttpError } from "../lib/http";
import { RiotClient, type SpectatorGame } from "./client";

type TrackedPlayer = {
  riotId: string;
  platform: string;
  playerName?: string;
};

const CONFIG_PATH =
  process.env.RIOT_TRACKED_PLAYERS_PATH ??
  join(__dirname, "..", "tracked-players.json");

function loadTrackedPlayers(): TrackedPlayer[] {
  if (!existsSync(CONFIG_PATH)) {
    console.warn(`[riot] config não encontrada em ${CONFIG_PATH} — pulando`);
    return [];
  }

  const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  const players: TrackedPlayer[] = parsed.players ?? [];

  return players.filter((p) => {
    if (!p.riotId?.includes("#") || !p.platform) {
      console.warn(`[riot] entrada inválida ignorada: ${JSON.stringify(p)}`);
      return false;
    }
    return true;
  });
}

/** Liga o status ao jogador da wiki, quando `playerName` bate com players.name. */
async function findPlayerId(name: string | undefined): Promise<number | null> {
  if (!name) return null;
  const { rows } = await pool.query<{ id: number }>(
    "SELECT id FROM players WHERE name = $1 ORDER BY pandascore_id NULLS LAST LIMIT 1",
    [name]
  );
  return rows[0]?.id ?? null;
}

async function upsertStatus(
  counters: Counters,
  row: {
    puuid: string;
    playerId: number | null;
    riotId: string;
    gameName: string;
    tagLine: string;
    platform: string;
    summonerId: string | null;
    summonerLevel: number | null;
    profileIconId: number | null;
    game: SpectatorGame | null;
    lastError: string | null;
  }
) {
  const me = row.game?.participants?.find((p) => p.puuid === row.puuid);

  const { rows } = await pool.query<{ inserted: boolean }>(
    `INSERT INTO tracked_player_status
       (puuid, player_id, riot_id, game_name, tag_line, platform, summoner_id,
        summoner_level, profile_icon_id, in_game, current_game_id,
        current_game_mode, current_game_queue_id, current_game_champion_id,
        current_game_started_at, current_game, last_error, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, now())
     ON CONFLICT (puuid) DO UPDATE
       SET player_id = COALESCE(EXCLUDED.player_id, tracked_player_status.player_id),
           riot_id = EXCLUDED.riot_id,
           game_name = EXCLUDED.game_name,
           tag_line = EXCLUDED.tag_line,
           platform = EXCLUDED.platform,
           summoner_id = COALESCE(EXCLUDED.summoner_id, tracked_player_status.summoner_id),
           summoner_level = COALESCE(EXCLUDED.summoner_level, tracked_player_status.summoner_level),
           profile_icon_id = COALESCE(EXCLUDED.profile_icon_id, tracked_player_status.profile_icon_id),
           in_game = EXCLUDED.in_game,
           current_game_id = EXCLUDED.current_game_id,
           current_game_mode = EXCLUDED.current_game_mode,
           current_game_queue_id = EXCLUDED.current_game_queue_id,
           current_game_champion_id = EXCLUDED.current_game_champion_id,
           current_game_started_at = EXCLUDED.current_game_started_at,
           current_game = EXCLUDED.current_game,
           last_error = EXCLUDED.last_error,
           updated_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [
      row.puuid,
      row.playerId,
      row.riotId,
      row.gameName,
      row.tagLine,
      row.platform,
      row.summonerId,
      row.summonerLevel,
      row.profileIconId,
      row.game !== null,
      row.game?.gameId ?? null,
      row.game?.gameMode ?? null,
      row.game?.gameQueueConfigId ?? null,
      me?.championId ?? null,
      // gameStartTime vem 0 enquanto a partida está em loading screen.
      row.game?.gameStartTime ? new Date(row.game.gameStartTime) : null,
      row.game ? JSON.stringify(row.game) : null,
      row.lastError,
    ]
  );

  counters.record("tracked_player_status", rows[0].inserted);
}

export async function syncRiot(counters: Counters) {
  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey) {
    throw new Error("RIOT_API_KEY não definida no .env");
  }

  const tracked = loadTrackedPlayers();
  if (tracked.length === 0) {
    console.log("[riot] nenhum jogador rastreado configurado");
    return;
  }

  const client = new RiotClient(apiKey);
  console.log(`[riot] ${tracked.length} jogadores rastreados`);

  for (const entry of tracked) {
    const [gameName, tagLine] = entry.riotId.split("#");

    try {
      const account = await client.getAccountByRiotId(
        gameName,
        tagLine,
        entry.platform
      );

      if (!account) {
        console.warn(`  ${entry.riotId}: conta não encontrada`);
        counters.skip("tracked_player_status");
        continue;
      }

      const summoner = await client.getSummonerByPuuid(
        account.puuid,
        entry.platform
      );

      const game = await client.getActiveGame(
        { puuid: account.puuid, id: summoner?.id },
        entry.platform
      );

      await upsertStatus(counters, {
        puuid: account.puuid,
        playerId: await findPlayerId(entry.playerName),
        riotId: `${account.gameName}#${account.tagLine}`,
        gameName: account.gameName,
        tagLine: account.tagLine,
        platform: entry.platform,
        summonerId: summoner?.id ?? null,
        summonerLevel: summoner?.summonerLevel ?? null,
        profileIconId: summoner?.profileIconId ?? null,
        game,
        lastError: null,
      });

      console.log(
        `  ${entry.riotId}: ${game ? `em partida (${game.gameMode})` : "fora de partida"}`
      );
    } catch (err) {
      // Chave expirada/inválida invalida todos os jogadores — aborta o
      // cliente Riot inteiro em vez de repetir o erro N vezes.
      if (err instanceof HttpError && err.isAuthError) throw err;

      // Falha isolada de um jogador não derruba os outros.
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`  ${entry.riotId}: falhou — ${message}`);
      counters.skip("tracked_player_status");
    }
  }
}
