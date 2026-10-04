import type { Banco } from "@jaa/banco";
import { ArmazenamentoNaoConfiguradoErro, type ArmazenamentoPrivado } from "../../../lib/armazenamento/armazenamento-arquivos.js";
import { montarChave, type ImagemProcessada } from "../../../lib/armazenamento/pipeline-imagem.js";
import { LIMITE_ENVIO_IMAGEM_CONVERSA, type FalhaEnvio } from "../../../lib/armazenamento/receber-imagem.js";
import { consumirLimiteDeUso } from "../../../lib/limite-de-uso.js";
import { existeBloqueioCom, travarPar } from "../../bloqueios/repositorios/repositorio-bloqueios.js";
import { listarIdsParticipantesDaConversa } from "../../conversas/repositorios/repositorio-conversas.js";
import type { CanalEventosMensagens } from "../lib/eventos-mensagens.js";
import {
  buscarMensagemPorIdCliente,
  buscarReferenciaNaConversa,
  ehViolacaoReferenciaResposta,
  inserirMensagemImagem,
  type MensagemRegistro,
} from "../repositorios/repositorio-mensagens.js";

type ResultadoEnviarImagem =
  | { tipo: "criada" | "ja-existente"; mensagem: MensagemRegistro }
  | { tipo: "conversa-nao-encontrada" }
  | { tipo: "mensagem-respondida-nao-encontrada" }
  | { tipo: "id-cliente-reutilizado" }
  | { tipo: "comunicacao-bloqueada" }
  | { tipo: "limite-de-envios"; tenteNovamenteEmSegundos: number }
  | { tipo: "arquivo-invalido"; falha: FalhaEnvio }
  | { tipo: "armazenamento-indisponivel" };

/**
 * Retry legítimo do mesmo idCliente: mesma conversa, imagem, mesma referência e mesma legenda. Se o
 * autor já excluiu a mensagem para todos, a legenda original não existe mais para comparar.
 */
function ehMesmaTentativa(existente: MensagemRegistro, conversaId: string, legenda: string, mensagemRespondidaId: string | null): boolean {
  return (
    existente.conversaId === conversaId &&
    existente.tipo === "imagem" &&
    existente.mensagemRespondidaId === mensagemRespondidaId &&
    (existente.excluidaParaTodosEm !== null || existente.conteudo === legenda)
  );
}

/**
 * ENVIO DE IMAGEM na conversa. Mesma regra do texto (autoriza → persiste → só então publica), com o
 * arquivo como passo CARO feito o mais tarde possível:
 *
 *   participação → idempotência → limite de envios → resposta → bloqueio → processar (sharp) →
 *   gravar no bucket PRIVADO → transação (trava do par + bloqueio + mensagem + anexo) → evento.
 *
 * - Retry do mesmo idCliente devolve a mensagem existente SEM ler o arquivo, sem sharp e sem PUT.
 * - Se duas tentativas simultâneas passarem da checagem, o índice único (remetente, idCliente) deixa
 *   só uma: a perdedora remove o arquivo que gravou e devolve a vencedora.
 * - Qualquer falha depois do PUT (transação recusada, bloqueio, erro do banco) remove o arquivo novo.
 * - `lerImagem` só é chamado quando tudo foi autorizado; até lá os bytes nem são lidos.
 */
export async function enviarMensagemImagem(
  { banco, eventosMensagens, armazenamentoPrivado }: { banco: Banco; eventosMensagens: CanalEventosMensagens; armazenamentoPrivado: ArmazenamentoPrivado },
  remetenteIdentidadeId: string,
  conversaId: string,
  campos: { idCliente: string; legenda: string; mensagemRespondidaId?: string | undefined },
  lerImagem: () => Promise<{ ok: true; imagem: ImagemProcessada } | ({ ok: false } & FalhaEnvio)>,
  // Conta que executou o envio: auditoria interna e dona do limite de envios.
  operadorUsuarioId: string,
): Promise<ResultadoEnviarImagem> {
  const participantes = await listarIdsParticipantesDaConversa(banco, conversaId);
  if (!participantes.includes(remetenteIdentidadeId)) return { tipo: "conversa-nao-encontrada" };

  const mensagemRespondidaId = campos.mensagemRespondidaId ?? null;
  const resolverExistente = async (): Promise<ResultadoEnviarImagem | null> => {
    const existente = await buscarMensagemPorIdCliente(banco, remetenteIdentidadeId, campos.idCliente);
    if (!existente) return null;
    return ehMesmaTentativa(existente, conversaId, campos.legenda, mensagemRespondidaId) ? { tipo: "ja-existente", mensagem: existente } : { tipo: "id-cliente-reutilizado" };
  };

  const jaEnviada = await resolverExistente();
  if (jaEnviada) return jaEnviada;

  const limite = await consumirLimiteDeUso(banco, `envio-imagem-conversa:${operadorUsuarioId}`, LIMITE_ENVIO_IMAGEM_CONVERSA);
  if (!limite.permitido) return { tipo: "limite-de-envios", tenteNovamenteEmSegundos: limite.tenteNovamenteEmSegundos };

  const mensagemRespondida = mensagemRespondidaId ? await buscarReferenciaNaConversa(banco, conversaId, mensagemRespondidaId, remetenteIdentidadeId) : null;
  if (mensagemRespondidaId && !mensagemRespondida) return { tipo: "mensagem-respondida-nao-encontrada" };

  // Checagem antecipada só para não gastar CPU e storage à toa; a que vale é a da transação.
  const outras = participantes.filter((identidadeId) => identidadeId !== remetenteIdentidadeId);
  if (await existeBloqueioCom(banco, remetenteIdentidadeId, outras)) return { tipo: "comunicacao-bloqueada" };

  const leitura = await lerImagem();
  if (!leitura.ok) return { tipo: "arquivo-invalido", falha: { status: leitura.status, erro: leitura.erro } };
  const { imagem } = leitura;

  // Chave gerada pelo servidor (UUID novo): nada é sobrescrito e o cliente nunca a escolhe nem a vê.
  const chave = montarChave("imagem-conversa", conversaId);
  try {
    await armazenamentoPrivado.salvar({ chave, conteudo: imagem.conteudo, tipoConteudo: imagem.tipoConteudo });
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
      return inserirMensagemImagem(transacao, {
        conversaId,
        remetenteIdentidadeId,
        idCliente: campos.idCliente,
        legenda: campos.legenda,
        mensagemRespondida,
        operadorUsuarioId,
        arquivo: { chave, tipoConteudo: imagem.tipoConteudo, tamanhoBytes: imagem.conteudo.byteLength, largura: imagem.largura, altura: imagem.altura },
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
