export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rate limiter de janela deslizante: no máximo `max` chamadas por `windowMs`.
 * `minGapMs` espaça chamadas consecutivas para não estourar limites por segundo.
 *
 * Uso sequencial (o sync roda em série), então não há corrida entre acquires.
 */
export class RateLimiter {
  private hits: number[] = [];

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly minGapMs = 0
  ) {}

  async acquire(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.hits = this.hits.filter((t) => now - t < this.windowMs);

      if (this.hits.length >= this.max) {
        // Janela cheia: espera o slot mais antigo expirar.
        const wait = this.windowMs - (now - this.hits[0]) + 10;
        await sleep(wait);
        continue;
      }

      const last = this.hits[this.hits.length - 1];
      if (this.minGapMs > 0 && last !== undefined && now - last < this.minGapMs) {
        await sleep(this.minGapMs - (now - last));
        continue;
      }

      this.hits.push(Date.now());
      return;
    }
  }
}
