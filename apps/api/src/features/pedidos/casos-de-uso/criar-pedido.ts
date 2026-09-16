import type { Banco } from "@jaa/banco";
import type { FormaPagamentoEntrega } from "@jaa/contratos";
import { buscarEmpresaPublicaPorIdentidade, type EmpresaPublicaRegistro } from "../../catalogo/repositorios/repositorio-empresas-publicas.js";
import { listarIdsParticipantesDaConversa } from "../../conversas/repositorios/repositorio-conversas.js";
import type { CanalEventosMensagens } from "../../mensagens/lib/eventos-mensagens.js";
import { buscarMensagemNaConversa } from "../../mensagens/repositorios/repositorio-mensagens.js";
import { listarProdutosDisponiveisPorIds } from "../../produtos/repositorios/repositorio-produtos.js";
import { calcularItens, resolverPagamento } from "../lib/calcular-pedido.js";
import {
  buscarPedido,
  buscarPedidoPorTentativa,
  ErroPedidoDuplicado,
  inserirPedidoComItens,
  type PedidoComItensRegistro,
} from "../repositorios/repositorio-pedidos.js";

type ResultadoCriarPedido =
  | { tipo: "criado" | "ja-existente"; pedido: PedidoComItensRegistro; empresa: EmpresaPublicaRegistro }
  | { tipo: "empresa-nao-encontrada" }
  | { tipo: "conversa-nao-encontrada" }
  | { tipo: "itens-invalidos" }
  | { tipo: "pagamento-invalido" }
  | { tipo: "id-cliente-reutilizado" };

interface EntradaPedido {
  idCliente: string;
  empresaIdentidadeId: string;
  conversaId: string;
  itens: Array<{ produtoId: string; quantidade: number }>;
  pagamento: { forma: FormaPagamentoEntrega; trocoParaCentavos?: number | null | undefined };
}

/**
 * Cria o PEDIDO JAA a partir do carrinho do cliente. O cliente manda produto e quantidade; TUDO o que
 * é dinheiro (preço unitário, subtotal, total) vem do banco aqui, nunca do navegador.
 * Sequência: empresa pública ativa → conversa com cliente E empresa → produtos disponíveis DESTA empresa
 * → cálculo → regra de pagamento na entrega → transação (pedido + itens com snapshot + card) → evento.
 * Retry com o mesmo `idCliente` devolve o MESMO pedido; conteúdo diferente é conflito.
 */
export async function criarPedido(
  { banco, eventosMensagens }: { banco: Banco; eventosMensagens: CanalEventosMensagens },
  clienteIdentidadeId: string,
  operadorUsuarioId: string,
  entrada: EntradaPedido,
): Promise<ResultadoCriarPedido> {
  const empresa = await buscarEmpresaPublicaPorIdentidade(banco, entrada.empresaIdentidadeId);
  if (!empresa) return { tipo: "empresa-nao-encontrada" };

  // A conversa precisa ser destes dois: o cliente e a empresa do pedido (não uma conversa qualquer).
  const participantes = await listarIdsParticipantesDaConversa(banco, entrada.conversaId);
  if (!participantes.includes(clienteIdentidadeId) || !participantes.includes(empresa.identidadeId)) {
    return { tipo: "conversa-nao-encontrada" };
  }

  const produtos = await listarProdutosDisponiveisPorIds(banco, empresa.empresaId, entrada.itens.map((item) => item.produtoId));
  const calculo = calcularItens(entrada.itens, produtos);
  if (calculo.tipo !== "itens") return { tipo: "itens-invalidos" };

  const pagamento = resolverPagamento(entrada.pagamento, calculo.totalCentavos);
  if (pagamento.tipo !== "pagamento") return { tipo: "pagamento-invalido" };

  try {
    const { pedidoId, mensagemId } = await inserirPedidoComItens(banco, {
      empresaId: empresa.empresaId,
      clienteIdentidadeId,
      conversaId: entrada.conversaId,
      formaPagamentoNaEntrega: entrada.pagamento.forma,
      trocoParaCentavos: pagamento.trocoParaCentavos,
      totalCentavos: calculo.totalCentavos,
      idCliente: entrada.idCliente,
      itens: calculo.itens,
      operadorUsuarioId,
    });

    const pedido = await buscarPedido(banco, pedidoId);
    if (!pedido) throw new Error("Pedido criado não encontrado.");

    // Depois do commit: o card entra na conversa como mensagem normal (realtime, não lidas, notificação).
    const card = await buscarMensagemNaConversa(banco, entrada.conversaId, mensagemId);
    if (card) eventosMensagens.publicar({ tipo: "mensagem-criada", mensagem: card, destinatariosIdentidadeIds: participantes });

    return { tipo: "criado", pedido, empresa };
  } catch (erro) {
    if (!(erro instanceof ErroPedidoDuplicado)) throw erro;

    const existente = await buscarPedidoPorTentativa(banco, clienteIdentidadeId, entrada.idCliente);
    if (!existente) return { tipo: "id-cliente-reutilizado" };

    // Retry legítimo = mesma empresa, mesma conversa, mesmo pagamento e mesmos itens/total.
    const mesmosItens =
      existente.itens.length === calculo.itens.length &&
      calculo.itens.every((item) =>
        existente.itens.some((gravado) => gravado.produtoId === item.produtoId && gravado.quantidade === item.quantidade && gravado.subtotalCentavos === item.subtotalCentavos),
      );
    const mesmaTentativa =
      existente.pedido.empresaId === empresa.empresaId &&
      existente.pedido.conversaId === entrada.conversaId &&
      existente.pedido.formaPagamentoNaEntrega === entrada.pagamento.forma &&
      existente.pedido.trocoParaCentavos === pagamento.trocoParaCentavos &&
      existente.pedido.totalCentavos === calculo.totalCentavos &&
      mesmosItens;

    return mesmaTentativa ? { tipo: "ja-existente", pedido: existente, empresa } : { tipo: "id-cliente-reutilizado" };
  }
}
