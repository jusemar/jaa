import * as z from "zod";
import { participanteConversaSchema } from "../conversas/conversa.ts";
import { contagemNaoLidasSchema } from "../conversas/lista-conversas.ts";
import { exclusaoParaMimSchema, mensagemSchema } from "../mensagens/mensagem.ts";
import { conviteEntregadorSchema, entregaAtribuidaSchema, entregadorDaEmpresaSchema, vinculoEntregadorSchema } from "../entregas/entregador.ts";
import { painelOperacionalSchema, situacaoOperacionalSchema } from "../entregas/base-e-fila.ts";
import { painelDespachoSchema } from "../entregas/zonas.ts";
import { acompanhamentoPedidoSchema, posicaoEntregadorSchema } from "../entregas/rastreamento.ts";
import { filaDoPedidoSchema, saidaEntregaSchema } from "../entregas/saida.ts";
import { resumoPedidoSchema } from "../pedidos/pedido.ts";
import {
  EVENTO_DIGITANDO_ATUALIZADO,
  EVENTO_PRESENCA_ATUALIZADA,
  type EventoDigitandoAtualizado,
  type EventoPresencaAtualizada,
} from "./atividade-conversa.ts";

// Emitido SOMENTE depois que a mensagem foi persistida no PostgreSQL (estado "enviada").
export const EVENTO_MENSAGEM_NOVA = "mensagem:nova";

export const eventoMensagemNovaSchema = z.object({
  mensagem: mensagemSchema,
});

export type EventoMensagemNova = z.infer<typeof eventoMensagemNovaSchema>;

// Notificação de NOVA mensagem recebida, decidida pelo servidor: só para os destinatários (nunca o
// remetente), só na criação (retry idempotente, edição e exclusão não notificam). O estado persistente
// continua sendo a lista + não lidas; isto é só o aviso. O cliente decide se exibe (ex.: não exibe
// para a conversa aberta e visível). Push Web/mobile futuro consumirá o mesmo fato de domínio.
export const EVENTO_NOTIFICACAO_NOVA_MENSAGEM = "notificacao:nova-mensagem";

export const eventoNotificacaoNovaMensagemSchema = z.object({
  conversaId: z.uuid(),
  mensagemId: z.uuid(),
  // Somente dados públicos da identidade autora.
  remetente: participanteConversaSchema,
  previaConteudo: z.string(),
  conteudoTruncado: z.boolean(),
  criadoEm: z.iso.datetime(),
});

export type EventoNotificacaoNovaMensagem = z.infer<typeof eventoNotificacaoNovaMensagemSchema>;

// Contagem ATUAL de não lidas de uma conversa para a identidade que recebe o evento (todas as conexões
// dela). Recalculada pelo servidor após o commit sempre que pode mudar (mensagem recebida, leitura,
// exclusão). É um valor absoluto: o cliente substitui, nunca soma.
export const EVENTO_CONVERSA_NAO_LIDAS = "conversa:nao-lidas";

export const eventoConversaNaoLidasSchema = z.object({
  conversaId: z.uuid(),
  naoLidas: contagemNaoLidasSchema,
});

export type EventoConversaNaoLidas = z.infer<typeof eventoConversaNaoLidasSchema>;

// Emitido só para as conexões da identidade que excluiu a mensagem para si (outras abas/dispositivos).
export const EVENTO_MENSAGEM_EXCLUIDA_PARA_MIM = "mensagem:excluida-para-mim";

export const eventoMensagemExcluidaParaMimSchema = exclusaoParaMimSchema;

export type EventoMensagemExcluidaParaMim = z.infer<typeof eventoMensagemExcluidaParaMimSchema>;

// Emitido quando uma mensagem EXISTENTE muda (edição ou exclusão para todos), depois do commit. Traz a mensagem
// completa e atual: o cliente substitui pelo id, sem tratar como nova (não reordena nem conta não lida).
export const EVENTO_MENSAGEM_ATUALIZADA = "mensagem:atualizada";

export const eventoMensagemAtualizadaSchema = z.object({
  mensagem: mensagemSchema,
});

export type EventoMensagemAtualizada = z.infer<typeof eventoMensagemAtualizadaSchema>;

// Emitido depois de gravar confirmações de recebimento NOVAS (repetições não geram evento).
// Fato por destinatário: numa conversa direta, basta para exibir "entregue".
export const EVENTO_MENSAGENS_ENTREGUES = "mensagens:entregues";

export const eventoMensagensEntreguesSchema = z.object({
  conversaId: z.uuid(),
  destinatarioIdentidadeId: z.uuid(),
  mensagemIds: z.array(z.uuid()).min(1),
});

export type EventoMensagensEntregues = z.infer<typeof eventoMensagensEntreguesSchema>;

// Emitido quando o marcador de leitura de um participante AVANÇA: todas as mensagens dos outros
// participantes com id <= `ateMensagemId` foram lidas por `leitorIdentidadeId`.
export const EVENTO_MENSAGENS_LIDAS = "mensagens:lidas";

export const eventoMensagensLidasSchema = z.object({
  conversaId: z.uuid(),
  leitorIdentidadeId: z.uuid(),
  ateMensagemId: z.uuid(),
});

