import type { Banco } from "@jaa/banco";
import { LIMITE_MAXIMO_HISTORICO_ENTREGAS, intervaloDoPeriodo, type ConsultaHistoricoEntregas } from "@jaa/contratos";
import { buscarFusoDaEmpresa } from "../../pedidos/repositorios/repositorio-pedidos.js";
import { buscarVinculoDaPessoa, contarEntregasConcluidas, listarEntregasConcluidas, type EntregaConcluidaRegistro } from "../repositorios/repositorio-historico-entregas.js";

/**
 * HISTÓRICO do PRÓPRIO entregador num vínculo (uma empresa). A conta vem da sessão e o vínculo precisa
 * ser dela — em qualquer status, porque desativar o entregador não apaga o que ele já entregou. A
 * empresa é sempre a do vínculo, nunca um parâmetro do cliente.
 *
 * O período é o da lista de Pedidos (mesma função, fuso da empresa, relógio do servidor), medido na
 * CONCLUSÃO da entrega.
 */
export async function listarMeuHistoricoDeEntregas(
  banco: Banco,
  usuarioId: string,
  entregadorId: string,
  consulta: Pick<ConsultaHistoricoEntregas, "periodo" | "limite" | "antesDe" | "dataInicial" | "dataFinal">,
  // Relógio do SERVIDOR: é ele (no fuso da empresa) que diz que dia é hoje. Injetável para os testes.
  agora: () => Date = () => new Date(),
): Promise<{ tipo: "historico"; entregas: EntregaConcluidaRegistro[]; total: number } | { tipo: "vinculo-nao-encontrado" }> {
  const vinculo = await buscarVinculoDaPessoa(banco, entregadorId, usuarioId);
  if (!vinculo) return { tipo: "vinculo-nao-encontrado" };

  const fuso = await buscarFusoDaEmpresa(banco, vinculo.empresaId);
  if (!fuso) return { tipo: "vinculo-nao-encontrado" };

  const limite = Math.min(Math.max(Math.trunc(consulta.limite), 1), LIMITE_MAXIMO_HISTORICO_ENTREGAS);
  const intervalo = intervaloDoPeriodo(consulta.periodo, { agora: agora(), fuso, dataInicial: consulta.dataInicial, dataFinal: consulta.dataFinal });
  const filtro = { entregadorId: vinculo.id, empresaId: vinculo.empresaId, intervalo };

  const [entregas, total] = await Promise.all([listarEntregasConcluidas(banco, { ...filtro, limite, antesDe: consulta.antesDe }), contarEntregasConcluidas(banco, filtro)]);
  return { tipo: "historico", entregas, total };
}
