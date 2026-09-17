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

/** Codificação de URI exigida pelo SigV4 (mais estrita que encodeURIComponent). */
export function codificarCaminho(caminho: string): string {
  return caminho
    .split("/")
    .map((parte) => encodeURIComponent(parte).replace(/[!'()*]/g, (caractere) => `%${caractere.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
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
  const carimbo = agora.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dia = carimbo.slice(0, 8);
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

  const consultaCanonica = [...url.searchParams.entries()]
    .map(([nome, valor]) => [encodeURIComponent(nome), encodeURIComponent(valor)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([nome, valor]) => `${nome}=${valor}`)
    .join("&");

  const requisicaoCanonica = [metodo, codificarCaminho(url.pathname), consultaCanonica, cabecalhosCanonicos, cabecalhosAssinados, hashCorpo].join("\n");
  const escopo = `${dia}/${regiao}/${servico}/aws4_request`;
  const paraAssinar = [ALGORITMO, carimbo, escopo, sha256Hex(requisicaoCanonica)].join("\n");

  const chaveData = hmac(`AWS4${secretAccessKey}`, dia);
  const chaveRegiao = hmac(chaveData, regiao);
  const chaveServico = hmac(chaveRegiao, servico);
  const chaveAssinatura = hmac(chaveServico, "aws4_request");
  const assinatura = createHmac("sha256", chaveAssinatura).update(paraAssinar, "utf8").digest("hex");

  return {
    url: url.toString(),
    metodo,
    cabecalhos: {
      ...cabecalhos,
      authorization: `${ALGORITMO} Credential=${accessKeyId}/${escopo}, SignedHeaders=${cabecalhosAssinados}, Signature=${assinatura}`,
    },
  };
}
