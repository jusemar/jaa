import type { Banco } from "@jaa/banco";
import {
  TERMO_BUSCA_TAMANHO_MINIMO,
  salvarContatoEntradaSchema,
  termoParecePelefone,
  type Contato,
  type ErroApi,
  type ListaContatos,
  type RespostaBusca,
  type ResultadoBusca,
} from "@jaa/contratos";
import type { FastifyInstance, FastifyReply } from "fastify";
import * as z from "zod";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import { exigirIdentidadeAtuante, obterIdentidadeExigida } from "../../autenticacao/lib/exigir-identidade-autenticada.js";
import { normalizarCelularBrasileiro } from "../../autenticacao/lib/telefone.js";
import {
  buscarIdentidadePublica,
  buscarNoJaa,
  buscarNosContatos,
  contatoExiste,
  filtrarContatosConhecidos,
  listarContatos,
  removerContato,
  salvarContato,
  type ContatoRegistro,
  type IdentidadePublica,
} from "../repositorios/repositorio-contatos.js";

/*
 * CONTATOS e BUSCA ÚNICA.
 *
 * Tudo acontece na identidade ATUANTE (cabeçalho `x-jaa-identidade`, resolvido pelo servidor): a
 * agenda pessoal e a da empresa são separadas, e o cliente nunca escolhe "de quem" é a agenda.
 */

function responder(resposta: FastifyReply, status: number, erro: ErroApi) {
  return resposta.code(status).send(erro);
}

const serializarContato = (registro: ContatoRegistro): Contato => ({
  identidade: registro.identidade,
  apelido: registro.apelido,
  favorito: registro.favorito,
  criadoEm: registro.criadoEm.toISOString(),
});

const paraResultado = (identidade: IdentidadePublica, apelido: string | null, ehContato: boolean): ResultadoBusca => ({ identidade, ehContato, apelido });

export function registrarRotasContatos(servidor: FastifyInstance, dependencias: { banco: Banco; autenticacao: Autenticacao }) {
  const preHandler = exigirIdentidadeAtuante(dependencias);
  const { banco } = dependencias;

  servidor.get("/contatos", { preHandler }, async (requisicao) => {
    const { identidadeId } = obterIdentidadeExigida(requisicao);
    const lista: ListaContatos = { contatos: (await listarContatos(banco, identidadeId)).map(serializarContato) };
    return lista;
  });

  /**
   * Salvar é UNILATERAL: entra na MINHA agenda e não me coloca na agenda da outra pessoa.
   * Repetir é idempotente (atualiza o apelido).
   */
  servidor.post("/contatos", { preHandler }, async (requisicao, resposta) => {
    const { identidadeId } = obterIdentidadeExigida(requisicao);
    const entrada = salvarContatoEntradaSchema.safeParse(requisicao.body);
    if (!entrada.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Informe a identidade do contato." });
    if (entrada.data.identidadeId === identidadeId) {
      return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Você não pode salvar a si mesmo nos contatos." });
    }

    const identidade = await buscarIdentidadePublica(banco, entrada.data.identidadeId);
    if (!identidade) return responder(resposta, 404, { codigo: "IDENTIDADE_NAO_ENCONTRADA", mensagem: "Identidade não encontrada." });

    await salvarContato(banco, identidadeId, identidade.identidadeId, entrada.data.apelido?.trim() || null);
    const contato: Contato = {
      identidade,
      apelido: entrada.data.apelido?.trim() || null,
      favorito: false,
      criadoEm: new Date().toISOString(),
    };
    return resposta.code(201).send(contato);
  });

  servidor.delete("/contatos/:identidadeId", { preHandler }, async (requisicao, resposta) => {
    const { identidadeId } = obterIdentidadeExigida(requisicao);
    const parametros = z.object({ identidadeId: z.uuid() }).safeParse(requisicao.params);
    if (!parametros.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Contato inválido." });

    const removido = await removerContato(banco, identidadeId, parametros.data.identidadeId);
    if (!removido) return responder(resposta, 404, { codigo: "IDENTIDADE_NAO_ENCONTRADA", mensagem: "Este contato não está na sua agenda." });
    return { removido: true };
  });

  /**
   * BUSCA ÚNICA ("Pesquisar no Jaa"): meus CONTATOS primeiro, depois descoberta no Jaa (limitada).
   * Encontra por nome e @usuario; por telefone, só quem optou por ser encontrado assim.
   * O telefone NUNCA volta no resultado.
   */
  servidor.get("/busca", { preHandler }, async (requisicao, resposta) => {
    const { identidadeId } = obterIdentidadeExigida(requisicao);
    const consulta = z.object({ termo: z.string().optional() }).safeParse(requisicao.query);
    const termo = consulta.success ? (consulta.data.termo ?? "").trim() : "";
    if (termo.length < TERMO_BUSCA_TAMANHO_MINIMO) {
      const vazia: RespostaBusca = { contatos: [], externos: [] };
      return vazia;
    }

    const daAgenda = await buscarNosContatos(banco, identidadeId, termo);
    // Telefone só entra na comparação quando o termo realmente parece um celular brasileiro.
    const telefone = termoParecePelefone(termo) ? normalizarCelularBrasileiro(termo) : null;
    const externos = await buscarNoJaa(banco, {
      identidadeAtual: identidadeId,
      termo,
      telefoneNormalizado: telefone,
      excluir: daAgenda.map((contato) => contato.identidade.identidadeId),
    });

    const conhecidos = await filtrarContatosConhecidos(banco, identidadeId, externos.map((identidade) => identidade.identidadeId));
    const busca: RespostaBusca = {
      contatos: daAgenda.map((contato) => paraResultado(contato.identidade, contato.apelido, true)),
      externos: externos.map((identidade) => paraResultado(identidade, conhecidos.get(identidade.identidadeId) ?? null, conhecidos.has(identidade.identidadeId))),
    };
    // Nada de telefone no payload, mesmo quando a busca foi feita por telefone.
    void resposta;
    return busca;
  });
}
