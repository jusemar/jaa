import type { SaidaEntrega } from "@jaa/contratos";
import { lerRotaDaSaida } from "../repositorios/repositorio-rotas.js";
import { serializarEmpresaPublica } from "../../catalogo/lib/serializar-catalogo.js";
import type { EmpresaPublicaRegistro } from "../../catalogo/repositorios/repositorio-empresas-publicas.js";
import type { SaidaComParadasRegistro } from "../repositorios/repositorio-saidas.js";

/**
 * Saída como empresa e entregador a veem: paradas com o destino SNAPSHOT do pedido e a ordem atual.
 * Nunca a conta de quem montou a saída nem o empresaId interno — e o CLIENTE nunca recebe isto
 * (ele veria a rota inteira e os pedidos dos outros); para ele existe só a fila derivada.
 */
export function serializarSaida(registro: SaidaComParadasRegistro, empresa: EmpresaPublicaRegistro): SaidaEntrega {
  const { saida, entregador, paradas, zonaPrincipal, zonasCombinadas } = registro;
  return {
    id: saida.id,
    empresa: serializarEmpresaPublica(empresa),
    entregador,
    status: saida.status,
    versaoSequencia: saida.versaoSequencia,
    paradas: paradas.map((parada) => ({
      id: parada.id,
      pedidoId: parada.pedidoId,
      posicao: parada.posicao,
      statusPedido: parada.statusPedido,
      destino: { ...parada.destino, localizacaoConfirmadaEm: parada.destino.localizacaoConfirmadaEm.toISOString() },
      cliente: parada.cliente,
      totalCentavos: parada.totalCentavos,
      encerradaEm: parada.encerradaEm?.toISOString() ?? null,
      motivoEncerramento: parada.motivoEncerramento,
    })),
    // Percurso já calculado (ou o fallback explícito): serializar NUNCA chama o provedor.
    rota: lerRotaDaSaida(saida),
    zonaPrincipal,
    zonasCombinadas,
    automatica: saida.automatica,
    criadoEm: saida.criadoEm.toISOString(),
    formacaoIniciadaEm: saida.formacaoIniciadaEm?.toISOString() ?? null,
    prazoFormacaoEm: saida.prazoFormacaoEm?.toISOString() ?? null,
    fechadaEm: saida.fechadaEm?.toISOString() ?? null,
    atribuidaEm: saida.atribuidaEm?.toISOString() ?? null,
    iniciadaEm: saida.iniciadaEm?.toISOString() ?? null,
    concluidaEm: saida.concluidaEm?.toISOString() ?? null,
  };
}
