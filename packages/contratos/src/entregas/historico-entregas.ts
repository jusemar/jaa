import * as z from "zod";
import { dataLocalSchema, periodoPedidosSchema, problemaDoPeriodoPersonalizado, type PeriodoPedidos } from "../pedidos/periodo-pedidos.ts";

/*
 * HISTÓRICO DE ENTREGAS do entregador para UMA empresa: o que ele efetivamente concluiu ali.
 *
 * O período usa a MESMA regra da lista de Pedidos (`periodo-pedidos.ts`: fuso da empresa, intervalo
 * `[de, ate)`, semana de segunda a domingo, relógio do servidor) — a diferença é só o instante medido:
 * aqui vale a CONCLUSÃO da entrega, não a criação do pedido. Não existe "todo o período": o histórico
 * é sempre consultado dentro de um recorte.
 */

export const periodoHistoricoEntregasSchema = periodoPedidosSchema.exclude(["todos"]);

export type PeriodoHistoricoEntregas = z.infer<typeof periodoHistoricoEntregasSchema>;

export const PERIODO_PADRAO_HISTORICO_ENTREGAS = "hoje" satisfies PeriodoPedidos;

export const LIMITE_PADRAO_HISTORICO_ENTREGAS = 20;
export const LIMITE_MAXIMO_HISTORICO_ENTREGAS = 50;

/** Consulta (query string). As datas só existem no período personalizado. */
export const consultaHistoricoEntregasSchema = z
  .object({
    periodo: periodoHistoricoEntregasSchema.default(PERIODO_PADRAO_HISTORICO_ENTREGAS),
    dataInicial: dataLocalSchema.optional(),
    dataFinal: dataLocalSchema.optional(),
    antesDe: z.uuid().optional(),
    limite: z.coerce.number().int().min(1).max(LIMITE_MAXIMO_HISTORICO_ENTREGAS).default(LIMITE_PADRAO_HISTORICO_ENTREGAS),
  })
  .superRefine((consulta, contexto) => {
    if (consulta.periodo !== "personalizado") return;
    const problema = problemaDoPeriodoPersonalizado(consulta.dataInicial, consulta.dataFinal);
    if (problema) contexto.addIssue({ code: "custom", path: ["dataFinal"], message: problema });
  });

export type ConsultaHistoricoEntregas = z.infer<typeof consultaHistoricoEntregasSchema>;

/**
 * Uma entrega concluída, como o ENTREGADOR a revê: só o número do pedido e quando terminou. Nada de
 * endereço, cliente, itens, valor ou pagamento — o acesso operacional acabou junto com a entrega.
 */
export const entregaConcluidaSchema = z
  .object({
    // Identificador do registro de conclusão: chave da lista e cursor da paginação.
    id: z.uuid(),
    numeroPedido: z.number().int().positive(),
    concluidaEm: z.iso.datetime(),
    status: z.literal("entregue"),
  })
  .strict();

export type EntregaConcluida = z.infer<typeof entregaConcluidaSchema>;

export const historicoEntregasSchema = z.object({
  entregas: z.array(entregaConcluidaSchema),
  // Cursor = id da entrega mais antiga da página; da mais recente para a mais antiga.
  proximoCursor: z.uuid().nullable(),
  // Quantas entregas o PERÍODO tem ao todo (não só nesta página).
  total: z.number().int().min(0),
});

export type HistoricoEntregas = z.infer<typeof historicoEntregasSchema>;

/** "1 entrega" / "12 entregas". */
export function rotuloTotalDeEntregas(total: number): string {
  return `${total} ${total === 1 ? "entrega" : "entregas"}`;
}
