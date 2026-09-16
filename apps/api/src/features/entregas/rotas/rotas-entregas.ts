import type { Banco } from "@jaa/banco";
import {
  alterarDisponibilidadeEntradaSchema,
  alterarStatusEntregadorEntradaSchema,
  atribuirEntregaEntradaSchema,
  convidarEntregadorEntradaSchema,
  responderConviteEntradaSchema,
  type ConviteEntregador,
  type EntregaDoPedido,
  type ErroApi,
  type ListaConvitesEntregador,
  type ListaEntregadores,
  type ListaEntregas,
  type ListaVinculosEntregador,
  type VinculoEntregador,
} from "@jaa/contratos";
import type { FastifyInstance, FastifyReply } from "fastify";
import * as z from "zod";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import { exigirIdentidadeAutenticada, obterIdentidadeExigida } from "../../autenticacao/lib/exigir-identidade-autenticada.js";
import { serializarEmpresaPublica } from "../../catalogo/lib/serializar-catalogo.js";
import { buscarEmpresaPublicaPorId } from "../../catalogo/repositorios/repositorio-empresas-publicas.js";
import { autorizarEmpresa } from "../../empresas/lib/autorizacao-empresas.js";
import { atribuirEntregaAutorizada, listarMinhasEntregas, obterMinhaEntrega } from "../casos-de-uso/atribuir-entrega.js";
import {
  alterarMinhaDisponibilidade,
  alterarStatusEntregadorAutorizado,
  convidarEntregadorAutorizado,
  listarConvitesPendentes,
  listarEntregadoresAutorizado,
  listarMeusVinculos,
  responderConviteDaPessoa,
} from "../casos-de-uso/gerir-entregadores.js";
import type { CanalEventosEntregas } from "../lib/eventos-entregas.js";
import { buscarAtribuicaoAtual, buscarEmpresaDoPedido, listarHistoricoAtribuicoes } from "../repositorios/repositorio-atribuicoes.js";
import { serializarEntregador } from "../lib/serializar-entrega.js";

const parametrosEmpresaSchema = z.object({ empresaId: z.uuid() });
const parametrosEntregadorSchema = z.object({ empresaId: z.uuid(), entregadorId: z.uuid() });
const parametrosPedidoDaEmpresaSchema = z.object({ empresaId: z.uuid(), pedidoId: z.uuid() });
const parametrosConviteSchema = z.object({ entregadorId: z.uuid() });
const parametrosEntregaSchema = z.object({ pedidoId: z.uuid() });

function responder(resposta: FastifyReply, status: number, erro: ErroApi) {
  return resposta.code(status).send(erro);
}

const EMPRESA_NAO_ENCONTRADA: ErroApi = { codigo: "EMPRESA_NAO_ENCONTRADA", mensagem: "Empresa não encontrada." };
const ENTREGADOR_NAO_ENCONTRADO: ErroApi = { codigo: "ENTREGADOR_NAO_ENCONTRADO", mensagem: "Entregador não encontrado." };
const ENTREGA_NAO_ENCONTRADA: ErroApi = { codigo: "ENTREGA_NAO_ENCONTRADA", mensagem: "Entrega não encontrada." };

/**
 * ENTREGADORES e ENTREGAS. Dois lados bem separados:
 * - EMPRESA (permissão `gerenciar-entregadores`): quadro de entregadores e atribuição dos pedidos;
 * - PESSOA: seus convites e as entregas atribuídas a ela AGORA — nunca pedidos arbitrários.
 * Entregador não recebe nenhuma rota administrativa: não é membro nem opera a identidade da empresa.
 */
