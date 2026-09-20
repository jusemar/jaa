import * as z from "zod";
import { empresaPublicaSchema } from "../catalogo/catalogo-publico.ts";
import { participanteConversaSchema } from "../conversas/conversa.ts";
import { destinoPedidoSchema } from "../pedidos/pedido.ts";
import { statusPedidoSchema } from "../pedidos/status-pedido.ts";
import { rotaDaSaidaSchema } from "./rota.ts";

/*
 * SAÍDA DE ENTREGA: a operação real de um entregador saindo com VÁRIOS pedidos de UMA empresa.
 * É o agrupamento que dá sentido à sequência das paradas — e a base do que o cliente vê como
 * "quantas entregas antes da minha".
 *
 * Duas máquinas de estado convivem sem se misturar: o PEDIDO segue a sua (recebido → … → entregue)
 * e a SAÍDA tem a dela (em formação → aguardando entregador → preparada → em andamento → concluída).
 * A saída montada à mão pela empresa já nasce PREPARADA: os dois primeiros estados são da automação.
 */

export const statusSaidaSchema = z.enum([
  // Ainda juntando pedidos da zona: só aqui a saída aceita pedido novo.
  "em_formacao",
  // Fechada por quantidade ou tempo, mas sem ninguém elegível na fila da base ainda.
  "aguardando_entregador",
  // Tem entregador reservado; os pedidos continuam na loja até alguém iniciar a saída.
  "preparada",
  "em_andamento",
  "concluida",
]);

export type StatusSaida = z.infer<typeof statusSaidaSchema>;

export const ROTULO_STATUS_SAIDA: Record<StatusSaida, string> = {
  em_formacao: "Em formação",
  aguardando_entregador: "Aguardando entregador",
  preparada: "Preparada",
  em_andamento: "Em andamento",
  concluida: "Concluída",
};

// Só saída EM FORMAÇÃO recebe pedido: fechada, atribuída ou iniciada nunca recebe (regra absoluta).
export function saidaAceitaNovosPedidos(status: StatusSaida): boolean {
  return status === "em_formacao";
}

export function saidaEstaAtiva(status: StatusSaida): boolean {
  return status !== "concluida";
}

// Limite operacional de uma saída. Existe para proteger a operação e as consultas, não por regra de negócio.
export const MAXIMO_PARADAS_POR_SAIDA = 30;

/**
 * Parada da saída: o pedido e o destino SNAPSHOT dele (o ponto que o cliente confirmou).
 * `encerradaEm` marca a parada que saiu da sequência ativa — pedido entregue ou cancelado.
 */
export const paradaSaidaSchema = z.object({
  id: z.uuid(),
  pedidoId: z.uuid(),
  numeroPedido: z.number().int().positive(),
  posicao: z.number().int().min(1),
  statusPedido: statusPedidoSchema,
  destino: destinoPedidoSchema,
  cliente: participanteConversaSchema,
  totalCentavos: z.number().int(),
  encerradaEm: z.iso.datetime().nullable(),
  motivoEncerramento: z.string().nullable(),
});

export type ParadaSaida = z.infer<typeof paradaSaidaSchema>;

export const zonaDaSaidaSchema = z.object({ id: z.uuid(), nome: z.string() });

export type ZonaDaSaida = z.infer<typeof zonaDaSaidaSchema>;

export const saidaEntregaSchema = z.object({
  id: z.uuid(),
  empresa: empresaPublicaSchema,
  /*
   * Identidade pública de quem está levando (a empresa e o próprio entregador veem; o cliente não).
   * `null` enquanto a saída está em formação ou aguardando alguém elegível na fila da base.
   */
  entregador: participanteConversaSchema.nullable(),
  status: statusSaidaSchema,
  // Muda a cada alteração da sequência: quem salva informa a versão que viu.
  versaoSequencia: z.number().int().min(1),
  paradas: z.array(paradaSaidaSchema),
  /*
   * Percurso calculado pelo motor de rotas (origem = base da empresa). `null` enquanto ninguém
   * calculou. A ordem das paradas continua sendo a da saída — a rota não a reescreve sozinha.
   */
  rota: rotaDaSaidaSchema.nullable(),
  // Zona que originou a saída e as demais que entraram por combinação autorizada (derivadas).
  zonaPrincipal: zonaDaSaidaSchema.nullable(),
  zonasCombinadas: z.array(zonaDaSaidaSchema),
  // Montada pela automação (a saída manual do gestor continua existindo e nasce preparada).
  automatica: z.boolean(),
  criadoEm: z.iso.datetime(),
  // Relógio da formação: começa no PRIMEIRO pedido e o prazo fica persistido (sobrevive a restart).
  formacaoIniciadaEm: z.iso.datetime().nullable(),
  prazoFormacaoEm: z.iso.datetime().nullable(),
  fechadaEm: z.iso.datetime().nullable(),
  atribuidaEm: z.iso.datetime().nullable(),
  iniciadaEm: z.iso.datetime().nullable(),
  concluidaEm: z.iso.datetime().nullable(),
});

