import { createHash, createHmac } from "node:crypto";

/**
 * Assinatura AWS Signature V4 — o protocolo que o Cloudflare R2 fala (API compatível com S3).
 *
 * Implementado aqui, em ~70 linhas de `node:crypto`, em vez de trazer o SDK da AWS inteiro para
 * assinar dois verbos (PUT e DELETE). O algoritmo é público e estável desde 2012, e os testes usam os
 * vetores oficiais da própria AWS — não é código adivinhado.
 *
 * A chave secreta só existe aqui dentro, no servidor: ela nunca é logada, devolvida nem enviada ao
 * navegador ou ao aplicativo.
 */

const ALGORITMO = "AWS4-HMAC-SHA256";

function sha256Hex(conteudo: string | Buffer): string {
  return createHash("sha256").update(conteudo).digest("hex");
}

function hmac(chave: Buffer | string, dado: string): Buffer {
  return createHmac("sha256", chave).update(dado, "utf8").digest();
}

/** Codificação de URI exigida pelo SigV4 (RFC 3986: mais estrita que encodeURIComponent). */
function codificarComponente(valor: string): string {
  return encodeURIComponent(valor).replace(/[!'()*]/g, (caractere) => `%${caractere.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Codifica cada segmento de um caminho CRU (ex.: a chave do objeto), preservando as barras. */
export function codificarCaminho(caminho: string): string {
  return caminho.split("/").map(codificarComponente).join("/");
}

/*
 * Caminho canônico a partir de uma URL. `URL.pathname` já vem codificado pelo parser; codificar de
 * novo transformaria "%20" em "%2520" e a assinatura não bateria para chaves com espaço ou acento.
 * Por isso cada segmento é decodificado e recodificado UMA vez, no padrão do S3 (que não usa a
 * codificação dupla dos outros serviços da AWS).
 */
function caminhoCanonico(url: URL): string {
  return url.pathname
    .split("/")
    .map((segmento) => codificarComponente(decodeURIComponent(segmento)))
    .join("/");
}

function consultaCanonica(parametros: Iterable<[string, string]>): string {
  return [...parametros]
    .map(([nome, valor]) => [codificarComponente(nome), codificarComponente(valor)] as const)
    .sort(([a, va], [b, vb]) => (a < b ? -1 : a > b ? 1 : va < vb ? -1 : va > vb ? 1 : 0))
    .map(([nome, valor]) => `${nome}=${valor}`)
    .join("&");
}

function carimbosDe(agora: Date): { carimbo: string; dia: string } {
  const carimbo = agora.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return { carimbo, dia: carimbo.slice(0, 8) };
}

function assinar({ secretAccessKey, dia, regiao, servico, paraAssinar }: { secretAccessKey: string; dia: string; regiao: string; servico: string; paraAssinar: string }): string {
  const chaveData = hmac(`AWS4${secretAccessKey}`, dia);
  const chaveRegiao = hmac(chaveData, regiao);
  const chaveServico = hmac(chaveRegiao, servico);
  const chaveAssinatura = hmac(chaveServico, "aws4_request");
  return createHmac("sha256", chaveAssinatura).update(paraAssinar, "utf8").digest("hex");
}

export interface RequisicaoAssinada {
  url: string;
  metodo: string;
  cabecalhos: Record<string, string>;
}

export function assinarRequisicaoS3({
  metodo,
  url,
  regiao,
  servico = "s3",
  accessKeyId,
  secretAccessKey,
  corpo,
  cabecalhosExtras = {},
  agora = new Date(),
}: {
  metodo: "PUT" | "DELETE" | "GET" | "HEAD";
  url: URL;
  regiao: string;
  servico?: string;
  accessKeyId: string;
  secretAccessKey: string;
  corpo: Buffer;
  cabecalhosExtras?: Record<string, string>;
  agora?: Date;
}): RequisicaoAssinada {
  const { carimbo, dia } = carimbosDe(agora);
  const hashCorpo = sha256Hex(corpo);

  const cabecalhos: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": hashCorpo,
    "x-amz-date": carimbo,
    ...Object.fromEntries(Object.entries(cabecalhosExtras).map(([nome, valor]) => [nome.toLowerCase(), valor])),
  };

  const nomesOrdenados = Object.keys(cabecalhos).sort();
  const cabecalhosCanonicos = nomesOrdenados.map((nome) => `${nome}:${cabecalhos[nome]?.trim() ?? ""}\n`).join("");
  const cabecalhosAssinados = nomesOrdenados.join(";");

  const requisicaoCanonica = [metodo, caminhoCanonico(url), consultaCanonica(url.searchParams.entries()), cabecalhosCanonicos, cabecalhosAssinados, hashCorpo].join("\n");
  const escopo = `${dia}/${regiao}/${servico}/aws4_request`;
  const paraAssinar = [ALGORITMO, carimbo, escopo, sha256Hex(requisicaoCanonica)].join("\n");
  const assinatura = assinar({ secretAccessKey, dia, regiao, servico, paraAssinar });

  return {
    url: url.toString(),
    metodo,
    cabecalhos: {
      ...cabecalhos,
      authorization: `${ALGORITMO} Credential=${accessKeyId}/${escopo}, SignedHeaders=${cabecalhosAssinados}, Signature=${assinatura}`,
    },
  };
}

// Limite do próprio SigV4 para URL assinada: 7 dias. Quem usa (armazenamento) aplica um teto bem menor.
const VALIDADE_MAXIMA_SIGV4_SEGUNDOS = 7 * 24 * 60 * 60;

/**
 * URL ASSINADA (presigned) — a mesma assinatura SigV4, só que nos PARÂMETROS da URL em vez do
 * cabeçalho `Authorization`. Quem tem a URL lê o objeto até ela vencer, sem credencial nenhuma; o
 * segredo continua só aqui. Só o cabeçalho `host` é assinado e o corpo não entra (UNSIGNED-PAYLOAD),
 * que é o formato que navegador e app conseguem usar num `<img>`.
 */
export function assinarUrlS3({
  metodo = "GET",
  url,
  regiao,
  servico = "s3",
  accessKeyId,
  secretAccessKey,
  validadeSegundos,
  agora = new Date(),
}: {
  metodo?: "GET" | "HEAD";
  url: URL;
  regiao: string;
  servico?: string;
  accessKeyId: string;
  secretAccessKey: string;
  validadeSegundos: number;
  agora?: Date;
}): string {
  if (!Number.isInteger(validadeSegundos) || validadeSegundos < 1 || validadeSegundos > VALIDADE_MAXIMA_SIGV4_SEGUNDOS) {
    throw new RangeError("Validade da URL assinada fora do limite do SigV4.");
  }

  const { carimbo, dia } = carimbosDe(agora);
  const escopo = `${dia}/${regiao}/${servico}/aws4_request`;
  const parametros: [string, string][] = [
    ...url.searchParams.entries(),
    ["X-Amz-Algorithm", ALGORITMO],
    ["X-Amz-Credential", `${accessKeyId}/${escopo}`],
    ["X-Amz-Date", carimbo],
    ["X-Amz-Expires", String(validadeSegundos)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  const consulta = consultaCanonica(parametros);
  const caminho = caminhoCanonico(url);

  const requisicaoCanonica = [metodo, caminho, consulta, `host:${url.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const paraAssinar = [ALGORITMO, carimbo, escopo, sha256Hex(requisicaoCanonica)].join("\n");
  const assinatura = assinar({ secretAccessKey, dia, regiao, servico, paraAssinar });

  return `${url.protocol}//${url.host}${caminho}?${consulta}&X-Amz-Signature=${assinatura}`;
}
