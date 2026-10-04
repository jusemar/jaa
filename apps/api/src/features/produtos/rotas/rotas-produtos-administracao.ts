import type { Banco } from "@jaa/banco";
import {
  alterarDisponibilidadeProdutoEntradaSchema,
  atualizarProdutoEntradaSchema,
  consultaProdutosSchema,
  criarProdutoEntradaSchema,
  type ErroApi,
  type ListaProdutos,
} from "@jaa/contratos";
import type { FastifyInstance, FastifyReply } from "fastify";
import * as z from "zod";
import type { ArmazenamentoDeArquivos } from "../../../lib/armazenamento/armazenamento-arquivos.js";
import {
  FALHA_ARMAZENAMENTO_INDISPONIVEL,
  LIMITE_ENVIO_IMAGEM_PRODUTO,
  falhaLimiteDeEnvios,
  gravarESubstituir,
  lerImagemEnviada,
} from "../../../lib/armazenamento/receber-imagem.js";
import { consumirLimiteDeUso } from "../../../lib/limite-de-uso.js";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import { exigirIdentidadeAutenticada, obterIdentidadeExigida } from "../../autenticacao/lib/exigir-identidade-autenticada.js";
import {
  alterarDisponibilidadeProduto,
  atualizarProduto,
  autorizarImagemProduto,
  criarProduto,
  definirImagemProduto,
  listarProdutosAdministrados,
  obterProdutoAdministrado,
} from "../casos-de-uso/administrar-produtos.js";
import { serializarProduto } from "../lib/serializar-produto.js";

const parametrosEmpresaSchema = z.object({ empresaId: z.uuid() });
const parametrosProdutoSchema = z.object({ empresaId: z.uuid(), produtoId: z.uuid() });

function responderDadosInvalidos(resposta: FastifyReply, mensagem: string | undefined) {
  const erro: ErroApi = { codigo: "DADOS_INVALIDOS", mensagem: mensagem ?? "Dados inválidos." };
  return resposta.code(400).send(erro);
}

function responderNaoEncontrado(resposta: FastifyReply, tipo: "empresa-nao-encontrada" | "produto-nao-encontrado" | "categoria-nao-encontrada") {
  const erros: Record<typeof tipo, ErroApi> = {
    "empresa-nao-encontrada": { codigo: "EMPRESA_NAO_ENCONTRADA", mensagem: "Empresa não encontrada." },
    "produto-nao-encontrado": { codigo: "PRODUTO_NAO_ENCONTRADO", mensagem: "Produto não encontrado." },
    "categoria-nao-encontrada": { codigo: "CATEGORIA_NAO_ENCONTRADA", mensagem: "Categoria não encontrada." },
  };
  return resposta.code(404).send(erros[tipo]);
}

/**
 * API ADMINISTRATIVA de produtos (membros autorizados). Não é pública: a consulta do cliente tem
 * rotas e contrato próprios, só com dados permitidos e produtos disponíveis.
 * Handlers finos: validam, chamam o caso de uso (que autoriza) e serializam.
 */
