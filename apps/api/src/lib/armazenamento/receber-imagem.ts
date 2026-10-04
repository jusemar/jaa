import { MENSAGEM_ARQUIVO_GRANDE, MENSAGEM_AUDIO_GRANDE, TAMANHO_MAXIMO_AUDIO_BYTES, type ErroApi, type TipoAnexo } from "@jaa/contratos";
import type { MultipartFile } from "@fastify/multipart";
import type { FastifyRequest } from "fastify";
import type { RegraLimiteDeUso } from "../limite-de-uso.js";
import { ArmazenamentoNaoConfiguradoErro, type ArmazenamentoDeArquivos } from "./armazenamento-arquivos.js";
import { ImagemInvalidaErro, montarChave, processarImagem, type ImagemProcessada } from "./pipeline-imagem.js";
import { AudioInvalidoErro, validarAudio, type AudioValidado } from "./validar-audio.js";

/*
 * Passos COMUNS a toda rota que recebe uma imagem (foto de perfil, logo, imagem de produto).
 * A ordem de uso nas rotas é obrigatória: autorizar → limite de uso → ler/processar → gravar.
 * Quem não pode alterar o alvo nunca chega a consumir CPU do sharp nem a fazer PUT no storage.
 */

/**
 * Limites por CONTA (quem gasta CPU e banda é a conta, qualquer que seja a identidade atuante).
 * Folgados para o uso normal: trocar a foto algumas vezes, ou cadastrar o cardápio inteiro.
 */
export const LIMITE_ENVIO_FOTO_PERFIL: RegraLimiteDeUso = { janelaSegundos: 10 * 60, maximo: 10 };
export const LIMITE_ENVIO_IMAGEM_PRODUTO: RegraLimiteDeUso = { janelaSegundos: 10 * 60, maximo: 60 };
// Fotos de conversa: uma conversa animada manda várias fotos, mas não dezenas por minuto.
export const LIMITE_ENVIO_IMAGEM_CONVERSA: RegraLimiteDeUso = { janelaSegundos: 10 * 60, maximo: 30 };

// Mensagens de voz: uma conversa falada troca muitos áudios curtos; ainda assim cada um custa upload
// e armazenamento, então o teto é por CONTA e maior que o das fotos.
export const LIMITE_ENVIO_AUDIO_CONVERSA: RegraLimiteDeUso = { janelaSegundos: 10 * 60, maximo: 40 };

export type FalhaEnvio = { status: number; erro: ErroApi };

export function falhaLimiteDeEnviosDeAudio(tenteNovamenteEmSegundos: number): FalhaEnvio {
  const minutos = Math.ceil(tenteNovamenteEmSegundos / 60);
  return { status: 429, erro: { codigo: "LIMITE_DE_ENVIOS_ATINGIDO", mensagem: `Muitos áudios seguidos. Tente de novo em ${minutos} min.` } };
}

export function falhaLimiteDeEnvios(tenteNovamenteEmSegundos: number): FalhaEnvio {
  const minutos = Math.ceil(tenteNovamenteEmSegundos / 60);
  return {
    status: 429,
    erro: { codigo: "LIMITE_DE_ENVIOS_ATINGIDO", mensagem: `Muitos envios de imagem seguidos. Tente de novo em ${minutos} min.` },
  };
}

function codigoDoErro(erro: unknown): unknown {
  return typeof erro === "object" && erro !== null && "code" in erro ? erro.code : undefined;
}

const FALHA_SEM_IMAGEM: FalhaEnvio = { status: 400, erro: { codigo: "DADOS_INVALIDOS", mensagem: "Envie uma imagem." } };

/** Erros do plugin multipart que são do CLIENTE viram resposta clara; o resto sobe. */
function falhaDoMultipart(erro: unknown): FalhaEnvio | null {
  if (erro instanceof ImagemInvalidaErro) return { status: 400, erro: { codigo: "ARQUIVO_INVALIDO", mensagem: erro.message } };
  const codigo = codigoDoErro(erro);
  if (codigo === "FST_REQ_FILE_TOO_LARGE") return { status: 413, erro: { codigo: "ARQUIVO_INVALIDO", mensagem: MENSAGEM_ARQUIVO_GRANDE } };
  if (codigo === "FST_INVALID_MULTIPART_CONTENT_TYPE" || codigo === "FST_FILES_LIMIT") return FALHA_SEM_IMAGEM;
  return null;
}

