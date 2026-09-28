import type { Banco } from "@jaa/banco";
import { calcularFilaDoPedido, identidadesClientesDaSaida, serializarSaidaComEmpresa } from "../casos-de-uso/gerir-saidas.js";
import { buscarSaida, registrarAvisoProxima, type SaidaComParadasRegistro } from "../repositorios/repositorio-saidas.js";
import type { CanalEventosEntregas } from "./eventos-entregas.js";

/**
 * Publica uma mudança de saída para quem tem direito a cada pedaço da informação:
 * - EMPRESA e ENTREGADOR recebem a saída completa (sequência, paradas, destinos);
 * - cada CLIENTE recebe só a fila do PRÓPRIO pedido (situação + quantas entregas antes);
 * - o cliente cuja entrega VIROU A PRÓXIMA recebe, uma única vez, o aviso "Sua entrega é a próxima".
 *
 * Toda mudança da sequência (início, conclusão, cancelamento, reordenação) termina aqui, então é aqui
 * que a TRANSIÇÃO para "próxima" é detectada — sem depender de qual ação a causou.
 *
 * É esta separação que impede o cliente de ver a rota, os endereços e os pedidos dos outros.
 */
export async function publicarSaida(
  { banco, eventosEntregas }: { banco: Banco; eventosEntregas: CanalEventosEntregas },
  registro: SaidaComParadasRegistro,
): Promise<void> {
  const saida = await serializarSaidaComEmpresa(banco, registro);
  // Sem entregador ainda (em formação ou aguardando alguém elegível), só a EMPRESA acompanha.
  const destinatariosIdentidadeIds = [saida.empresa.identidadeId];
  if (saida.entregador) destinatariosIdentidadeIds.push(saida.entregador.identidadeId);
  eventosEntregas.publicar({ tipo: "saida-atualizada", destinatariosIdentidadeIds, saida });

  for (const cliente of await identidadesClientesDaSaida(banco, registro.saida.id, registro.saida.empresaId)) {
    const fila = await calcularFilaDoPedido(banco, cliente.pedidoId);
    eventosEntregas.publicar({ tipo: "fila-atualizada", destinatariosIdentidadeIds: [cliente.identidadeId], fila });
  }

  // "Próxima" só vale com o entregador na rua: antes de sair, ninguém precisa descer para a calçada.
  if (registro.saida.status !== "em_andamento") return;
  const proxima = registro.paradas.filter((parada) => parada.encerradaEm === null).sort((a, b) => a.posicao - b.posicao)[0];
  if (proxima && (await registrarAvisoProxima(banco, proxima.id))) {
    eventosEntregas.publicar({ tipo: "entrega-proxima", destinatariosIdentidadeIds: [proxima.cliente.identidadeId], pedidoId: proxima.pedidoId, avisoId: proxima.id });
  }
}

// Recarrega a saída do banco antes de publicar (usado depois de mudanças em pedidos).
export async function publicarSaidaPorId(
  dependencias: { banco: Banco; eventosEntregas: CanalEventosEntregas },
  saidaId: string,
): Promise<void> {
  const registro = await buscarSaida(dependencias.banco, saidaId);
  if (registro) await publicarSaida(dependencias, registro);
}
