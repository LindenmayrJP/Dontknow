import { getJson } from "../lib/http";
import { RateLimiter } from "../lib/rate-limiter";

export type Game = "lol" | "valorant";

/** Prefixo de rota do PandaScore por jogo. */
const GAME_PATH: Record<Game, string> = {
  lol: "lol",
  valorant: "valorant",
};

export type PsTeam = {
  id: number;
  name: string;
  slug: string | null;
  acronym: string | null;
  location: string | null;
  image_url: string | null;
  players?: PsPlayer[];
};

export type PsPlayer = {
  id: number;
  name: string;
  first_name: string | null;
  last_name: string | null;
  slug: string | null;
  role: string | null;
  nationality: string | null;
  image_url: string | null;
};

export type PsMatch = {
  id: number;
  name: string | null;
  slug: string | null;
  scheduled_at: string | null;
  status: string;
  number_of_games: number | null;
  winner_id: number | null;
  opponents: { opponent: PsTeam }[];
  results: { team_id: number; score: number }[];
  tournament: PsTournament | null;
  serie: { id: number; name: string | null; full_name: string | null } | null;
  league: { id: number; name: string | null } | null;
};

export type PsTournament = {
  id: number;
  name: string;
  slug: string | null;
  begin_at: string | null;
  end_at: string | null;
};

/**
 * Cliente PandaScore. O tier gratuito permite 1000 req/hora — o limiter
 * é a única guarda contra estourar isso, então todas as chamadas passam
 * pelo mesmo `RateLimiter` compartilhado.
 */
export class PandaScoreClient {
  private readonly limiter: RateLimiter;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.pandascore.co",
    /** Margem de segurança: 950 em vez de 1000 req/hora. */
    maxPerHour = 950
  ) {
    // minGap de 250ms evita rajadas que disparam 429 por segundo.
    this.limiter = new RateLimiter(maxPerHour, 60 * 60 * 1000, 250);
  }

  private async getPage<T>(
    path: string,
    params: Record<string, string | number>
  ): Promise<T[]> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    const data = await getJson<T[]>(url.toString(), {
      limiter: this.limiter,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json",
      },
    });

    return data ?? [];
  }

  /**
   * Pagina até `maxPages` ou até a API devolver uma página incompleta.
   * `maxPages` existe para o sync terminar rápido — o tier gratuito não
   * dá histórico profundo mesmo.
   */
  private async getAll<T>(
    path: string,
    maxPages: number,
    extraParams: Record<string, string | number> = {}
  ): Promise<T[]> {
    const pageSize = 100;
    const all: T[] = [];

    for (let page = 1; page <= maxPages; page++) {
      const rows = await this.getPage<T>(path, {
        ...extraParams,
        "page[size]": pageSize,
        "page[number]": page,
      });

      all.push(...rows);
      if (rows.length < pageSize) break;
    }

    return all;
  }

  /** Times com roster embutido (`players`). */
  listTeams(game: Game, maxPages: number) {
    return this.getAll<PsTeam>(`/${GAME_PATH[game]}/teams`, maxPages);
  }

  listTournaments(game: Game, maxPages: number) {
    return this.getAll<PsTournament>(
      `/${GAME_PATH[game]}/tournaments`,
      maxPages,
      { sort: "-begin_at" }
    );
  }

  /** Partidas passadas (resultados) — mais recentes primeiro. */
  listPastMatches(game: Game, maxPages: number) {
    return this.getAll<PsMatch>(`/${GAME_PATH[game]}/matches/past`, maxPages, {
      sort: "-scheduled_at",
    });
  }

  /** Partidas futuras (calendário) — mais próximas primeiro. */
  listUpcomingMatches(game: Game, maxPages: number) {
    return this.getAll<PsMatch>(
      `/${GAME_PATH[game]}/matches/upcoming`,
      maxPages,
      { sort: "scheduled_at" }
    );
  }

  /** Partidas em andamento agora. */
  listRunningMatches(game: Game, maxPages: number) {
    return this.getAll<PsMatch>(
      `/${GAME_PATH[game]}/matches/running`,
      maxPages
    );
  }
}