export type SaidaEntrega = z.infer<typeof saidaEntregaSchema>;

export const listaSaidasSchema = z.object({ saidas: z.array(saidaEntregaSchema) });

export type ListaSaidas = z.infer<typeof listaSaidasSchema>;

// A empresa monta a saída escolhendo pedidos PRONTOS e um entregador ativo E disponível.
export const criarSaidaEntradaSchema = z.object({
  entregadorId: z.uuid(),
  pedidoIds: z.array(z.uuid()).min(1, "Escolha ao menos um pedido.").max(MAXIMO_PARADAS_POR_SAIDA),
});

export type CriarSaidaEntrada = z.input<typeof criarSaidaEntradaSchema>;

/**
 * Reordenação: a nova ordem precisa conter EXATAMENTE as paradas ativas da saída (uma vez cada), e a
 * `versaoSequencia` que a tela estava mostrando — versão antiga não sobrescreve alteração mais nova.
 */
export const reordenarSequenciaEntradaSchema = z.object({
  versaoSequencia: z.number().int().min(1),
  pedidoIds: z.array(z.uuid()).min(1).max(MAXIMO_PARADAS_POR_SAIDA),
});

export type ReordenarSequenciaEntrada = z.infer<typeof reordenarSequenciaEntradaSchema>;

// Paradas que ainda contam na sequência (as demais viraram histórico).
export function paradaEstaAtiva(parada: Pick<ParadaSaida, "encerradaEm">): boolean {
  return parada.encerradaEm === null;
}

export function paradasAtivas(saida: Pick<SaidaEntrega, "paradas">): ParadaSaida[] {
  return saida.paradas.filter(paradaEstaAtiva).sort((a, b) => a.posicao - b.posicao);
}

/**
 * Quanto falta (em ms) para a saída em formação vencer. Negativo = já passou do prazo e ela deve ser
 * fechada pelo SERVIDOR — a interface nunca é quem fecha.
 */
export function restanteDaFormacaoMs(saida: Pick<SaidaEntrega, "prazoFormacaoEm">, agora: Date = new Date()): number | null {
  return saida.prazoFormacaoEm === null ? null : new Date(saida.prazoFormacaoEm).getTime() - agora.getTime();
}

/**
 * "Atual" aqui é a PRIMEIRA PARADA ATIVA da sequência — posição operacional, não localização física.
 * Sem GPS, o Jaa nunca afirma onde o entregador está.
 */
export function proximaParada(saida: Pick<SaidaEntrega, "paradas">): ParadaSaida | null {
  return paradasAtivas(saida)[0] ?? null;
}

/*
 * FILA DO CLIENTE: o que o cliente pode saber sobre o próprio pedido dentro de uma saída.
 * É informação DERIVADA da sequência — nunca a rota, nunca outros clientes, endereços ou pedidos.
 */
export const situacaoFilaSchema = z.enum([
  // Ainda não entrou em nenhuma saída.
  "sem_saida",
  // Está numa saída montada, mas o entregador ainda não saiu da loja.
  "aguardando_saida",
  // Saiu para entrega e há outras paradas antes da dele.
  "na_fila",
  // Primeira parada ativa de uma saída em andamento.
  "indo_ate_voce",
  // Pedido já concluído (entregue ou cancelado).
  "encerrado",
]);

export type SituacaoFila = z.infer<typeof situacaoFilaSchema>;

export const filaDoPedidoSchema = z.object({
  pedidoId: z.uuid(),
  situacao: situacaoFilaSchema,
  // Quantas entregas ativas estão antes da dele (null quando não há saída). Só o NÚMERO.
  entregasAntes: z.number().int().min(0).nullable(),
});

export type FilaDoPedido = z.infer<typeof filaDoPedidoSchema>;

export function rotuloFila(fila: FilaDoPedido): string {
  switch (fila.situacao) {
    case "indo_ate_voce":
      return "Indo até você";
    case "na_fila":
      return fila.entregasAntes === 1 ? "1 entrega antes da sua" : `${fila.entregasAntes ?? 0} entregas antes da sua`;
    case "aguardando_saida":
      return "Seu pedido está separado para a entrega";
    case "encerrado":
      return "Entrega encerrada";
    case "sem_saida":
      return "Ainda não saiu para entrega";
  }
}
