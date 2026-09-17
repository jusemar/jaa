import { assinarRequisicaoS3, codificarCaminho } from "./assinatura-s3.js";
import type { ArmazenamentoDeArquivos } from "./armazenamento-arquivos.js";

/**
 * CLOUDFLARE R2 — primeira implementação real de `ArmazenamentoDeArquivos`.
 *
 * As credenciais são SEGREDO DE SERVIDOR: nunca vão para o Web nem para o Mobile, e o upload é sempre
 * intermediado pela API (que valida tipo, tamanho e autorização antes de gravar qualquer byte).
 * Por isso não há URL pré-assinada para o navegador nesta etapa.
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

export function criarArmazenamentoR2(configuracao: ConfiguracaoR2): ArmazenamentoDeArquivos {
  const buscar = configuracao.buscar ?? fetch;
  const endpoint = (configuracao.endpoint ?? `https://${configuracao.contaId}.r2.cloudflarestorage.com`).replace(/\/+$/, "");
  const publica = configuracao.urlPublica?.replace(/\/+$/, "");

  function urlDoObjeto(chave: string): URL {
    return new URL(`${endpoint}/${configuracao.bucket}/${codificarCaminho(chave)}`);
  }

  async function enviar(metodo: "PUT" | "DELETE", chave: string, conteudo: Buffer, tipoConteudo?: string) {
    const assinada = assinarRequisicaoS3({
      metodo,
      url: urlDoObjeto(chave),
      // R2 ignora a região, mas o algoritmo exige uma: "auto" é a documentada pela Cloudflare.
      regiao: "auto",
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
    async salvar({ chave, conteudo, tipoConteudo }) {
      await enviar("PUT", chave, conteudo, tipoConteudo);
      return { chave };
    },
    async remover(chave) {
      await enviar("DELETE", chave, Buffer.alloc(0));
    },
    urlPublica(chave) {
      return publica ? `${publica}/${codificarCaminho(chave)}` : null;
    },
  };
}
