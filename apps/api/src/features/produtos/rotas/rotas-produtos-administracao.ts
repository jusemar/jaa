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
import { ArmazenamentoNaoConfiguradoErro, type ArmazenamentoDeArquivos } from "../../../lib/armazenamento/armazenamento-arquivos.js";
import { ImagemInvalidaErro, montarChave, processarImagem } from "../../../lib/armazenamento/pipeline-imagem.js";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import { exigirIdentidadeAutenticada, obterIdentidadeExigida } from "../../autenticacao/lib/exigir-identidade-autenticada.js";
import {
  alterarDisponibilidadeProduto,
  atualizarProduto,
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
   * IMAGEM DO PRODUTO. Os bytes passam pelo mesmo pipeline do avatar: o tipo é conferido nos BYTES,
   * os metadados são descartados e a imagem é redimensionada antes de sair do servidor.
   */
  servidor.post("/empresas/:empresaId/produtos/:produtoId/imagem", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosProdutoSchema.safeParse(requisicao.params);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Produto inválido.");
    const { empresaId, produtoId } = parametros.data;

    const arquivo = await requisicao.file();
    if (!arquivo) return responderDadosInvalidos(resposta, "Envie uma imagem.");

    try {
      const imagem = await processarImagem(await arquivo.toBuffer(), "imagem-produto", arquivo.mimetype);
      const chave = montarChave("imagem-produto", produtoId);
      // Autorização primeiro? Não: o caso de uso confere permissão e existência ANTES de trocar a
      // chave. Se ele recusar, o objeto recém-gravado é removido logo abaixo.
      await armazenamento.salvar({ chave, conteudo: imagem.conteudo, tipoConteudo: imagem.tipoConteudo });
      const resultado = await definirImagemProduto(banco, usuarioId, empresaId, produtoId, chave);
      if (resultado.tipo !== "atualizado") {
        await armazenamento.remover(chave).catch(() => undefined);
        return responderNaoEncontrado(resposta, resultado.tipo);
      }
      if (resultado.chaveAnterior && resultado.chaveAnterior !== chave) await armazenamento.remover(resultado.chaveAnterior).catch(() => undefined);
      return { chave, url: armazenamento.urlPublica(chave) };
    } catch (erro) {
      if (erro instanceof ImagemInvalidaErro) return resposta.code(400).send({ codigo: "ARQUIVO_INVALIDO", mensagem: erro.message } satisfies ErroApi);
      if (erro instanceof ArmazenamentoNaoConfiguradoErro) {
        return resposta.code(503).send({ codigo: "ARMAZENAMENTO_INDISPONIVEL", mensagem: "O envio de imagens ainda não está configurado neste ambiente." } satisfies ErroApi);
      }
      throw erro;
    }
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
