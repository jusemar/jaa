/*
 * Distribuição do app Jaa: versão, build (binário novo) e update OTA (só JS/TS).
 *
 *   tsx scripts/distribuicao.ts versao
 *   tsx scripts/distribuicao.ts build  <development|production>
 *   tsx scripts/distribuicao.ts update <development|production> "o que mudou"
 *
 * O ambiente é SEMPRE dito por extenso — não existe padrão, para ninguém publicar no lugar errado.
 * Nada aqui toca o desenvolvimento local (Metro, `jaa-android`, `expo run:android`): estas regras
 * valem só para o que é DISTRIBUÍDO pelo EAS.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { IDENTIDADE_DA_VARIANTE, VARIANTES, validarUrlApi, type Variante } from "../src/lib/variante.ts";

const MOBILE = join(dirname(fileURLToPath(import.meta.url)), "..");
const VARIAVEL_API = "EXPO_PUBLIC_JAA_API_URL";
const EAS = ["--yes", "eas-cli@latest"];

const CONFIRMACAO: Record<Variante, { pergunta: string; aceita: (resposta: string) => boolean }> = {
  development: { pergunta: "Continuar? (s/N) ", aceita: (resposta) => resposta.toLowerCase() === "s" },
  production: { pergunta: 'Isto chega aos usuários reais. Digite "PRODUCTION" para continuar: ', aceita: (resposta) => resposta === "PRODUCTION" },
};

type ConfigExpo = {
  name: string;
  version: string;
  scheme: string;
  android: { package: string };
  updates?: { url?: string };
  extra?: { variante?: string; eas?: { projectId?: string } };
};

function falhar(mensagem: string): never {
  console.error(`\n${mensagem}\n`);
  process.exit(1);
}

/** Variáveis do processo com a variante FIXADA: é ela que decide nome, pacote e scheme da configuração. */
function ambienteDoProcesso(variante: Variante): NodeJS.ProcessEnv {
  return { ...process.env, APP_VARIANT: variante };
}

