import type { Banco } from "@jaa/banco";
import { ArmazenamentoNaoConfiguradoErro, type ArmazenamentoPrivado } from "../../../lib/armazenamento/armazenamento-arquivos.js";
import { LIMITE_ENVIO_AUDIO_CONVERSA, type FalhaEnvio } from "../../../lib/armazenamento/receber-imagem.js";
import { montarChaveAudio, type AudioValidado } from "../../../lib/armazenamento/validar-audio.js";
import { consumirLimiteDeUso } from "../../../lib/limite-de-uso.js";
import { existeBloqueioCom, travarPar } from "../../bloqueios/repositorios/repositorio-bloqueios.js";
import { listarIdsParticipantesDaConversa } from "../../conversas/repositorios/repositorio-conversas.js";
import type { CanalEventosMensagens } from "../lib/eventos-mensagens.js";
import {
  buscarMensagemPorIdCliente,
  buscarReferenciaNaConversa,
  ehViolacaoReferenciaResposta,
  inserirMensagemAudio,
  type MensagemRegistro,
} from "../repositorios/repositorio-mensagens.js";

type ResultadoEnviarAudio =
  | { tipo: "criada" | "ja-existente"; mensagem: MensagemRegistro }
  | { tipo: "conversa-nao-encontrada" }
  | { tipo: "mensagem-respondida-nao-encontrada" }
  | { tipo: "id-cliente-reutilizado" }
  | { tipo: "comunicacao-bloqueada" }
  | { tipo: "limite-de-envios"; tenteNovamenteEmSegundos: number }
  | { tipo: "arquivo-invalido"; falha: FalhaEnvio }
  | { tipo: "armazenamento-indisponivel" };

/** Retry legítimo do mesmo idCliente: mesma conversa, áudio e a mesma referência. */
function ehMesmaTentativa(existente: MensagemRegistro, conversaId: string, mensagemRespondidaId: string | null): boolean {
  return existente.conversaId === conversaId && existente.tipo === "audio" && existente.mensagemRespondidaId === mensagemRespondidaId;
}

/**
 * ENVIO DE MENSAGEM DE VOZ. Mesma ordem e as mesmas garantias da imagem
 * (`enviar-mensagem-imagem.ts`), com o arquivo como passo CARO feito o mais tarde possível:
 *
 *   participação → idempotência → limite de envios → resposta → bloqueio → ler e validar o áudio →
 *   gravar no bucket PRIVADO → transação (trava do par + bloqueio + mensagem + anexo) → evento.
 *
 * - Retry do mesmo idCliente devolve a mensagem existente SEM ler o arquivo e sem PUT.
 * - Duas tentativas simultâneas: o índice único (remetente, idCliente) deixa só uma; a perdedora
 *   remove o arquivo que gravou e devolve a vencedora.
 * - Qualquer falha depois do PUT remove o arquivo novo (falhou a remoção → objeto órfão, pendência).
 * - O áudio é guardado como foi gravado (sem reencodar); formato e duração vêm de `validarAudio`.
 */
