/*
 * Publica o APK oficial do Jaaa no bucket PÚBLICO do R2, no endereço fixo de download do site.
 *
 *   npm run app:publicar-apk -w @jaa/api -- <caminho/do/arquivo.apk>
 *
 * Ação MANUAL de quem tem as credenciais do servidor: usa as variáveis R2_* do ambiente em que roda
 * (por padrão o `.env` da API). SUBSTITUI o APK que os usuários baixam — por isso mostra o destino e
 * pede confirmação. Não altera o arquivo: envia os mesmos bytes e confere o resultado pelo endereço
 * público. Nenhuma credencial é impressa.
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { createInterface } from "node:readline/promises";
import { CABECALHOS_DO_APK, CHAVE_DO_APK, conferirApk, prepararEnvioDoApk, urlPublicaDoApk, type DestinoDoApk } from "../src/lib/armazenamento/apk-do-aplicativo.js";

function falhar(mensagem: string): never {
  console.error(`\n${mensagem}\n`);
  process.exit(1);
}

function lerDestino(): DestinoDoApk {
  const { R2_CONTA_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_URL_PUBLICA, R2_ENDPOINT } = process.env;
  const faltando = Object.entries({ R2_CONTA_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_URL_PUBLICA })
    .filter(([, valor]) => !valor)
    .map(([nome]) => nome);
  if (faltando.length > 0 || !R2_CONTA_ID || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_URL_PUBLICA) {
    return falhar(`Armazenamento público não configurado neste ambiente. Faltando: ${faltando.join(", ")}.`);
  }
  if (!R2_URL_PUBLICA.startsWith("https://")) falhar("R2_URL_PUBLICA precisa ser um endereço HTTPS.");
  return { contaId: R2_CONTA_ID, bucket: R2_BUCKET, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, urlPublica: R2_URL_PUBLICA, endpoint: R2_ENDPOINT || undefined };
}

async function confirmar(): Promise<void> {
  const leitor = createInterface({ input: process.stdin, output: process.stdout });
  const resposta = (await leitor.question('Isto substitui o APK que os usuários baixam. Digite "PUBLICAR" para continuar: ')).trim();
  leitor.close();
  if (resposta !== "PUBLICAR") falhar("Cancelado. Nada foi enviado.");
}

async function executar(): Promise<void> {
  const caminho = process.argv[2];
  if (!caminho) falhar("Uso: npm run app:publicar-apk -w @jaa/api -- <caminho/do/arquivo.apk>");

  const destino = lerDestino();
  const conteudo = await readFile(caminho).catch(() => falhar(`Não foi possível ler "${caminho}".`));
  const conferencia = conferirApk(basename(caminho), conteudo);
  if (!conferencia.ok) falhar(`Arquivo recusado: ${conferencia.motivo}`);

  const url = urlPublicaDoApk(destino.urlPublica);
  console.log("\n=== PUBLICAR APK DO JAAA ===\n");
  console.log(`  arquivo:  ${caminho}`);
  console.log(`  tamanho:  ${(conferencia.tamanhoBytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  sha-256:  ${conferencia.sha256}`);
  console.log(`  bucket:   ${destino.bucket}`);
  console.log(`  chave:    ${CHAVE_DO_APK}`);
  console.log(`  endereço: ${url}\n`);
  await confirmar();

  const envio = prepararEnvioDoApk(destino, conteudo);
  const resposta = await fetch(envio.url, { method: "PUT", headers: envio.cabecalhos, body: new Uint8Array(conteudo) });
  if (!resposta.ok) falhar(`O armazenamento respondeu ${resposta.status} ao gravar o APK. Nada foi publicado.`);

  // Confere pelo endereço PÚBLICO: é o que o usuário vai receber.
  const publicado = await fetch(url, { method: "HEAD", cache: "no-store" });
  const problemas: string[] = [];
  if (!publicado.ok) problemas.push(`o endereço público respondeu ${publicado.status}`);
  if (publicado.headers.get("content-length") !== String(conferencia.tamanhoBytes)) problemas.push("o tamanho publicado não confere");
  if (publicado.headers.get("content-disposition") !== CABECALHOS_DO_APK["content-disposition"]) problemas.push("o nome do arquivo (Content-Disposition) não confere");
  if (problemas.length > 0) falhar(`APK enviado, mas a conferência pública falhou: ${problemas.join("; ")}.\nVerifique o acesso público do bucket antes de divulgar o link.`);

  console.log("\nAPK publicado e conferido.");
  console.log(`Endereço de download (NEXT_PUBLIC_APP_DOWNLOAD_URL da Web):\n  ${url}\n`);
}

void executar();
