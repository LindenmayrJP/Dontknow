import { RateLimiter, sleep } from "./rate-limiter";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: string
  ) {
    super(`HTTP ${status} em ${url}${body ? ` — ${body.slice(0, 200)}` : ""}`);
    this.name = "HttpError";
  }

  /** 401/403: chave inválida ou expirada — não adianta repetir. */
  get isAuthError() {
    return this.status === 401 || this.status === 403;
  }
}

type RequestOptions = {
  limiter: RateLimiter;
  headers?: Record<string, string>;
  /** Trata 404 como ausência de dado (retorna null) em vez de erro. */
  notFoundAsNull?: boolean;
  maxRetries?: number;
};

/**
 * GET com rate limiting, retry exponencial em 429/5xx e respeito ao
 * header Retry-After. Erros de auth (401/403) sobem na hora, sem retry.
 */
export async function getJson<T>(
  url: string,
  options: RequestOptions
): Promise<T | null> {
  const maxRetries = options.maxRetries ?? 3;

  for (let attempt = 0; ; attempt++) {
    await options.limiter.acquire();

    let response: Response;
    try {
      response = await fetch(url, { headers: options.headers });
    } catch (err) {
      // Falha de rede: retry com backoff.
      if (attempt >= maxRetries) throw err;
      await sleep(2 ** attempt * 1000);
      continue;
    }

    if (response.ok) {
      return (await response.json()) as T;
    }

    if (response.status === 404 && options.notFoundAsNull) {
      return null;
    }

    const body = await response.text().catch(() => "");
    const error = new HttpError(response.status, url, body);

    if (error.isAuthError) throw error;

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= maxRetries) throw error;

    const retryAfter = Number(response.headers.get("retry-after"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 2 ** attempt * 1000;

    console.warn(`  retry em ${wait}ms (HTTP ${response.status})`);
    await sleep(wait);
  }
}
