import { assinarRequisicaoS3, assinarUrlS3, codificarCaminho } from "./assinatura-s3.js";
import {
  VALIDADE_MAXIMA_URL_ASSINADA_SEGUNDOS,
  VALIDADE_MINIMA_URL_ASSINADA_SEGUNDOS,
  VALIDADE_PADRAO_URL_ASSINADA_SEGUNDOS,
  type ArmazenamentoDeArquivos,
  type ArmazenamentoPrivado,
  type OperacoesDeArmazenamento,
} from "./armazenamento-arquivos.js";

/**
 * CLOUDFLARE R2 — implementação real do armazenamento PÚBLICO e do PRIVADO.
 *
 * As credenciais são SEGREDO DE SERVIDOR: nunca vão para o Web nem para o Mobile, e o envio é sempre
 * intermediado pela API (que valida tipo, tamanho e autorização antes de gravar qualquer byte).
 * Não existe URL assinada de ESCRITA. A única URL assinada é a de LEITURA do bucket privado, gerada
 * depois da autorização e com validade curta.
 */
export interface ConfiguracaoR2 {
  contaId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Domínio público de leitura do bucket (r2.dev ou domínio próprio), quando houver. */
  urlPublica?: string | undefined;
  /** Endpoint alternativo; por padrão o da conta. Útil para homologação. */
  endpoint?: string | undefined;
  buscar?: typeof fetch;
}

// R2 ignora a região, mas o SigV4 exige uma: "auto" é a documentada pela Cloudflare.
const REGIAO_R2 = "auto";

type ConfiguracaoBucketR2 = Omit<ConfiguracaoR2, "urlPublica">;

/** Gravar e remover (PUT/DELETE assinados) — comum aos buckets público e privado. */
function criarOperacoesR2(configuracao: ConfiguracaoBucketR2): OperacoesDeArmazenamento & { urlDoObjeto: (chave: string) => URL } {
  const buscar = configuracao.buscar ?? fetch;
  const endpoint = (configuracao.endpoint ?? `https://${configuracao.contaId}.r2.cloudflarestorage.com`).replace(/\/+$/, "");

  function urlDoObjeto(chave: string): URL {
    return new URL(`${endpoint}/${configuracao.bucket}/${codificarCaminho(chave)}`);
  }

  async function enviar(metodo: "PUT" | "DELETE", chave: string, conteudo: Buffer, tipoConteudo?: string) {
    const assinada = assinarRequisicaoS3({
      metodo,
      url: urlDoObjeto(chave),
      regiao: REGIAO_R2,
      accessKeyId: configuracao.accessKeyId,
      secretAccessKey: configuracao.secretAccessKey,
      corpo: conteudo,
      cabecalhosExtras: tipoConteudo ? { "content-type": tipoConteudo } : {},
    });

    const resposta = await buscar(assinada.url, { method: metodo, headers: assinada.cabecalhos, body: metodo === "PUT" ? new Uint8Array(conteudo) : undefined });

    if (!resposta.ok && !(metodo === "DELETE" && resposta.status === 404)) {
      // O corpo do erro do R2 é XML sem segredo, mas o status já basta e evita vazar detalhe interno.
      throw new Error(`Armazenamento respondeu ${resposta.status} ao ${metodo === "PUT" ? "gravar" : "remover"} o arquivo.`);
    }
  }

  return {
    nome: "cloudflare-r2",
    urlDoObjeto,
    async salvar({ chave, conteudo, tipoConteudo }) {
      await enviar("PUT", chave, conteudo, tipoConteudo);
      return { chave };
    },
    async remover(chave) {
      await enviar("DELETE", chave, Buffer.alloc(0));
    },
  };
}

export function criarArmazenamentoR2(configuracao: ConfiguracaoR2): ArmazenamentoDeArquivos {
  const { nome, salvar, remover } = criarOperacoesR2(configuracao);
  const publica = configuracao.urlPublica?.replace(/\/+$/, "");
  return {
    nome,
    salvar,
    remover,
    urlPublica(chave) {
      return publica ? `${publica}/${codificarCaminho(chave)}` : null;
    },
  };
}

/**
 * Bucket PRIVADO: grava e remove como o público, mas a leitura é só por URL ASSINADA (GET com
 * validade curta). Não há `urlPublica` — nem por engano um objeto privado ganha endereço permanente.
 */
export function criarArmazenamentoR2Privado(configuracao: ConfiguracaoBucketR2): ArmazenamentoPrivado {
  const { nome, salvar, remover, urlDoObjeto } = criarOperacoesR2(configuracao);
  return {
    nome,
    salvar,
    remover,
    urlAssinadaLeitura(chave, { validadeSegundos = VALIDADE_PADRAO_URL_ASSINADA_SEGUNDOS, agora = new Date() } = {}) {
      if (!Number.isInteger(validadeSegundos) || validadeSegundos < VALIDADE_MINIMA_URL_ASSINADA_SEGUNDOS || validadeSegundos > VALIDADE_MAXIMA_URL_ASSINADA_SEGUNDOS) {
        throw new RangeError(`Validade da URL assinada deve ficar entre ${VALIDADE_MINIMA_URL_ASSINADA_SEGUNDOS} e ${VALIDADE_MAXIMA_URL_ASSINADA_SEGUNDOS} segundos.`);
      }
      return assinarUrlS3({
        url: urlDoObjeto(chave),
        regiao: REGIAO_R2,
        accessKeyId: configuracao.accessKeyId,
        secretAccessKey: configuracao.secretAccessKey,
        validadeSegundos,
        agora,
      });
    },
  };
}
