import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { ehHostLocal, PREFIXO_BANCO_TESTE as PREFIXO } from "../src/banco-de-teste.js";

/*
 * Executa um comando contra um BANCO DE TESTE DESCARTÁVEL, nunca contra o banco de desenvolvimento.
 *
 *   tsx scripts/com-banco-teste.ts <comando> [args...]
 *
 * 1. usa o servidor do DATABASE_URL atual (somente PostgreSQL LOCAL: host remoto é recusado, para que
 *    nenhum banco seja criado em produção por engano);
 * 2. cria `jaa_teste_<horário>_<pid>` e aplica TODAS as migrations versionadas (as mesmas do drizzle-kit);
 * 3. roda o comando com DATABASE_URL apontando para ele e JAA_BANCO_TESTE=1;
 * 4. apaga o banco ao final — inclusive em falha ou Ctrl+C — e remove sobras antigas de execuções
 *    interrompidas. Nenhuma URL é impressa (pode conter credenciais).
 */

// Sobra de execução interrompida (ex.: processo morto): só é removida depois deste tempo, para não
// apagar o banco de outra execução em andamento ao mesmo tempo.
const IDADE_SOBRA_MS = 6 * 60 * 60 * 1000;

const [comando, ...argumentos] = process.argv.slice(2);
if (!comando) {
  console.error("Uso: tsx scripts/com-banco-teste.ts <comando> [args...]");
  process.exit(1);
}

// Mesmo critério do drizzle.config.ts: variáveis já definidas no ambiente têm prioridade.
if (existsSync(".env")) process.loadEnvFile(".env");
const urlBase = process.env.DATABASE_URL;
if (!urlBase) {
  console.error("DATABASE_URL não definida: não há servidor PostgreSQL local para criar o banco de teste.");
  process.exit(1);
}

if (!ehHostLocal(urlBase)) {
  console.error("Recusado: o banco de teste só é criado em PostgreSQL LOCAL (DATABASE_URL aponta para host remoto).");
  process.exit(1);
}

const nomeBanco = `${PREFIXO}${Date.now()}_${process.pid}`;
const urlTeste = new URL(urlBase);
urlTeste.pathname = `/${nomeBanco}`;

async function comAdministracao<T>(executar: (cliente: Client) => Promise<T>): Promise<T> {
  const cliente = new Client({ connectionString: urlBase });
  await cliente.connect();
  try {
    return await executar(cliente);
  } finally {
    await cliente.end();
  }
}

// Identificador gerado aqui mesmo (prefixo + dígitos), então a interpolação no DDL é segura.
const apagar = (cliente: Client, nome: string) => cliente.query(`drop database if exists "${nome}" with (force)`);

async function removerSobras(): Promise<void> {
  await comAdministracao(async (cliente) => {
    const { rows } = await cliente.query<{ datname: string }>("select datname from pg_database where datname like $1", [`${PREFIXO}%`]);
    for (const { datname } of rows) {
      const criadoEm = Number(new RegExp(`^${PREFIXO}(\\d+)_\\d+$`).exec(datname)?.[1]);
      if (Number.isFinite(criadoEm) && Date.now() - criadoEm > IDADE_SOBRA_MS) await apagar(cliente, datname);
    }
  });
}

async function criarEMigrar(): Promise<void> {
  await comAdministracao((cliente) => cliente.query(`create database "${nomeBanco}"`));
  const cliente = new Client({ connectionString: urlTeste.toString() });
  await cliente.connect();
  try {
    await migrate(drizzle({ client: cliente }), { migrationsFolder: resolve(import.meta.dirname, "../drizzle") });
  } finally {
    await cliente.end();
  }
}

function executar(): Promise<number> {
  return new Promise((concluir) => {
    const filho = spawn(comando as string, argumentos, {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: urlTeste.toString(), JAA_BANCO_TESTE: "1" },
    });
    // Ctrl+C chega ao filho pelo grupo do terminal; aqui só garantimos esperar ele terminar para limpar.
    process.on("SIGINT", () => undefined);
    process.on("SIGTERM", () => filho.kill("SIGTERM"));
    filho.on("exit", (codigo, sinal) => concluir(codigo ?? (sinal ? 1 : 0)));
    filho.on("error", (erro) => {
      console.error(`Falha ao iniciar "${comando}":`, erro.message);
      concluir(1);
    });
  });
}

let codigoSaida = 1;
try {
  await removerSobras();
  await criarEMigrar();
  console.log(`Banco de teste isolado: ${nomeBanco} (será apagado ao final).`);
  codigoSaida = await executar();
} catch (erro) {
  console.error("Falha ao preparar o banco de teste:", erro instanceof Error ? erro.message : erro);
} finally {
  await comAdministracao((cliente) => apagar(cliente, nomeBanco)).catch((erro: unknown) => {
    console.error(`Não foi possível apagar ${nomeBanco}:`, erro instanceof Error ? erro.message : erro);
    codigoSaida = 1;
  });
}
process.exit(codigoSaida);
