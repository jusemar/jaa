import { situacaoArmazenamentoPrivado, type Ambiente } from "../ambiente.js";
import { armazenamentoIndisponivel, armazenamentoPrivadoIndisponivel, type ArmazenamentoDeArquivos, type ArmazenamentoPrivado } from "./armazenamento-arquivos.js";
import { criarArmazenamentoR2, criarArmazenamentoR2Privado } from "./armazenamento-r2.js";

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

/**
 * Bucket PRIVADO (futuras mídias de conversa), independente do público: usa a MESMA conta e o mesmo
 * endpoint, com bucket e token próprios. Incompleto ou ausente → indisponível (nunca usa o público).
 */
export function criarArmazenamentoPrivado(ambiente: Ambiente): ArmazenamentoPrivado {
  const { R2_CONTA_ID, R2_BUCKET_PRIVADO, R2_ACCESS_KEY_ID_PRIVADO, R2_SECRET_ACCESS_KEY_PRIVADO } = ambiente;
  if (situacaoArmazenamentoPrivado(ambiente) !== "completo" || !R2_CONTA_ID || !R2_BUCKET_PRIVADO || !R2_ACCESS_KEY_ID_PRIVADO || !R2_SECRET_ACCESS_KEY_PRIVADO) {
    return armazenamentoPrivadoIndisponivel;
  }

  return criarArmazenamentoR2Privado({
    contaId: R2_CONTA_ID,
    bucket: R2_BUCKET_PRIVADO,
    accessKeyId: R2_ACCESS_KEY_ID_PRIVADO,
    secretAccessKey: R2_SECRET_ACCESS_KEY_PRIVADO,
    endpoint: ambiente.R2_ENDPOINT,
  });
}