/** Lê os bytes de um arquivo do multipart e passa pelo pipeline (tipo pelos bytes, EXIF fora, redimensiona). */
export async function processarArquivoEnviado(
  arquivo: MultipartFile,
  tipo: TipoAnexo,
): Promise<{ ok: true; imagem: ImagemProcessada } | ({ ok: false } & FalhaEnvio)> {
  try {
    return { ok: true, imagem: await processarImagem(await arquivo.toBuffer(), tipo, arquivo.mimetype) };
  } catch (erro) {
    const falha = falhaDoMultipart(erro);
    if (falha) return { ok: false, ...falha };
    throw erro;
  }
}

/**
 * Lê o ÚNICO arquivo do multipart e passa pelo pipeline (tipo conferido nos bytes, EXIF descartado,
 * redimensionamento). Erros do cliente viram resposta clara em vez do erro genérico do plugin.
 */
export async function lerImagemEnviada(
  requisicao: FastifyRequest,
  tipo: TipoAnexo,
): Promise<{ ok: true; imagem: ImagemProcessada } | ({ ok: false } & FalhaEnvio)> {
  try {
    const arquivo = await requisicao.file();
    if (!arquivo) return { ok: false, ...FALHA_SEM_IMAGEM };
    return await processarArquivoEnviado(arquivo, tipo);
  } catch (erro) {
    const falha = falhaDoMultipart(erro);
    if (falha) return { ok: false, ...falha };
    throw erro;
  }
}

/**
 * Abre o multipart e devolve o ARQUIVO (ainda não lido) com os campos de texto que chegaram ANTES
 * dele. As partes são lidas NA ORDEM do fluxo e a leitura PARA no primeiro arquivo: campo enviado
 * depois do arquivo nunca é visto — é isso que impõe a ordem do contrato (campos primeiro, arquivo
 * por último). Campo repetido vale como ausente (ambíguo).
 *
 * (`requisicao.file()` não serve aqui: `arquivo.fields` continua sendo preenchido enquanto o parser
 * avança, então campos posteriores ao arquivo podem aparecer nele.)
 */
export async function abrirArquivoComCampos(
  requisicao: FastifyRequest,
  // Limite de tamanho DESTA rota (o padrão do plugin é o das imagens).
  limites?: { fileSize: number },
): Promise<{ ok: true; arquivo: MultipartFile; campos: Record<string, string | undefined> } | ({ ok: false } & FalhaEnvio)> {
  // Sem protótipo: um campo chamado "__proto__" é só um nome qualquer, não altera o objeto.
  const campos: Record<string, string | undefined> = Object.create(null);
  const repetidos = new Set<string>();
  try {
    const partes = requisicao.parts(limites ? { limits: limites } : undefined);
    // Iteração manual (sem `for await`): sair do laço não pode encerrar o fluxo do arquivo, que ainda
    // será lido depois da autorização.
    for (;;) {
      const { value: parte, done } = await partes.next();
      if (done || !parte) return { ok: false, ...FALHA_SEM_IMAGEM };
      if (parte.type === "file") {
        for (const nome of repetidos) campos[nome] = undefined;
        return { ok: true, arquivo: parte, campos };
      }
      if (parte.fieldname in campos) repetidos.add(parte.fieldname);
      campos[parte.fieldname] = typeof parte.value === "string" ? parte.value : undefined;
    }
  } catch (erro) {
    const falha = falhaDoMultipart(erro);
    if (falha) return { ok: false, ...falha };
    throw erro;
  }
}

/** Descarta os bytes de um arquivo que não será usado (resposta sai sem esperar o upload inteiro travado). */
export function descartarArquivo(arquivo: MultipartFile): void {
  arquivo.file.resume();
}

