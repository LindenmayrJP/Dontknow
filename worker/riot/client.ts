import { getJson } from "../lib/http";
import { RateLimiter } from "../lib/rate-limiter";

/** Cluster regional (Account-V1) por plataforma (Summoner/Spectator). */
const PLATFORM_TO_REGION: Record<string, string> = {
  na1: "americas", br1: "americas", la1: "americas", la2: "americas",
  euw1: "europe", eun1: "europe", tr1: "europe", ru: "europe",
  kr: "asia", jp1: "asia",
  oc1: "sea", ph2: "sea", sg2: "sea", th2: "sea", tw2: "sea", vn2: "sea",
};

export type RiotAccount = {
  puuid: string;
  gameName: string;
  tagLine: string;
};

export type RiotSummoner = {
  id?: string;
  puuid: string;
  profileIconId: number;
  summonerLevel: number;
};

export type SpectatorParticipant = {
  puuid: string;
  championId: number;
  teamId: number;
  spell1Id?: number;
  spell2Id?: number;
};

export type SpectatorGame = {
  gameId: number;
  gameType: string;
  gameMode: string;
  gameQueueConfigId: number;
  gameStartTime: number;
  gameLength: number;
  participants: SpectatorParticipant[];
};

export class RiotClient {
  private readonly limiter: RateLimiter;

  constructor(
    private readonly apiKey: string,
    /**
     * Spectator-V4 (by-summoner/{encryptedSummonerId}) foi descontinuada
     * pela Riot em favor da V5, que recebe o puuid direto. O default é v5;
     * RIOT_SPECTATOR_VERSION=v4 volta ao comportamento antigo se a sua
     * chave ainda tiver acesso.
     */
    private readonly spectatorVersion = process.env.RIOT_SPECTATOR_VERSION ?? "v5"
  ) {
    // Chave de dev: 20 req/s e 100 req/2min. O limiter mira o mais restrito.
    this.limiter = new RateLimiter(100, 2 * 60 * 1000, 60);
  }

  private headers() {
    return { "X-Riot-Token": this.apiKey, Accept: "application/json" };
  }

  private regionFor(platform: string) {
    const region = PLATFORM_TO_REGION[platform.toLowerCase()];
    if (!region) throw new Error(`Plataforma Riot desconhecida: ${platform}`);
    return region;
  }

  /**
   * Host da Riot para o shard pedido. RIOT_API_BASE_URL substitui o host
   * real — usado só por teste/proxy local, nunca em produção.
   */
  private host(shard: string) {
    return process.env.RIOT_API_BASE_URL ?? `https://${shard}.api.riotgames.com`;
  }

  /** Account-V1: Riot ID (Nome#TAG) → puuid. */
  async getAccountByRiotId(
    gameName: string,
    tagLine: string,
    platform: string
  ): Promise<RiotAccount | null> {
    const url =
      `${this.host(this.regionFor(platform))}/riot/account/v1/accounts/by-riot-id/` +
      `${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;

    return getJson<RiotAccount>(url, {
      limiter: this.limiter,
      headers: this.headers(),
      notFoundAsNull: true,
    });
  }

  /** Summoner-V4 por puuid. */
  async getSummonerByPuuid(
    puuid: string,
    platform: string
  ): Promise<RiotSummoner | null> {
    const url =
      `${this.host(platform)}/lol/summoner/v4/summoners/by-puuid/` +
      encodeURIComponent(puuid);

    return getJson<RiotSummoner>(url, {
      limiter: this.limiter,
      headers: this.headers(),
      notFoundAsNull: true,
    });
  }

  /**
   * Spectator: partida ao vivo. 404 = jogador não está em partida, que é o
   * caso normal e não um erro.
   */
  async getActiveGame(
    summoner: { puuid: string; id?: string },
    platform: string
  ): Promise<SpectatorGame | null> {
    const base = `${this.host(platform)}/lol/spectator`;
    const url =
      this.spectatorVersion === "v4"
        ? `${base}/v4/active-games/by-summoner/${encodeURIComponent(summoner.id ?? "")}`
        : `${base}/v5/active-games/by-summoner/${encodeURIComponent(summoner.puuid)}`;

    if (this.spectatorVersion === "v4" && !summoner.id) return null;

    return getJson<SpectatorGame>(url, {
      limiter: this.limiter,
      headers: this.headers(),
      notFoundAsNull: true,
    });
  }
}
