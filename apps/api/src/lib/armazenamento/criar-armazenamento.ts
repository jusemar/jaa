import type { Ambiente } from "../ambiente.js";
import { armazenamentoIndisponivel, type ArmazenamentoDeArquivos } from "./armazenamento-arquivos.js";
import { criarArmazenamentoR2 } from "./armazenamento-r2.js";

/**
 * Escolhe a implementação a partir do ambiente. Sem credenciais o Jaa NÃO inventa bucket nem URL:
 * fica com o armazenamento indisponível, que recusa upload com aviso claro e deixa o resto do
 * produto funcionando (o avatar cai nas iniciais do nome).
 */
export function criarArmazenamento(ambiente: Ambiente): ArmazenamentoDeArquivos {
  const { R2_CONTA_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = ambiente;
  if (!R2_CONTA_ID || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return armazenamentoIndisponivel;

  return criarArmazenamentoR2({
    contaId: R2_CONTA_ID,
    bucket: R2_BUCKET,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    urlPublica: ambiente.R2_URL_PUBLICA,
    endpoint: ambiente.R2_ENDPOINT,
  });
}