/**
 * GRAVA a imagem nova e só então troca a referência no banco; a antiga é removida por último.
 *
 * Ordem pensada para nunca deixar o banco apontando para arquivo inexistente:
 * 1. PUT da imagem nova (chave nova, gerada pelo servidor — nada é sobrescrito);
 * 2. troca da chave no banco, que devolve a ANTERIOR lida sob trava da linha;
 * 3. remove a anterior. Se a troca falhar ou for recusada, quem é removida é a NOVA.
 *
 * Falha ao remover só deixa um objeto ÓRFÃO no storage (custo, não erro visível): a varredura de
 * órfãos é pendência registrada no CLAUDE.md.
 */
export async function gravarESubstituir<Recusa>(
  armazenamento: ArmazenamentoDeArquivos,
  entrada: { tipo: TipoAnexo; donoId: string; imagem: ImagemProcessada },
  trocarReferencia: (chave: string) => Promise<{ trocada: true; anterior: string | null } | { trocada: false; recusa: Recusa }>,
): Promise<{ ok: true; chave: string } | { ok: false; recusa: Recusa } | { ok: false; indisponivel: true }> {
  const chave = montarChave(entrada.tipo, entrada.donoId);
  try {
    await armazenamento.salvar({ chave, conteudo: entrada.imagem.conteudo, tipoConteudo: entrada.imagem.tipoConteudo });
  } catch (erro) {
    if (erro instanceof ArmazenamentoNaoConfiguradoErro) return { ok: false, indisponivel: true };
    throw erro;
  }

  let resultado: Awaited<ReturnType<typeof trocarReferencia>>;
  try {
    resultado = await trocarReferencia(chave);
  } catch (erro) {
    await armazenamento.remover(chave).catch(() => undefined);
    throw erro;
  }

  if (!resultado.trocada) {
    await armazenamento.remover(chave).catch(() => undefined);
    return { ok: false, recusa: resultado.recusa };
  }
  if (resultado.anterior && resultado.anterior !== chave) await armazenamento.remover(resultado.anterior).catch(() => undefined);
  return { ok: true, chave };
}

export const FALHA_ARMAZENAMENTO_INDISPONIVEL: FalhaEnvio = {
  status: 503,
  erro: { codigo: "ARMAZENAMENTO_INDISPONIVEL", mensagem: "O envio de imagens ainda não está configurado neste ambiente." },
};

const FALHA_SEM_AUDIO: FalhaEnvio = { status: 400, erro: { codigo: "DADOS_INVALIDOS", mensagem: "Envie um áudio." } };
export const LIMITES_MULTIPART_AUDIO = { fileSize: TAMANHO_MAXIMO_AUDIO_BYTES };

/** Abre o multipart de um áudio (campos antes, arquivo por último), com o limite de tamanho do áudio. */
export async function abrirAudioComCampos(requisicao: FastifyRequest) {
  const aberto = await abrirArquivoComCampos(requisicao, LIMITES_MULTIPART_AUDIO);
  // "Envie uma imagem." não faz sentido aqui.
  return !aberto.ok && aberto.erro.codigo === "DADOS_INVALIDOS" ? { ok: false as const, ...FALHA_SEM_AUDIO } : aberto;
}

/** Lê os bytes do áudio (até o limite) e valida formato e duração. Nada é reencodado. */
export async function validarAudioEnviado(arquivo: MultipartFile, duracaoInformadaMs: number): Promise<{ ok: true; audio: AudioValidado } | ({ ok: false } & FalhaEnvio)> {
  try {
    return { ok: true, audio: validarAudio(await arquivo.toBuffer(), arquivo.mimetype, duracaoInformadaMs) };
  } catch (erro) {
    if (erro instanceof AudioInvalidoErro) return { ok: false, status: 400, erro: { codigo: "ARQUIVO_INVALIDO", mensagem: erro.message } };
    if (codigoDoErro(erro) === "FST_REQ_FILE_TOO_LARGE") return { ok: false, status: 413, erro: { codigo: "ARQUIVO_INVALIDO", mensagem: MENSAGEM_AUDIO_GRANDE } };
    throw erro;
  }
}