export type EventoMensagensLidas = z.infer<typeof eventoMensagensLidasSchema>;

/**
 * Status do PEDIDO mudou (empresa avançou ou cancelou), emitido após o commit. Vai só para as
 * identidades com relação real com o pedido: o cliente dono e a identidade da empresa.
 * NÃO é mensagem: não cria mensagem nova, não reordena a conversa e não altera não lidas — o cliente
 * só substitui o resumo do card e a tela do pedido. O banco continua sendo a fonte da verdade.
 */
export const EVENTO_PEDIDO_STATUS_ATUALIZADO = "pedido:status-atualizado";

export const eventoPedidoStatusAtualizadoSchema = z.object({
  // Conversa de origem (quando houver): permite atualizar o card sem recarregar o histórico.
  conversaId: z.uuid().nullable(),
  pedido: resumoPedidoSchema,
  // Só no cancelamento; nunca identifica a pessoa que operou a empresa.
  motivoCancelamento: z.string().nullable(),
  ocorridoEm: z.iso.datetime(),
});

export type EventoPedidoStatusAtualizado = z.infer<typeof eventoPedidoStatusAtualizadoSchema>;

/**
 * A lista de entregas de UM entregador mudou (atribuição, reatribuição, mudança de status, cancelamento
 * ou perda do vínculo), emitido após o commit só para as conexões daquele entregador — nunca broadcast.
 * `entrega` presente = passou a valer (criar/atualizar na lista); ausente = saiu da lista dele (foi
 * reatribuída a outra pessoa, terminou ou o acesso foi revogado). O banco continua sendo a verdade.
 */
export const EVENTO_ENTREGA_ATUALIZADA = "entrega:atualizada";

export const eventoEntregaAtualizadaSchema = z.object({
  pedidoId: z.uuid(),
  entrega: entregaAtribuidaSchema.nullable(),
});

export type EventoEntregaAtualizada = z.infer<typeof eventoEntregaAtualizadaSchema>;

/**
 * Um entregador ficou disponível/indisponível PARA UMA EMPRESA, emitido após o commit só para as
 * identidades autorizadas daquela empresa (nunca broadcast). Uma empresa não descobre por aqui a
 * disponibilidade dele em outra: o evento chega apenas a quem opera a empresa do vínculo.
 */
export const EVENTO_ENTREGADOR_DISPONIBILIDADE = "entregador:disponibilidade";

export const eventoEntregadorDisponibilidadeSchema = z.object({
  entregador: entregadorDaEmpresaSchema,
});

export type EventoEntregadorDisponibilidade = z.infer<typeof eventoEntregadorDisponibilidadeSchema>;

/**
 * A SAÍDA mudou (criada, iniciada, reordenada, parada concluída ou saída encerrada), emitido após o
 * commit para a identidade da EMPRESA e a do ENTREGADOR daquela saída — ninguém mais. O cliente
 * jamais recebe este evento: ele veria a rota inteira e os pedidos dos outros.
 */
export const EVENTO_SAIDA_ATUALIZADA = "saida:atualizada";

export const eventoSaidaAtualizadaSchema = z.object({
  saida: saidaEntregaSchema,
});

export type EventoSaidaAtualizada = z.infer<typeof eventoSaidaAtualizadaSchema>;

/**
 * Posição do PRÓPRIO pedido na fila, para a identidade do cliente. Informação DERIVADA da sequência:
 * só a situação e quantas entregas há antes da dele — nunca quem são, onde moram ou qual é a rota.
 */
export const EVENTO_PEDIDO_FILA = "pedido:fila";

export const eventoPedidoFilaSchema = filaDoPedidoSchema;

export type EventoPedidoFila = z.infer<typeof eventoPedidoFilaSchema>;

/**
 * A operação da base mudou (alguém chegou, saiu, ligou/desligou "aceitando", pegou uma saída):
 * o painel inteiro vai para a identidade da EMPRESA daquela base — nunca para outra empresa.
 * É estado DERIVADO: nenhuma coordenada de entregador trafega aqui.
 */
export const EVENTO_FILA_ATUALIZADA = "fila:atualizada";

export const eventoFilaAtualizadaSchema = z.object({ painel: painelOperacionalSchema });

export type EventoFilaAtualizada = z.infer<typeof eventoFilaAtualizadaSchema>;

/**
 * A situação do PRÓPRIO entregador numa empresa (presença, estado e posição na fila), para a
 * identidade dele. Ele não recebe a fila dos outros — só quantos estão à frente.
 */
export const EVENTO_SITUACAO_OPERACIONAL = "entregador:situacao";

export const eventoSituacaoOperacionalSchema = z.object({ situacao: situacaoOperacionalSchema });

export type EventoSituacaoOperacional = z.infer<typeof eventoSituacaoOperacionalSchema>;

/**
 * O DESPACHO da empresa mudou: zona configurada, pedido que ficou fora das zonas, automação ligada.
 * Vai só para a identidade da EMPRESA — o cliente jamais sabe que zonas existem, e o entregador
 * recebe apenas a saída atribuída a ele.
 */
