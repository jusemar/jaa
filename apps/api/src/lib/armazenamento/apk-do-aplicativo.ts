import { createHash } from "node:crypto";
import { assinarRequisicaoS3, codificarCaminho, type RequisicaoAssinada } from "./assinatura-s3.js";

/*
 * APK oficial do aplicativo Android, publicado no bucket PÚBLICO do R2 para download direto pelo site
 * (o arquivo nunca passa pela Web nem pela API). Aqui ficam só as regras; quem executa o envio é
 * `scripts/publicar-apk.ts`, uma ação manual de quem tem as credenciais do servidor.
 *
 * ENDEREÇO FIXO: o APK atual fica sempre na mesma chave, então publicar uma versão nova é só enviar de
 * novo — nenhum link, variável ou deploy muda. Para ninguém receber a versão antiga por cache, o
 * objeto é gravado com `no-cache`: navegador e CDN conferem com o armazenamento (ETag) a cada download.
 */
export const NOME_DO_ARQUIVO_APK = "jaaa.apk";
export const CHAVE_DO_APK = `app/android/${NOME_DO_ARQUIVO_APK}`;

// Gravados COM o objeto: o R2 os devolve a quem baixa. O nome do arquivo salvo vem daqui.
export const CABECALHOS_DO_APK = {
  "content-type": "application/vnd.android.package-archive",
  "content-disposition": `attachment; filename="${NOME_DO_ARQUIVO_APK}"`,
  "cache-control": "no-cache",
} as const;

// Um envio único (PUT) do R2 aceita até 5 GB; bem antes disso algo está errado com o arquivo.
const TAMANHO_MAXIMO_BYTES = 1024 * 1024 * 1024;
const TAMANHO_MINIMO_BYTES = 1024 * 1024;

export type ConferenciaDoApk = { ok: true; tamanhoBytes: number; sha256: string } | { ok: false; motivo: string };

/** O arquivo parece mesmo um APK? Confere extensão, tamanho e a assinatura ZIP dos primeiros bytes. */
export function conferirApk(nomeDoArquivo: string, conteudo: Buffer): ConferenciaDoApk {
  if (!nomeDoArquivo.toLowerCase().endsWith(".apk")) return { ok: false, motivo: "O arquivo precisa ter a extensão .apk." };
  if (conteudo.length < TAMANHO_MINIMO_BYTES) return { ok: false, motivo: "Arquivo pequeno demais para ser o aplicativo." };
  if (conteudo.length > TAMANHO_MAXIMO_BYTES) return { ok: false, motivo: "Arquivo grande demais para um envio único." };
  // Todo APK é um ZIP: começa com "PK\x03\x04".
  if (conteudo[0] !== 0x50 || conteudo[1] !== 0x4b || conteudo[2] !== 0x03 || conteudo[3] !== 0x04) return { ok: false, motivo: "O conteúdo não é um APK (não é um arquivo ZIP)." };
  return { ok: true, tamanhoBytes: conteudo.length, sha256: createHash("sha256").update(conteudo).digest("hex") };
}

export interface DestinoDoApk {
  contaId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  urlPublica: string;
  endpoint?: string | undefined;
}

/** Endereço público de download — o valor de `NEXT_PUBLIC_APP_DOWNLOAD_URL` da Web. */
export function urlPublicaDoApk(urlPublica: string): string {
  return `${urlPublica.replace(/\/+$/, "")}/${codificarCaminho(CHAVE_DO_APK)}`;
}

/** Requisição assinada (SigV4) que grava o APK na chave fixa, com nome, tipo e cache definidos. */
export function prepararEnvioDoApk(destino: DestinoDoApk, conteudo: Buffer, agora = new Date()): RequisicaoAssinada {
  const endpoint = (destino.endpoint ?? `https://${destino.contaId}.r2.cloudflarestorage.com`).replace(/\/+$/, "");
  return assinarRequisicaoS3({
    metodo: "PUT",
    url: new URL(`${endpoint}/${destino.bucket}/${codificarCaminho(CHAVE_DO_APK)}`),
    regiao: "auto",
    accessKeyId: destino.accessKeyId,
    secretAccessKey: destino.secretAccessKey,
    corpo: conteudo,
    cabecalhosExtras: { ...CABECALHOS_DO_APK },
    agora,
  });
}