export function registrarRotasEntregas(
  servidor: FastifyInstance,
  dependencias: { banco: Banco; autenticacao: Autenticacao; eventosEntregas: CanalEventosEntregas },
) {
  const preHandler = exigirIdentidadeAutenticada(dependencias);
  const { banco } = dependencias;

  servidor.get("/empresas/:empresaId/entregadores", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
    if (!parametros.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Empresa inválida." });

    const resultado = await listarEntregadoresAutorizado(banco, usuarioId, parametros.data.empresaId);
    if (resultado.tipo !== "lista") return responder(resposta, 404, EMPRESA_NAO_ENCONTRADA);
    const lista: ListaEntregadores = { entregadores: resultado.entregadores.map(serializarEntregador) };
    return lista;
  });

  servidor.post("/empresas/:empresaId/entregadores", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
    const entrada = convidarEntregadorEntradaSchema.safeParse(requisicao.body);
    if (!parametros.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Empresa inválida." });
    if (!entrada.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Informe o @usuario da pessoa." });

    const resultado = await convidarEntregadorAutorizado(banco, usuarioId, parametros.data.empresaId, entrada.data.nomeUsuario);
    switch (resultado.tipo) {
      case "empresa-nao-encontrada":
        return responder(resposta, 404, EMPRESA_NAO_ENCONTRADA);
      case "pessoa-nao-encontrada":
        return responder(resposta, 404, { codigo: "IDENTIDADE_NAO_ENCONTRADA", mensagem: "Não encontramos esse @usuario." });
      case "pessoa-e-operadora":
        return responder(resposta, 409, { codigo: "IDENTIDADE_NAO_AUTORIZADA", mensagem: "Quem opera a empresa não pode ser cadastrado como entregador." });
      case "convidado":
        return resposta.code(201).send(serializarEntregador(resultado.entregador));
    }
  });

  servidor.patch("/empresas/:empresaId/entregadores/:entregadorId", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosEntregadorSchema.safeParse(requisicao.params);
    const entrada = alterarStatusEntregadorEntradaSchema.safeParse(requisicao.body);
    if (!parametros.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Entregador inválido." });
    if (!entrada.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Status inválido." });

    const resultado = await alterarStatusEntregadorAutorizado(banco, usuarioId, parametros.data.empresaId, parametros.data.entregadorId, entrada.data.status);
    if (resultado.tipo === "empresa-nao-encontrada") return responder(resposta, 404, EMPRESA_NAO_ENCONTRADA);
    if (resultado.tipo !== "alterado") return responder(resposta, 404, ENTREGADOR_NAO_ENCONTRADO);

    // Revogação imediata: as entregas que ele tinha saem da lista dele agora (histórico preservado).
    for (const pedidoId of resultado.pedidosLiberados) {
      dependencias.eventosEntregas.publicar({
        tipo: "entrega-atualizada",
        destinatariosIdentidadeIds: [resultado.entregador.pessoa.identidadeId],
        pedidoId,
        entrega: null,
      });
    }
    return serializarEntregador(resultado.entregador);
  });

  // Entregador atual + histórico de atribuições de um pedido (visão operacional da empresa).
  servidor.get("/empresas/:empresaId/pedidos/:pedidoId/entrega", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosPedidoDaEmpresaSchema.safeParse(requisicao.params);
    if (!parametros.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Pedido inválido." });

    const acesso = await autorizarEmpresa(banco, usuarioId, parametros.data.empresaId, "ver-pedidos");
    if (!acesso) return responder(resposta, 404, EMPRESA_NAO_ENCONTRADA);

    // O pedido precisa ser DESTA empresa: nada de espiar entrega alheia sabendo o id.
    const { empresaId, pedidoId } = parametros.data;
    if ((await buscarEmpresaDoPedido(banco, pedidoId)) !== empresaId) {
      return responder(resposta, 404, { codigo: "PEDIDO_NAO_ENCONTRADO", mensagem: "Pedido não encontrado." });
    }

    const atual = await buscarAtribuicaoAtual(banco, pedidoId);
    const entrega: EntregaDoPedido = {
      entregadorAtual: atual ? { id: atual.entregadorId, pessoa: atual.pessoa, status: atual.status, disponivel: atual.disponivel, atribuidoEm: atual.atribuidoEm.toISOString() } : null,
      historico: await listarHistoricoAtribuicoes(banco, pedidoId),
    };
    return entrega;
  });

  servidor.post("/empresas/:empresaId/pedidos/:pedidoId/entrega", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosPedidoDaEmpresaSchema.safeParse(requisicao.params);
    const entrada = atribuirEntregaEntradaSchema.safeParse(requisicao.body);
    if (!parametros.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Pedido inválido." });
    if (!entrada.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Escolha um entregador." });

    const resultado = await atribuirEntregaAutorizada(dependencias, usuarioId, parametros.data.empresaId, parametros.data.pedidoId, entrada.data);
    switch (resultado.tipo) {
      case "empresa-nao-encontrada":
        return responder(resposta, 404, EMPRESA_NAO_ENCONTRADA);
      case "pedido-nao-encontrado":
        return responder(resposta, 404, { codigo: "PEDIDO_NAO_ENCONTRADO", mensagem: "Pedido não encontrado." });
      case "entregador-nao-encontrado":
        return responder(resposta, 404, ENTREGADOR_NAO_ENCONTRADO);
      case "entregador-inativo":
        return responder(resposta, 409, { codigo: "ENTREGADOR_INATIVO", mensagem: "Este entregador não está ativo na empresa." });
      case "entregador-indisponivel":
        return responder(resposta, 409, { codigo: "ENTREGADOR_INDISPONIVEL", mensagem: "Este entregador não está disponível para novas entregas agora." });
      case "status-invalido":
        return responder(resposta, 409, { codigo: "TRANSICAO_PEDIDO_INVALIDA", mensagem: "O pedido precisa estar pronto (ou já em entrega) para ter entregador." });
      case "conflito":
        return responder(resposta, 409, { codigo: "ATRIBUICAO_CONFLITANTE", mensagem: "A atribuição deste pedido mudou. Recarregue para ver quem está com ele." });
      case "atribuido": {
        const atual = await buscarAtribuicaoAtual(banco, parametros.data.pedidoId);
        const entrega: EntregaDoPedido = {
          entregadorAtual: atual
            ? { id: atual.entregadorId, pessoa: atual.pessoa, status: atual.status, disponivel: atual.disponivel, atribuidoEm: atual.atribuidoEm.toISOString() }
            : null,
          historico: await listarHistoricoAtribuicoes(banco, parametros.data.pedidoId),
        };
        return entrega;
      }
    }
  });

  /* Lado da PESSOA: convites e entregas próprias. Nenhuma dessas rotas aceita empresaId do cliente. */

  servidor.get("/entregas/convites", { preHandler }, async (requisicao) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const convites: ConviteEntregador[] = [];
    for (const convite of await listarConvitesPendentes(banco, usuarioId)) {
      const empresa = await buscarEmpresaPublicaPorId(banco, convite.empresaId);
      if (empresa) convites.push({ id: convite.id, empresa: serializarEmpresaPublica(empresa), status: convite.status, convidadoEm: convite.convidadoEm.toISOString() });
    }
    const lista: ListaConvitesEntregador = { convites };
    return lista;
  });

  servidor.post("/entregas/convites/:entregadorId", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosConviteSchema.safeParse(requisicao.params);
    const entrada = responderConviteEntradaSchema.safeParse(requisicao.body);
    if (!parametros.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Convite inválido." });
    if (!entrada.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Resposta inválida." });

    const resultado = await responderConviteDaPessoa(banco, usuarioId, parametros.data.entregadorId, entrada.data.resposta === "aceitar");
    if (resultado.tipo !== "respondido") return responder(resposta, 404, ENTREGADOR_NAO_ENCONTRADO);
    return { status: resultado.status };
  });

  /**
   * "Empresas em que trabalho": vínculos da PESSOA autenticada, com a disponibilidade em cada empresa.
   * Cada linha é de uma empresa; nenhuma empresa lê esta rota.
   */
  servidor.get("/entregas/vinculos", { preHandler }, async (requisicao) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const vinculos: VinculoEntregador[] = [];
    for (const vinculo of await listarMeusVinculos(banco, usuarioId)) {
      const empresa = await buscarEmpresaPublicaPorId(banco, vinculo.empresaId);
      if (!empresa) continue;
      vinculos.push({
        id: vinculo.id,
        empresa: serializarEmpresaPublica(empresa),
        status: vinculo.status,
        disponivel: vinculo.disponivel,
        disponibilidadeAtualizadaEm: vinculo.disponibilidadeAtualizadaEm?.toISOString() ?? null,
      });
    }
    const lista: ListaVinculosEntregador = { vinculos };
    return lista;
  });

  /**
   * DISPONIBILIDADE — só o próprio entregador, e só no vínculo dele. A empresa não tem rota para isto:
   * ficar disponível é decisão de quem entrega. Vínculo de outra pessoa, convite pendente ou inativo
   * respondem 404 (sem revelar se existe).
   */
  servidor.patch("/entregas/vinculos/:entregadorId", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosConviteSchema.safeParse(requisicao.params);
    const entrada = alterarDisponibilidadeEntradaSchema.safeParse(requisicao.body);
    if (!parametros.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Vínculo inválido." });
    if (!entrada.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Informe se você está disponível." });

    const resultado = await alterarMinhaDisponibilidade(banco, usuarioId, parametros.data.entregadorId, entrada.data.disponivel);
    if (resultado.tipo !== "alterado") return responder(resposta, 404, ENTREGADOR_NAO_ENCONTRADO);

    // A empresa daquele vínculo acompanha em tempo real quem ficou disponível (e só ela).
    const empresa = await buscarEmpresaPublicaPorId(banco, resultado.entregador.empresaId);
    if (empresa) {
      dependencias.eventosEntregas.publicar({
        tipo: "disponibilidade-atualizada",
        destinatariosIdentidadeIds: [empresa.identidadeId],
        entregador: serializarEntregador(resultado.entregador),
      });
    }
    return serializarEntregador(resultado.entregador);
  });

  servidor.get("/entregas", { preHandler }, async (requisicao) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const lista: ListaEntregas = { entregas: await listarMinhasEntregas(banco, usuarioId) };
    return lista;
  });

  servidor.get("/entregas/:pedidoId", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosEntregaSchema.safeParse(requisicao.params);
    if (!parametros.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Entrega inválida." });

    const entrega = await obterMinhaEntrega(banco, usuarioId, parametros.data.pedidoId);
    if (!entrega) return responder(resposta, 404, ENTREGA_NAO_ENCONTRADA);
    return entrega;
  });
}