export const EVENTO_DESPACHO_ATUALIZADO = "despacho:atualizado";

export const eventoDespachoAtualizadoSchema = z.object({ painel: painelDespachoSchema });

export type EventoDespachoAtualizado = z.infer<typeof eventoDespachoAtualizadoSchema>;

/**
 * POSIÇÃO do entregador numa saída EM ANDAMENTO. Vai para a identidade da EMPRESA daquela saída e
 * para o próprio entregador — nunca para clientes (eles veriam por onde andam as entregas dos outros)
 * e nunca em broadcast. Fora da operação não existe evento nenhum: terminou a saída, acabou o
 * rastreamento.
 */
export const EVENTO_POSICAO_ENTREGADOR = "entrega:posicao";

export const eventoPosicaoEntregadorSchema = z.object({ posicao: posicaoEntregadorSchema });

export type EventoPosicaoEntregador = z.infer<typeof eventoPosicaoEntregadorSchema>;

/**
 * ACOMPANHAMENTO do PRÓPRIO pedido, para a identidade do cliente: a fila derivada de sempre e, SÓ
 * quando a entrega dele é a parada atual, a posição do entregador. Nunca os destinos, coordenadas ou
 * ids das outras paradas — a decisão é do SERVIDOR, não de esconder campo na tela.
 */
export const EVENTO_PEDIDO_ACOMPANHAMENTO = "pedido:acompanhamento";

export const eventoPedidoAcompanhamentoSchema = z.object({ pedidoId: z.uuid(), acompanhamento: acompanhamentoPedidoSchema });

export type EventoPedidoAcompanhamento = z.infer<typeof eventoPedidoAcompanhamentoSchema>;

/**
 * O VÍNCULO de entregador de uma pessoa mudou: ela foi convidada, o convite deixou de existir
 * (aceito/recusado) ou a empresa ativou/desativou o vínculo. Vai só para a identidade pessoal DELA.
 *
 * É o que faz um convite novo aparecer na hora, sem F5: antes o convite era persistido e ninguém
 * avisava o destinatário conectado.
 */
export const EVENTO_VINCULO_ENTREGADOR = "entregador:vinculo";

export const eventoVinculoEntregadorSchema = z.object({
  // Convite pendente (quando houver) e o vínculo resultante, para a tela atualizar as duas listas.
  convite: conviteEntregadorSchema.nullable(),
  vinculo: vinculoEntregadorSchema.nullable(),
});

export type EventoVinculoEntregador = z.infer<typeof eventoVinculoEntregadorSchema>;

// Eventos que a API envia ao cliente. Comandos de negócio do cliente (enviar, confirmar) passam pela
// API HTTP; pelo socket o cliente envia só atividade efêmera (ver atividade-conversa.ts).
export interface EventosRealtimeServidorParaCliente {
  [EVENTO_MENSAGEM_NOVA]: (evento: EventoMensagemNova) => void;
  [EVENTO_MENSAGEM_ATUALIZADA]: (evento: EventoMensagemAtualizada) => void;
  [EVENTO_MENSAGEM_EXCLUIDA_PARA_MIM]: (evento: EventoMensagemExcluidaParaMim) => void;
  [EVENTO_CONVERSA_NAO_LIDAS]: (evento: EventoConversaNaoLidas) => void;
  [EVENTO_NOTIFICACAO_NOVA_MENSAGEM]: (evento: EventoNotificacaoNovaMensagem) => void;
  [EVENTO_MENSAGENS_ENTREGUES]: (evento: EventoMensagensEntregues) => void;
  [EVENTO_MENSAGENS_LIDAS]: (evento: EventoMensagensLidas) => void;
  [EVENTO_PEDIDO_STATUS_ATUALIZADO]: (evento: EventoPedidoStatusAtualizado) => void;
  [EVENTO_ENTREGA_ATUALIZADA]: (evento: EventoEntregaAtualizada) => void;
  [EVENTO_ENTREGADOR_DISPONIBILIDADE]: (evento: EventoEntregadorDisponibilidade) => void;
  [EVENTO_SAIDA_ATUALIZADA]: (evento: EventoSaidaAtualizada) => void;
  [EVENTO_PEDIDO_FILA]: (evento: EventoPedidoFila) => void;
  [EVENTO_FILA_ATUALIZADA]: (evento: EventoFilaAtualizada) => void;
  [EVENTO_SITUACAO_OPERACIONAL]: (evento: EventoSituacaoOperacional) => void;
  [EVENTO_DESPACHO_ATUALIZADO]: (evento: EventoDespachoAtualizado) => void;
  [EVENTO_POSICAO_ENTREGADOR]: (evento: EventoPosicaoEntregador) => void;
  [EVENTO_PEDIDO_ACOMPANHAMENTO]: (evento: EventoPedidoAcompanhamento) => void;
  [EVENTO_VINCULO_ENTREGADOR]: (evento: EventoVinculoEntregador) => void;
  [EVENTO_PRESENCA_ATUALIZADA]: (evento: EventoPresencaAtualizada) => void;
  [EVENTO_DIGITANDO_ATUALIZADO]: (evento: EventoDigitandoAtualizado) => void;
}
