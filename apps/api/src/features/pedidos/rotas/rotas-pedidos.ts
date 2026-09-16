import type { Banco } from "@jaa/banco";
import { criarPedidoEntradaSchema, type ErroApi, type FilaDoPedido } from "@jaa/contratos";
import type { FastifyInstance, FastifyReply } from "fastify";
import * as z from "zod";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import { exigirIdentidadeAtuante, obterIdentidadeExigida } from "../../autenticacao/lib/exigir-identidade-autenticada.js";
import type { CanalEventosMensagens } from "../../mensagens/lib/eventos-mensagens.js";
import { criarPedido } from "../casos-de-uso/criar-pedido.js";
import { obterPedidoAutorizado } from "../casos-de-uso/obter-pedido.js";
import { calcularFilaDoPedido } from "../../entregas/casos-de-uso/gerir-saidas.js";
import { serializarEmpresaPublica } from "../../catalogo/lib/serializar-catalogo.js";
import { serializarPedido } from "../lib/serializar-pedido.js";

const parametrosPedidoSchema = z.object({ pedidoId: z.uuid() });

function responder(resposta: FastifyReply, status: number, erro: ErroApi) {
  return resposta.code(status).send(erro);
}

/**
 * PEDIDO JAA. O cliente envia produto + quantidade + forma de pagamento NA ENTREGA; preços e total são
 * recalculados no servidor. Criar pedido é ação da identidade PESSOAL (cliente); a empresa do pedido
 * também pode consultá-lo quando operada por quem tem vínculo.
 */
export function registrarRotasPedidos(
  servidor: FastifyInstance,
  dependencias: { banco: Banco; autenticacao: Autenticacao; eventosMensagens: CanalEventosMensagens },
) {
  const preHandler = exigirIdentidadeAtuante(dependencias);

  servidor.post("/pedidos", { preHandler }, async (requisicao, resposta) => {
    const { identidadeId, tipoIdentidade, usuarioId } = obterIdentidadeExigida(requisicao);
    const entrada = criarPedidoEntradaSchema.safeParse(requisicao.body);

    if (tipoIdentidade !== "pessoal") {
      return responder(resposta, 403, { codigo: "IDENTIDADE_NAO_AUTORIZADA", mensagem: "Pedidos são feitos pela sua identidade pessoal." });
    }
    if (!entrada.success) {
      return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: entrada.error.issues[0]?.message ?? "Dados inválidos." });
    }

    const resultado = await criarPedido(dependencias, identidadeId, usuarioId, entrada.data);
    switch (resultado.tipo) {
      case "empresa-nao-encontrada":
        return responder(resposta, 404, { codigo: "EMPRESA_NAO_ENCONTRADA", mensagem: "Empresa não encontrada." });
      case "conversa-nao-encontrada":
        return responder(resposta, 404, { codigo: "CONVERSA_NAO_ENCONTRADA", mensagem: "Conversa não encontrada." });
      case "endereco-nao-encontrado":
        return responder(resposta, 404, { codigo: "ENDERECO_NAO_ENCONTRADO", mensagem: "Endereço de entrega não encontrado." });
      case "localizacao-nao-confirmada":
        return responder(resposta, 409, { codigo: "LOCALIZACAO_NAO_CONFIRMADA", mensagem: "Confirme no mapa onde devemos entregar antes de fazer o pedido." });
      case "itens-invalidos":
        return responder(resposta, 409, { codigo: "ITENS_INVALIDOS", mensagem: "Algum produto do carrinho não está mais disponível nesta empresa." });
      case "pagamento-invalido":
        return responder(resposta, 400, { codigo: "PAGAMENTO_INVALIDO", mensagem: "Pagamento na entrega inválido: confira a forma e o troco." });
      case "id-cliente-reutilizado":
        return responder(resposta, 409, { codigo: "ID_CLIENTE_REUTILIZADO", mensagem: "Este identificador de pedido já foi usado para outro pedido." });
      case "criado":
        return resposta.code(201).send(serializarPedido(resultado.pedido, serializarEmpresaPublica(resultado.empresa)));
      case "ja-existente":
        return resposta.code(200).send(serializarPedido(resultado.pedido, serializarEmpresaPublica(resultado.empresa)));
    }
  });

  /**
   * FILA do próprio pedido: informação DERIVADA da sequência da saída — situação e quantas entregas
   * ativas estão antes da dele. Nunca a rota, os endereços ou os pedidos dos outros clientes.
   * A autorização é a mesma do pedido (cliente dono ou empresa dona).
   */
  servidor.get("/pedidos/:pedidoId/fila", { preHandler }, async (requisicao, resposta) => {
    const { identidadeId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosPedidoSchema.safeParse(requisicao.params);
    if (!parametros.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Pedido inválido." });

    const resultado = await obterPedidoAutorizado(dependencias.banco, identidadeId, parametros.data.pedidoId);
    if (resultado.tipo !== "pedido") return responder(resposta, 404, { codigo: "PEDIDO_NAO_ENCONTRADO", mensagem: "Pedido não encontrado." });
    const fila: FilaDoPedido = await calcularFilaDoPedido(dependencias.banco, parametros.data.pedidoId);
    return fila;
  });

  servidor.get("/pedidos/:pedidoId", { preHandler }, async (requisicao, resposta) => {
    const { identidadeId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosPedidoSchema.safeParse(requisicao.params);
    if (!parametros.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Pedido inválido." });

    const resultado = await obterPedidoAutorizado(dependencias.banco, identidadeId, parametros.data.pedidoId);
    if (resultado.tipo !== "pedido") return responder(resposta, 404, { codigo: "PEDIDO_NAO_ENCONTRADO", mensagem: "Pedido não encontrado." });
    return serializarPedido(resultado.pedido, serializarEmpresaPublica(resultado.empresa));
  });
}
