/**
 * Inicializador do Esports Hub — o que o Iniciar.bat executa.
 *
 * Ordem pensada para o usuário ver a tela rápido: migrations primeiro
 * (precisam existir antes de qualquer query), depois o frontend, e a sync
 * roda em paralelo. A página abre com o dado que já está no banco e é
 * atualizada pela sync sem bloquear a abertura.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT ?? 3000);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const cor = {
  reset: "\x1b[0m", dim: "\x1b[2m", verde: "\x1b[32m",
  vermelho: "\x1b[31m", azul: "\x1b[36m", amarelo: "\x1b[33m",
};
const log = (msg) => console.log(`${cor.azul}▸${cor.reset} ${msg}`);
const ok = (msg) => console.log(`${cor.verde}✓${cor.reset} ${msg}`);
const erro = (msg) => console.error(`${cor.vermelho}✗ ${msg}${cor.reset}`);

/**
 * Sobe um processo pelo shell. O comando vai como string única, e não como
 * array de argumentos, porque `shell: true` com array dispara o aviso
 * DEP0190 do Node. Todos os comandos aqui são literais do próprio projeto.
 */
function sh(comando, stdio) {
  return spawn(comando, { cwd: ROOT, stdio, shell: true });
}

/** Roda um comando até o fim. Rejeita se sair com código != 0. */
function run(comando, { silent = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = sh(comando, silent ? ["ignore", "ignore", "ignore"] : "inherit");
    p.on("error", reject);
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`"${comando}" saiu com código ${code}`))
    );
  });
}

function portaAberta(porta) {
  return new Promise((resolve) => {
    const s = createConnection({ port: porta, host: "127.0.0.1" });
    s.on("connect", () => { s.end(); resolve(true); });
    s.on("error", () => resolve(false));
    setTimeout(() => { s.destroy(); resolve(false); }, 1000);
  });
}

async function esperarPorta(porta, tentativas = 90) {
  for (let i = 0; i < tentativas; i++) {
    if (await portaAberta(porta)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function abrirNavegador(url) {
  const cmds = {
    win32: ["cmd", ["/c", "start", "", url]],
    darwin: ["open", [url]],
    linux: ["xdg-open", [url]],
  };
  const [cmd, args] = cmds[process.platform] ?? cmds.linux;
  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
}

function checarEnv() {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) {
    throw new Error(
      "Arquivo .env não encontrado.\n" +
      "  Copie o .env.example para .env e preencha DATABASE_URL."
    );
  }
  const conteudo = readFileSync(envPath, "utf-8");
  const linha = conteudo.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
  const valor = linha?.slice("DATABASE_URL=".length).trim();

  if (!valor || valor.includes("user:password@localhost")) {
    throw new Error(
      "DATABASE_URL não está configurada no .env (ainda está com o valor de exemplo).\n" +
      "  Cole ali a connection string do seu Postgres."
    );
  }
}

async function main() {
  console.log(`\n${cor.azul}=== Esports Hub ===${cor.reset}\n`);

  checarEnv();

  if (!existsSync(join(ROOT, "node_modules"))) {
    log("Primeira execução: instalando dependências (pode demorar alguns minutos)…");
    await run(`${npm} install`);
    ok("Dependências instaladas");
  }

  if (await portaAberta(PORT)) {
    ok(`Já havia algo rodando na porta ${PORT} — abrindo o navegador`);
    abrirNavegador(`http://localhost:${PORT}`);
    return;
  }

  log("Verificando o banco de dados…");
  await run(`${npm} run db:migrate`, { silent: true });
  ok("Banco pronto");

  log("Iniciando o site…");
  const frontend = sh(`${npm} run dev -- -p ${PORT}`, ["ignore", "pipe", "inherit"]);
  frontend.stdout.on("data", (d) => {
    const txt = String(d);
    // Silencia o ruído do Next, mostra só erros de compilação.
    if (/error|Error/.test(txt)) process.stdout.write(txt);
  });

  // A sync roda em paralelo: a página já abre com o dado que está no banco.
  log("Atualizando dados do PandaScore em segundo plano…");
  const sync = sh(`${npm} run sync`, ["ignore", "pipe", "pipe"]);
  let resumoSync = "";
  sync.stdout.on("data", (d) => { resumoSync += String(d); });
  sync.on("exit", (code) => {
    if (code === 0) {
      const linha = resumoSync.match(/duração: [\d.]+s/)?.[0] ?? "";
      ok(`Dados atualizados ${cor.dim}${linha}${cor.reset}`);
    } else {
      console.log(
        `${cor.amarelo}!${cor.reset} A atualização de dados falhou — ` +
        `o site segue funcionando com o que já estava no banco.`
      );
    }
  });

  const subiu = await esperarPorta(PORT);
  if (!subiu) {
    erro(`O site não subiu na porta ${PORT}. Veja os erros acima.`);
    frontend.kill();
    sync.kill();
    process.exitCode = 1;
    return;
  }

  const url = `http://localhost:${PORT}`;
  ok(`Site no ar: ${cor.azul}${url}${cor.reset}`);
  abrirNavegador(url);
  console.log(`\n${cor.dim}Feche esta janela ou pressione Ctrl+C para parar.${cor.reset}\n`);

  const parar = () => {
    frontend.kill();
    sync.kill();
    process.exit(0);
  };
  process.on("SIGINT", parar);
  process.on("SIGTERM", parar);
  frontend.on("exit", () => process.exit(0));
}

main().catch((e) => {
  erro(e.message);
  process.exitCode = 1;
});