export function registrarRotasProdutosAdministracao(
  servidor: FastifyInstance,
  dependencias: { banco: Banco; autenticacao: Autenticacao; armazenamento: ArmazenamentoDeArquivos },
) {
  const preHandler = exigirIdentidadeAutenticada(dependencias);
  const { banco, armazenamento } = dependencias;
  const urlPublica = (chave: string) => armazenamento.urlPublica(chave);

  /** Lista PAGINADA e filtrável: a tela pede uma página, o servidor decide o recorte e o total. */
  servidor.get("/empresas/:empresaId/produtos", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Empresa inválida.");
    const consulta = consultaProdutosSchema.safeParse(requisicao.query ?? {});
    if (!consulta.success) return responderDadosInvalidos(resposta, consulta.error.issues[0]?.message);

    const resultado = await listarProdutosAdministrados(banco, usuarioId, parametros.data.empresaId, consulta.data);
    if (resultado.tipo !== "lista") return responderNaoEncontrado(resposta, resultado.tipo);

    const { pagina, limite } = consulta.data;
    const lista: ListaProdutos = {
      produtos: resultado.produtos.map((produto) => serializarProduto(produto, urlPublica)),
      paginacao: { pagina, limite, total: resultado.total, totalPaginas: Math.max(1, Math.ceil(resultado.total / limite)) },
    };
    return lista;
  });

  servidor.post("/empresas/:empresaId/produtos", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
    const entrada = criarProdutoEntradaSchema.safeParse(requisicao.body);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Empresa inválida.");
    if (!entrada.success) return responderDadosInvalidos(resposta, entrada.error.issues[0]?.message);

    const resultado = await criarProduto(banco, usuarioId, parametros.data.empresaId, entrada.data);
    if (resultado.tipo !== "criado") return responderNaoEncontrado(resposta, resultado.tipo);
    return resposta.code(201).send(serializarProduto(resultado.produto, urlPublica));
  });

  servidor.get("/empresas/:empresaId/produtos/:produtoId", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosProdutoSchema.safeParse(requisicao.params);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Produto inválido.");

    const { empresaId, produtoId } = parametros.data;
    const resultado = await obterProdutoAdministrado(banco, usuarioId, empresaId, produtoId);
    if (resultado.tipo !== "produto") return responderNaoEncontrado(resposta, resultado.tipo);
    return serializarProduto(resultado.produto, urlPublica);
  });

  servidor.patch("/empresas/:empresaId/produtos/:produtoId", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosProdutoSchema.safeParse(requisicao.params);
    const entrada = atualizarProdutoEntradaSchema.safeParse(requisicao.body);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Produto inválido.");
    if (!entrada.success) return responderDadosInvalidos(resposta, entrada.error.issues[0]?.message);

    const { empresaId, produtoId } = parametros.data;
    const resultado = await atualizarProduto(banco, usuarioId, empresaId, produtoId, entrada.data);
    if (resultado.tipo !== "atualizado") return responderNaoEncontrado(resposta, resultado.tipo);
    return serializarProduto(resultado.produto, urlPublica);
  });

  servidor.patch("/empresas/:empresaId/produtos/:produtoId/disponibilidade", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosProdutoSchema.safeParse(requisicao.params);
    const entrada = alterarDisponibilidadeProdutoEntradaSchema.safeParse(requisicao.body);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Produto inválido.");
    if (!entrada.success) return responderDadosInvalidos(resposta, entrada.error.issues[0]?.message);

    const { empresaId, produtoId } = parametros.data;
    const resultado = await alterarDisponibilidadeProduto(banco, usuarioId, empresaId, produtoId, entrada.data.disponibilidade);
    if (resultado.tipo !== "atualizado") return responderNaoEncontrado(resposta, resultado.tipo);
    return serializarProduto(resultado.produto, urlPublica);
  });

  /**
   * IMAGEM DO PRODUTO. Ordem obrigatória: autorização (permissão + produto desta empresa) → limite de
   * envios → leitura e pipeline (tipo conferido nos BYTES, metadados descartados, redimensionamento)
   * → gravação com chave gerada pelo servidor → troca da referência → remoção da imagem anterior.
   */
  servidor.post("/empresas/:empresaId/produtos/:produtoId/imagem", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosProdutoSchema.safeParse(requisicao.params);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Produto inválido.");
    const { empresaId, produtoId } = parametros.data;

    const autorizacao = await autorizarImagemProduto(banco, usuarioId, empresaId, produtoId);
    if (autorizacao.tipo !== "autorizado") return responderNaoEncontrado(resposta, autorizacao.tipo);

    const limite = await consumirLimiteDeUso(banco, `envio-imagem-produto:${usuarioId}`, LIMITE_ENVIO_IMAGEM_PRODUTO);
    if (!limite.permitido) {
      const falha = falhaLimiteDeEnvios(limite.tenteNovamenteEmSegundos);
      return resposta.code(falha.status).header("retry-after", String(limite.tenteNovamenteEmSegundos)).send(falha.erro);
    }

    const leitura = await lerImagemEnviada(requisicao, "imagem-produto");
    if (!leitura.ok) return resposta.code(leitura.status).send(leitura.erro);

    const gravacao = await gravarESubstituir(armazenamento, { tipo: "imagem-produto", donoId: produtoId, imagem: leitura.imagem }, async (chave) => {
      // A permissão é conferida de novo na troca: ela pode ter sido revogada durante o envio.
      const resultado = await definirImagemProduto(banco, usuarioId, empresaId, produtoId, chave);
      return resultado.tipo === "atualizado" ? { trocada: true, anterior: resultado.chaveAnterior } : { trocada: false, recusa: resultado.tipo };
    });
    if (!gravacao.ok) {
      if ("indisponivel" in gravacao) return resposta.code(FALHA_ARMAZENAMENTO_INDISPONIVEL.status).send(FALHA_ARMAZENAMENTO_INDISPONIVEL.erro);
      return responderNaoEncontrado(resposta, gravacao.recusa);
    }
    return { chave: gravacao.chave, url: armazenamento.urlPublica(gravacao.chave) };
  });

  servidor.delete("/empresas/:empresaId/produtos/:produtoId/imagem", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosProdutoSchema.safeParse(requisicao.params);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Produto inválido.");

    const { empresaId, produtoId } = parametros.data;
    const resultado = await definirImagemProduto(banco, usuarioId, empresaId, produtoId, null);
    if (resultado.tipo !== "atualizado") return responderNaoEncontrado(resposta, resultado.tipo);
    if (resultado.chaveAnterior) await armazenamento.remover(resultado.chaveAnterior).catch(() => undefined);
    return { removida: resultado.chaveAnterior !== null };
  });
}
