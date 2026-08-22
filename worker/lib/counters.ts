type Stat = { created: number; updated: number; skipped: number };

/** Contadores de criado/atualizado por tabela, para o log final do sync. */
export class Counters {
  private stats = new Map<string, Stat>();

  private get(table: string): Stat {
    let stat = this.stats.get(table);
    if (!stat) {
      stat = { created: 0, updated: 0, skipped: 0 };
      this.stats.set(table, stat);
    }
    return stat;
  }

  /** `inserted` vem do truque `xmax = 0` no RETURNING do upsert. */
  record(table: string, inserted: boolean) {
    const stat = this.get(table);
    if (inserted) stat.created++;
    else stat.updated++;
  }

  skip(table: string, n = 1) {
    this.get(table).skipped += n;
  }

  print(title: string) {
    console.log(`\n${title}`);
    if (this.stats.size === 0) {
      console.log("  (nenhum registro)");
      return;
    }
    for (const [table, stat] of [...this.stats].sort()) {
      const parts = [`${stat.created} criados`, `${stat.updated} atualizados`];
      if (stat.skipped > 0) parts.push(`${stat.skipped} ignorados`);
      console.log(`  ${table.padEnd(22)} ${parts.join(", ")}`);
    }
  }
}
