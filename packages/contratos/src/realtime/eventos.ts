import * as z from "zod";
import { participanteConversaSchema } from "../conversas/conversa.ts";
import { contagemNaoLidasSchema } from "../conversas/lista-conversas.ts";
import { exclusaoParaMimSchema, mensagemSchema } from "../mensagens/mensagem.ts";
import { entregaAtribuidaSchema, entregadorDaEmpresaSchema } from "../entregas/entregador.ts";
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
  [EVENTO_PRESENCA_ATUALIZADA]: (evento: EventoPresencaAtualizada) => void;
  [EVENTO_DIGITANDO_ATUALIZADO]: (evento: EventoDigitandoAtualizado) => void;
}
