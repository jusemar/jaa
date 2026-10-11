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

/** O que o R2 disse ao recusar, já sem nada sensível. Vai para o LOG do servidor, nunca para o cliente. */
export interface DiagnosticoR2 {
  status: number;
  codigo: string | null;
  mensagem: string | null;
  requestId: string | null;
  /** Só a FORMA das credenciais (o valor nunca): chave de acesso do R2 tem 32 caracteres hexadecimais e a secreta, 64. */
  formatoDasCredenciais: "esperado" | "inesperado";
}

/**
 * A mensagem do erro continua genérica (é ela que a resposta HTTP 500 carrega); o detalhe do provedor
 * fica em `provedor`, que o log estruturado do servidor registra junto do erro.
 */
export class ErroDoArmazenamentoR2 extends Error {
  readonly provedor: DiagnosticoR2;

  constructor(operacao: "gravar" | "remover", provedor: DiagnosticoR2) {
    super(`Armazenamento respondeu ${provedor.status} ao ${operacao} o arquivo.`);
    this.name = "ErroDoArmazenamentoR2";
    this.provedor = provedor;
  }
}

const TAMANHO_MAXIMO_DO_DIAGNOSTICO = 300;

function campoDoXml(xml: string, nome: string): string | null {
  const valor = new RegExp(`<${nome}>([^<]*)</${nome}>`).exec(xml)?.[1]?.trim();
  return valor ? valor : null;
}

/*
 * Lê o XML de erro do R2 (<Error><Code>…</Code><Message>…</Message></Error>) e guarda só Code, Message
 * e RequestId. Nada da requisição entra aqui (URL, cabeçalhos, Authorization, assinatura), e as
 * credenciais são apagadas do texto caso o provedor as repita na mensagem.
 */
async function lerDiagnosticoR2(resposta: Response, configuracao: ConfiguracaoBucketR2): Promise<DiagnosticoR2> {
  const xml = (await resposta.text().catch(() => "")).slice(0, 4000);
  const limpar = (texto: string | null) =>
    texto === null
      ? null
      : texto.split(configuracao.secretAccessKey).join("[oculto]").split(configuracao.accessKeyId).join("[oculto]").slice(0, TAMANHO_MAXIMO_DO_DIAGNOSTICO);

  return {
    status: resposta.status,
    codigo: limpar(campoDoXml(xml, "Code")),
    mensagem: limpar(campoDoXml(xml, "Message")),
    requestId: limpar(campoDoXml(xml, "RequestId") ?? resposta.headers.get("cf-ray")),
    formatoDasCredenciais: /^[0-9a-f]{32}$/.test(configuracao.accessKeyId) && /^[0-9a-f]{64}$/.test(configuracao.secretAccessKey) ? "esperado" : "inesperado",
  };
}

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
      throw new ErroDoArmazenamentoR2(metodo === "PUT" ? "gravar" : "remover", await lerDiagnosticoR2(resposta, configuracao));
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