export async function enviarMensagemAudio(
  { banco, eventosMensagens, armazenamentoPrivado }: { banco: Banco; eventosMensagens: CanalEventosMensagens; armazenamentoPrivado: ArmazenamentoPrivado },
  remetenteIdentidadeId: string,
  conversaId: string,
  campos: { idCliente: string; mensagemRespondidaId?: string | undefined },
  lerAudio: () => Promise<{ ok: true; audio: AudioValidado } | ({ ok: false } & FalhaEnvio)>,
  // Conta que executou o envio: auditoria interna e dona do limite de envios.
  operadorUsuarioId: string,
): Promise<ResultadoEnviarAudio> {
  const participantes = await listarIdsParticipantesDaConversa(banco, conversaId);
  if (!participantes.includes(remetenteIdentidadeId)) return { tipo: "conversa-nao-encontrada" };

  const mensagemRespondidaId = campos.mensagemRespondidaId ?? null;
  const resolverExistente = async (): Promise<ResultadoEnviarAudio | null> => {
    const existente = await buscarMensagemPorIdCliente(banco, remetenteIdentidadeId, campos.idCliente);
    if (!existente) return null;
    return ehMesmaTentativa(existente, conversaId, mensagemRespondidaId) ? { tipo: "ja-existente", mensagem: existente } : { tipo: "id-cliente-reutilizado" };
  };

  const jaEnviada = await resolverExistente();
  if (jaEnviada) return jaEnviada;

  const limite = await consumirLimiteDeUso(banco, `envio-audio-conversa:${operadorUsuarioId}`, LIMITE_ENVIO_AUDIO_CONVERSA);
  if (!limite.permitido) return { tipo: "limite-de-envios", tenteNovamenteEmSegundos: limite.tenteNovamenteEmSegundos };

  const mensagemRespondida = mensagemRespondidaId ? await buscarReferenciaNaConversa(banco, conversaId, mensagemRespondidaId, remetenteIdentidadeId) : null;
  if (mensagemRespondidaId && !mensagemRespondida) return { tipo: "mensagem-respondida-nao-encontrada" };

  // Checagem antecipada só para não gastar banda e storage à toa; a que vale é a da transação.
  const outras = participantes.filter((identidadeId) => identidadeId !== remetenteIdentidadeId);
  if (await existeBloqueioCom(banco, remetenteIdentidadeId, outras)) return { tipo: "comunicacao-bloqueada" };

  const leitura = await lerAudio();
  if (!leitura.ok) return { tipo: "arquivo-invalido", falha: { status: leitura.status, erro: leitura.erro } };
  const { audio } = leitura;

  // Chave gerada pelo servidor (UUID novo): nada é sobrescrito e o cliente nunca a escolhe nem a vê.
  const chave = montarChaveAudio(conversaId, audio.tipoConteudo);
  try {
    await armazenamentoPrivado.salvar({ chave, conteudo: audio.conteudo, tipoConteudo: audio.tipoConteudo });
  } catch (erro) {
    if (erro instanceof ArmazenamentoNaoConfiguradoErro) return { tipo: "armazenamento-indisponivel" };
    throw erro;
  }
  const descartarArquivoNovo = () => armazenamentoPrivado.remover(chave).catch(() => undefined);

  let resultado: MensagemRegistro | "bloqueada" | null;
  try {
    resultado = await banco.transaction(async (transacao) => {
      for (const outra of outras) await travarPar(transacao, remetenteIdentidadeId, outra);
      if (await existeBloqueioCom(transacao, remetenteIdentidadeId, outras)) return "bloqueada" as const;
      return inserirMensagemAudio(transacao, {
        conversaId,
        remetenteIdentidadeId,
        idCliente: campos.idCliente,
        mensagemRespondida,
        operadorUsuarioId,
        arquivo: { chave, tipoConteudo: audio.tipoConteudo, tamanhoBytes: audio.conteudo.byteLength, duracaoMs: audio.duracaoMs },
      });
    });
  } catch (erro) {
    await descartarArquivoNovo();
    if (ehViolacaoReferenciaResposta(erro)) return { tipo: "mensagem-respondida-nao-encontrada" };
    throw erro;
  }

  if (resultado === "bloqueada" || resultado === null) {
    // Bloqueio no meio do caminho, ou outra tentativa com o mesmo idCliente chegou antes: o arquivo
    // gravado por ESTA tentativa sobra e é removido.
    await descartarArquivoNovo();
    const existente = await resolverExistente();
    if (existente) return existente;
    return resultado === "bloqueada" ? { tipo: "comunicacao-bloqueada" } : { tipo: "id-cliente-reutilizado" };
  }

  eventosMensagens.publicar({ tipo: "mensagem-criada", mensagem: resultado, destinatariosIdentidadeIds: participantes });
  return { tipo: "criada", mensagem: resultado };
}
