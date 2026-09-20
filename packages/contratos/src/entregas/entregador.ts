import * as z from "zod";
import { empresaPublicaSchema } from "../catalogo/catalogo-publico.ts";
import { participanteConversaSchema } from "../conversas/conversa.ts";
import { nomeUsuarioSchema } from "../identidades/identidade-pessoal.ts";
import { destinoPedidoSchema, formaPagamentoEntregaSchema } from "../pedidos/pedido.ts";
import { statusPedidoSchema } from "../pedidos/status-pedido.ts";

/*
 * ENTREGADOR: vínculo de uma PESSOA com uma EMPRESA — nunca um login paralelo nem um administrador.
 * A mesma conta do Jaa continua sendo uma pessoa comum e pode entregar para várias empresas.
 * Entregador enxerga apenas as entregas ATUALMENTE atribuídas a ele, e só o necessário para entregá-las.
 */

export const statusEntregadorSchema = z.enum(["convidado", "ativo", "inativo"]);

export type StatusEntregador = z.infer<typeof statusEntregadorSchema>;

export const ROTULO_STATUS_ENTREGADOR: Record<StatusEntregador, string> = {
  convidado: "Convite enviado",
  ativo: "Ativo",
  inativo: "Inativo",
};

/*
 * VÍNCULO ≠ DISPONIBILIDADE.
 * `status` é o vínculo PROFISSIONAL (a empresa administra): "esta pessoa entrega para nós".
 * `disponivel` é a decisão OPERACIONAL do PRÓPRIO entregador, por empresa: "aceito novas entregas
 * desta empresa agora". Ativo e indisponível continua sendo entregador — só não recebe pedido novo.
 */

// Vínculo válido: consulta e conclui as entregas que já estão com ele.
export function entregadorPodeOperar(status: StatusEntregador): boolean {
  return status === "ativo";
}

// NOVA atribuição (ou reatribuição) exige vínculo ativo E disponibilidade agora.
export function entregadorPodeReceberAtribuicao({ status, disponivel }: { status: StatusEntregador; disponivel: boolean }): boolean {
  return entregadorPodeOperar(status) && disponivel;
}

// Só quem tem vínculo ativo escolhe ficar disponível (convite pendente e inativo, não).
export function entregadorPodeEscolherDisponibilidade(status: StatusEntregador): boolean {
  return entregadorPodeOperar(status);
}

export const ROTULO_DISPONIBILIDADE = { disponivel: "🟢 Disponível", indisponivel: "⚪ Indisponível" } as const;

export function rotuloDisponibilidade(disponivel: boolean): string {
  return disponivel ? ROTULO_DISPONIBILIDADE.disponivel : ROTULO_DISPONIBILIDADE.indisponivel;
}

/**
 * Entregador como a EMPRESA o vê: identidade PÚBLICA da pessoa (nome e @usuario) + status do vínculo.
 * Nunca telefone, e-mail ou conta — convidar alguém não dá à empresa acesso aos dados pessoais dele.
 */
export const entregadorDaEmpresaSchema = z.object({
  id: z.uuid(),
  pessoa: participanteConversaSchema,
  status: statusEntregadorSchema,
  // Disponibilidade DESTA empresa. A empresa nunca descobre a disponibilidade dele em outra.
  disponivel: z.boolean(),
  convidadoEm: z.iso.datetime(),
  respondidoEm: z.iso.datetime().nullable(),
});

export type EntregadorDaEmpresa = z.infer<typeof entregadorDaEmpresaSchema>;

export const listaEntregadoresSchema = z.object({ entregadores: z.array(entregadorDaEmpresaSchema) });

export type ListaEntregadores = z.infer<typeof listaEntregadoresSchema>;

// Convite pelo @usuario público: a empresa não procura ninguém por telefone nem por dado privado.
export const convidarEntregadorEntradaSchema = z.object({ nomeUsuario: nomeUsuarioSchema });

export type ConvidarEntregadorEntrada = z.input<typeof convidarEntregadorEntradaSchema>;

// A empresa só liga/desliga o vínculo; aceitar ou recusar o convite é decisão da pessoa.
export const alterarStatusEntregadorEntradaSchema = z.object({ status: z.enum(["ativo", "inativo"]) });

export type AlterarStatusEntregadorEntrada = z.infer<typeof alterarStatusEntregadorEntradaSchema>;

// Resposta da PESSOA ao convite (é ela quem decide virar entregador daquela empresa).
export const responderConviteEntradaSchema = z.object({ resposta: z.enum(["aceitar", "recusar"]) });

export type ResponderConviteEntrada = z.infer<typeof responderConviteEntradaSchema>;