function lerConfig(variante: Variante): ConfigExpo {
  const saida = execFileSync("npx", ["expo", "config", "--json"], { cwd: MOBILE, encoding: "utf8", env: ambienteDoProcesso(variante), stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(saida) as ConfigExpo;
}

function eas(argumentos: string[], variante: Variante): void {
  const { status } = spawnSync("npx", [...EAS, ...argumentos], { cwd: MOBILE, stdio: "inherit", env: ambienteDoProcesso(variante) });
  if (status !== 0) process.exit(status ?? 1);
}

function easCapturando(argumentos: string[], variante: Variante): string {
  return execFileSync("npx", [...EAS, ...argumentos], { cwd: MOBILE, encoding: "utf8", env: ambienteDoProcesso(variante), stdio: ["ignore", "pipe", "pipe"] });
}

function mostrarVersao(): void {
  const config = lerConfig("development");
  const projeto = config.extra?.eas?.projectId;
  console.log(`\nJaa ${config.version}  (runtime dos updates: ${config.version})\n`);
  for (const variante of VARIANTES) {
    const identidade = IDENTIDADE_DA_VARIANTE[variante];
    console.log(`  ${variante.padEnd(12)} ${identidade.nome.padEnd(8)} ${identidade.pacote.padEnd(16)} scheme ${identidade.scheme.padEnd(8)} canal ${identidade.canal}`);
  }
  console.log(`\n  projeto EAS: ${projeto ?? "AINDA NÃO VINCULADO (PROJETO_EAS em app.config.ts)"}`);
  console.log("  versionCode: contado pelo EAS, um por pacote, +1 a cada build. Em cada aparelho: aba Perfil.");
  if (projeto) console.log("               consultar: npx eas-cli@latest build:version:get -p android -e <development|production>");
  console.log("");
}

/** Confere que a configuração resolvida é mesmo a da variante pedida e que o projeto EAS está ligado. */
function exigirConfiguracao(variante: Variante): ConfigExpo {
  const config = lerConfig(variante);
  const identidade = IDENTIDADE_DA_VARIANTE[variante];
  if (config.extra?.variante !== variante || config.android.package !== identidade.pacote || config.scheme !== identidade.scheme || config.name !== identidade.nome) {
    falhar(`A configuração do Expo não corresponde a APP_VARIANT=${variante} (pacote ${config.android.package}). Nada foi publicado.`);
  }
  const projeto = config.extra?.eas?.projectId;
  if (!projeto || config.updates?.url !== `https://u.expo.dev/${projeto}`) {
    falhar(`BLOQUEIO: o app ainda não está vinculado a um projeto EAS (sem projectId/updates.url).
Uma única vez:
  cd ~/jaa/apps/mobile
  npx eas-cli@latest login
  npx eas-cli@latest init
e cole o id informado em PROJETO_EAS (apps/mobile/app.config.ts).`);
  }
  return config;
}

function exigirLogin(variante: Variante): string {
  try {
    return easCapturando(["whoami"], variante).trim().split("\n")[0] ?? "";
  } catch {
    return falhar("Você não está autenticado no Expo. Execute:\n  cd ~/jaa/apps/mobile\n  npx eas-cli@latest login");
  }
}

function exigirUrlDaApi(variante: Variante): string {
  let saida: string;
  try {
    saida = easCapturando(["env:list", variante, "--format", "short"], variante);
  } catch (erro) {
    return falhar(`Não foi possível ler as variáveis do ambiente "${variante}" no EAS.\n${erro instanceof Error ? erro.message : ""}`);
  }
  const valor = saida.match(new RegExp(`${VARIAVEL_API}=(\\S+)`))?.[1];
  const resultado = validarUrlApi(valor, { variante, local: false });
  if (!resultado.ok) {
    falhar(`BLOQUEIO: falta URL pública estável da API de ${variante}. ${resultado.motivo}
Ela precisa ser HTTPS, pública e estável (nada de localhost, IP interno ou túnel temporário).
Quando a API estiver publicada:
  cd ~/jaa/apps/mobile
  npx eas-cli@latest env:set ${variante} --name ${VARIAVEL_API} --value https://<api> --visibility plaintext`);
  }
  return resultado.url;
}

function avisarSobreGit(): void {
  const sujo = spawnSync("git", ["status", "--porcelain"], { cwd: MOBILE, encoding: "utf8" }).stdout.trim();
  if (sujo) console.log("ATENÇÃO: há alterações não commitadas — elas entram nesta publicação.\n");
}

async function confirmar(variante: Variante): Promise<void> {
  const leitor = createInterface({ input: process.stdin, output: process.stdout });
  const resposta = (await leitor.question(CONFIRMACAO[variante].pergunta)).trim();
  leitor.close();
  if (!CONFIRMACAO[variante].aceita(resposta)) falhar("Cancelado. Nada foi publicado.");
}

function lerVarianteExplicita(acao: string, valor: string | undefined): Variante {
  const variante = VARIANTES.find((opcao) => opcao === valor);
  if (!variante) falhar(`Informe o ambiente por extenso: ${acao} <${VARIANTES.join("|")}>.`);
  return variante;
}

function preparar(acao: "build" | "update", variante: Variante): ConfigExpo {
  const config = exigirConfiguracao(variante);
  const conta = exigirLogin(variante);
  const api = exigirUrlDaApi(variante);
  const titulo = `${acao === "build" ? "GERANDO BUILD" : "PUBLICANDO UPDATE"} ${variante.toUpperCase()}`;
  const linha = "=".repeat(titulo.length + 8);
  console.log(`\n${linha}\n=== ${titulo} ===\n${linha}\n`);
  console.log(`  app:        ${config.name} (${config.android.package})`);
  console.log(`  conta Expo: ${conta}`);
  console.log(`  versão:     ${config.version} (runtime ${config.version})`);
  console.log(`  canal:      ${IDENTIDADE_DA_VARIANTE[variante].canal}`);
  console.log(`  API:        ${api}`);
  return config;
}

async function gerarBuild(variante: Variante): Promise<void> {
  preparar("build", variante);
  console.log(`  formato:    ${variante === "development" ? "APK instalável por link/QR (abre direto, sem Metro)" : "AAB para a Google Play"}`);
  console.log("  build nº:   o EAS soma 1 ao último deste pacote (nada muda no código-fonte)\n");
  avisarSobreGit();
  await confirmar(variante);
  // O perfil do eas.json tem o mesmo nome do ambiente.
  eas(["build", "--platform", "android", "--profile", variante], variante);
}

async function publicarUpdate(variante: Variante, mensagem: string): Promise<void> {
  if (!mensagem) falhar(`Diga o que mudou: update ${variante} "texto curto".`);
  const config = preparar("update", variante);
  console.log(`  mensagem:   ${mensagem}\n`);
  console.log(`Só recebem este update os aparelhos com ${config.name} ${config.version} instalado.`);
  console.log("Mudança NATIVA (biblioteca, permissão, plugin) não vai por update: exige nova versão + novo build.\n");
  avisarSobreGit();
  await confirmar(variante);
  eas(["update", "--channel", IDENTIDADE_DA_VARIANTE[variante].canal, "--environment", variante, "--platform", "android", "--message", mensagem], variante);
}

async function executar(): Promise<void> {
  const [acao, ambiente, ...resto] = process.argv.slice(2);
  if (acao === "versao") mostrarVersao();
  else if (acao === "build") await gerarBuild(lerVarianteExplicita("build", ambiente));
  else if (acao === "update") await publicarUpdate(lerVarianteExplicita("update", ambiente), resto.join(" ").trim());
  else falhar('Uso: distribuicao.ts versao | build <development|production> | update <development|production> "o que mudou"');
}

void executar();
