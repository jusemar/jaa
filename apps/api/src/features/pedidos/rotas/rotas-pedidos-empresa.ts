import type { Banco } from "@jaa/banco";
import {
  LIMITE_PADRAO_PEDIDOS_EMPRESA,
  avancarStatusPedidoEntradaSchema,
  cancelarPedidoEntradaSchema,
  filtroPedidosEmpresaSchema,
  type ErroApi,
  type ListaPedidosEmpresa,
} from "@jaa/contratos";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import * as z from "zod";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import { exigirIdentidadeAutenticada, obterIdentidadeExigida } from "../../autenticacao/lib/exigir-identidade-autenticada.js";
import { serializarEmpresaPublica } from "../../catalogo/lib/serializar-catalogo.js";
import {
  alterarStatusPedidoAutorizado,
  listarPedidosDaEmpresaAutorizado,
  obterPedidoDaEmpresaAutorizado,
  type IntencaoStatus,
} from "../casos-de-uso/gerir-pedidos-empresa.js";
import type { CanalEventosPedidos } from "../lib/eventos-pedidos.js";
import { serializarPedido, serializarPedidoDaEmpresa } from "../lib/serializar-pedido.js";

const parametrosEmpresaSchema = z.object({ empresaId: z.uuid() });
const parametrosPedidoSchema = z.object({ empresaId: z.uuid(), pedidoId: z.uuid() });
const consultaListaSchema = z.object({
  filtro: filtroPedidosEmpresaSchema.default("todos"),
  antesDe: z.uuid().optional(),
  limite: z.coerce.number().int().min(1).max(50).default(LIMITE_PADRAO_PEDIDOS_EMPRESA),
});

function responder(resposta: FastifyReply, status: number, erro: ErroApi) {
  return resposta.code(status).send(erro);
}

const NAO_ENCONTRADA: ErroApi = { codigo: "EMPRESA_NAO_ENCONTRADA", mensagem: "Empresa não encontrada." };
const PEDIDO_NAO_ENCONTRADO: ErroApi = { codigo: "PEDIDO_NAO_ENCONTRADO", mensagem: "Pedido não encontrado." };

/**
 * OPERAÇÃO dos pedidos pela empresa (conta com vínculo). Não existe rota genérica que aceite
 * `{ status: qualquerCoisa }`: a empresa declara a intenção (avançar/cancelar) e o status que via.
 * O cliente do pedido não tem acesso a nada daqui — ele só consulta o próprio pedido em /pedidos/:id.
 */
export function registrarRotasPedidosEmpresa(
  servidor: FastifyInstance,
  dependencias: { banco: Banco; autenticacao: Autenticacao; eventosPedidos: CanalEventosPedidos },
) {
  const preHandler = exigirIdentidadeAutenticada(dependencias);
  const { banco } = dependencias;

  servidor.get("/empresas/:empresaId/pedidos", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
    const consulta = consultaListaSchema.safeParse(requisicao.query);
    if (!parametros.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Empresa inválida." });
    if (!consulta.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Consulta inválida." });

    const resultado = await listarPedidosDaEmpresaAutorizado(banco, usuarioId, parametros.data.empresaId, consulta.data);
    if (resultado.tipo !== "lista") return responder(resposta, 404, NAO_ENCONTRADA);

    const lista: ListaPedidosEmpresa = {
      pedidos: resultado.pedidos.map(serializarPedidoDaEmpresa),
      // Página cheia ⇒ pode haver mais; o cursor é o pedido mais antigo desta página.
      proximoCursor: resultado.pedidos.length === consulta.data.limite ? (resultado.pedidos.at(-1)?.id ?? null) : null,
    };
    return lista;
  });

  servidor.get("/empresas/:empresaId/pedidos/:pedidoId", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosPedidoSchema.safeParse(requisicao.params);
    if (!parametros.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Pedido inválido." });

    const resultado = await obterPedidoDaEmpresaAutorizado(banco, usuarioId, parametros.data.empresaId, parametros.data.pedidoId);
    if (resultado.tipo === "empresa-nao-encontrada") return responder(resposta, 404, NAO_ENCONTRADA);
    if (resultado.tipo === "pedido-nao-encontrado") return responder(resposta, 404, PEDIDO_NAO_ENCONTRADO);
    return serializarPedido(resultado.pedido, serializarEmpresaPublica(resultado.empresa));
  });

  async function alterar(requisicao: FastifyRequest, resposta: FastifyReply, intencaoDe: (corpo: unknown) => IntencaoStatus | null) {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosPedidoSchema.safeParse(requisicao.params);
    if (!parametros.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Pedido inválido." });

    const intencao = intencaoDe(requisicao.body);
    if (!intencao) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Informe o status atual do pedido e, no cancelamento, o motivo." });

    const resultado = await alterarStatusPedidoAutorizado(dependencias, usuarioId, parametros.data.empresaId, parametros.data.pedidoId, intencao);
    switch (resultado.tipo) {
      case "empresa-nao-encontrada":
        return responder(resposta, 404, NAO_ENCONTRADA);
      case "pedido-nao-encontrado":
        return responder(resposta, 404, PEDIDO_NAO_ENCONTRADO);
      case "transicao-invalida":
        return responder(resposta, 409, {
          codigo: "TRANSICAO_PEDIDO_INVALIDA",
          mensagem: "Este pedido não está mais nesse estado. Recarregue para ver a situação atual.",
        });
      case "alterado":
        return serializarPedido(resultado.pedido, serializarEmpresaPublica(resultado.empresa));
    }
  }

  servidor.post("/empresas/:empresaId/pedidos/:pedidoId/avancar", { preHandler }, async (requisicao, resposta) =>
    alterar(requisicao, resposta, (corpo) => {
      const entrada = avancarStatusPedidoEntradaSchema.safeParse(corpo);
      return entrada.success ? { tipo: "avancar", statusAtual: entrada.data.statusAtual } : null;
    }),
  );

  servidor.post("/empresas/:empresaId/pedidos/:pedidoId/cancelar", { preHandler }, async (requisicao, resposta) =>
    alterar(requisicao, resposta, (corpo) => {
      const entrada = cancelarPedidoEntradaSchema.safeParse(corpo);
      return entrada.success ? { tipo: "cancelar", statusAtual: entrada.data.statusAtual, motivo: entrada.data.motivo } : null;
    }),
  );
}