// Convite como a PESSOA convidada o vê: quem convidou (empresa pública) e desde quando.
export const conviteEntregadorSchema = z.object({
  id: z.uuid(),
  empresa: empresaPublicaSchema,
  status: statusEntregadorSchema,
  convidadoEm: z.iso.datetime(),
});

export type ConviteEntregador = z.infer<typeof conviteEntregadorSchema>;

export const listaConvitesEntregadorSchema = z.object({ convites: z.array(conviteEntregadorSchema) });

export type ListaConvitesEntregador = z.infer<typeof listaConvitesEntregadorSchema>;

/**
 * "Empresas em que trabalho": vínculos da PESSOA, com a disponibilidade dela em cada empresa.
 * É a única tela onde a disponibilidade é alterada — e só pelo próprio entregador.
 */
export const vinculoEntregadorSchema = z.object({
  id: z.uuid(),
  empresa: empresaPublicaSchema,
  status: statusEntregadorSchema,
  disponivel: z.boolean(),
  disponibilidadeAtualizadaEm: z.iso.datetime().nullable(),
});

export type VinculoEntregador = z.infer<typeof vinculoEntregadorSchema>;

export const listaVinculosEntregadorSchema = z.object({ vinculos: z.array(vinculoEntregadorSchema) });

export type ListaVinculosEntregador = z.infer<typeof listaVinculosEntregadorSchema>;

// Ficar disponível/indisponível: decisão do entregador, nunca da empresa.
export const alterarDisponibilidadeEntradaSchema = z.object({ disponivel: z.boolean() });

export type AlterarDisponibilidadeEntrada = z.infer<typeof alterarDisponibilidadeEntradaSchema>;

// Atribuição: a empresa escolhe um entregador ATIVO e DISPONÍVEL dela para o pedido.
export const atribuirEntregaEntradaSchema = z.object({
  entregadorId: z.uuid(),
  // Entregador que a empresa via na tela (null = nenhum): protege contra atribuição concorrente.
  entregadorAtualId: z.uuid().nullable().optional(),
});

export type AtribuirEntregaEntrada = z.input<typeof atribuirEntregaEntradaSchema>;

// Entregador ATUAL de um pedido (visão operacional da empresa).
export const entregadorAtribuidoSchema = z.object({
  id: z.uuid(),
  pessoa: participanteConversaSchema,
  status: statusEntregadorSchema,
  disponivel: z.boolean(),
  atribuidoEm: z.iso.datetime(),
});

export type EntregadorAtribuido = z.infer<typeof entregadorAtribuidoSchema>;

// Linha do histórico de atribuições (visão OPERACIONAL da empresa; o cliente não vê trocas internas).
export const eventoAtribuicaoSchema = z.object({
  id: z.uuid(),
  entregador: participanteConversaSchema,
  atribuidoEm: z.iso.datetime(),
  encerradoEm: z.iso.datetime().nullable(),
  motivoEncerramento: z.string().nullable(),
});

export type EventoAtribuicao = z.infer<typeof eventoAtribuicaoSchema>;

/**
 * ENTREGA como o ENTREGADOR a vê: só o necessário para entregar.
 * Tem: empresa, destino (snapshot + ponto confirmado pelo cliente), nome público do cliente, itens e
 * como receber na entrega. NÃO tem: telefone do cliente, outros endereços, outras conversas, outros
 * pedidos, histórico do cliente nem qualquer dado de conta.
 */
export const entregaAtribuidaSchema = z.object({
  pedidoId: z.uuid(),
  numeroPedido: z.number().int().positive(),
  empresa: empresaPublicaSchema,
  status: statusPedidoSchema,
  // Snapshot congelado no pedido: o entregador NUNCA geocodifica o endereço de novo.
  destino: destinoPedidoSchema,
  cliente: participanteConversaSchema,
  itens: z.array(z.object({ nomeProduto: z.string(), quantidade: z.number().int() })),
  totalCentavos: z.number().int(),
  formaPagamentoNaEntrega: formaPagamentoEntregaSchema,
  trocoParaCentavos: z.number().int().nullable(),
  atribuidoEm: z.iso.datetime(),
});

export type EntregaAtribuida = z.infer<typeof entregaAtribuidaSchema>;

export const listaEntregasSchema = z.object({ entregas: z.array(entregaAtribuidaSchema) });

export type ListaEntregas = z.infer<typeof listaEntregasSchema>;

// Entregas ATIVAS: o que ainda está em rua. Entregue e cancelado saem da lista (histórico permanece).
export function entregaEstaAtiva(status: z.infer<typeof statusPedidoSchema>): boolean {
  return status === "pronto" || status === "saiu_para_entrega" || status === "em_rota";
}
