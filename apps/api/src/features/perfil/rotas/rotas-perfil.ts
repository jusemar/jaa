import type { Banco } from "@jaa/banco";
import {
  atualizarPerfilEntradaSchema,
  atualizarPrivacidadeEntradaSchema,
  podeVer,
  salvarExcecaoPrivacidadeEntradaSchema,
  type ErroApi,
  type ListaExcecoesPrivacidade,
  type MeuPerfil,
  type PerfilPublico,
} from "@jaa/contratos";
import type { FastifyInstance, FastifyReply } from "fastify";
import * as z from "zod";
import type { ArmazenamentoDeArquivos } from "../../../lib/armazenamento/armazenamento-arquivos.js";
import { ArmazenamentoNaoConfiguradoErro } from "../../../lib/armazenamento/armazenamento-arquivos.js";
import { ImagemInvalidaErro, montarChave, processarImagem } from "../../../lib/armazenamento/pipeline-imagem.js";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import { exigirIdentidadeAtuante, obterIdentidadeExigida } from "../../autenticacao/lib/exigir-identidade-autenticada.js";
import {
  atualizarPerfil,
  atualizarPreferencias,
  buscarExcecao,
  buscarPerfil,
  definirFotoChave,
  ehContatoDe,
  listarExcecoes,
  removerExcecao,
  salvarExcecao,
  type PerfilRegistro,
} from "../repositorios/repositorio-perfil.js";

/*
 * PERFIL da identidade ATUANTE.
 *
 * A mesma rota serve pessoa e empresa: agindo como a Pizzaria, "meu perfil" é o perfil da Pizzaria
 * (nome público, logo, sobre). Não existe rota separada de "perfil da empresa" — é o mesmo domínio de
 * identidades, e quem pode operar aquela identidade já foi decidido por `exigirIdentidadeAtuante`.
 */

function responder(resposta: FastifyReply, status: number, erro: ErroApi) {
  return resposta.code(status).send(erro);
}

export function registrarRotasPerfil(
  servidor: FastifyInstance,
  dependencias: { banco: Banco; autenticacao: Autenticacao; armazenamento: ArmazenamentoDeArquivos },
) {
  const preHandler = exigirIdentidadeAtuante(dependencias);
  const { banco, armazenamento } = dependencias;

  const urlDaFoto = (chave: string | null) => (chave ? armazenamento.urlPublica(chave) : null);

  function meuPerfil(perfil: PerfilRegistro): MeuPerfil {
    return {
      identidadeId: perfil.identidadeId,
      tipo: perfil.tipo,
      nomeExibicao: perfil.nomeExibicao,
      nomeUsuario: perfil.nomeUsuario,
      fotoUrl: urlDaFoto(perfil.fotoChave),
      fraseStatus: perfil.fraseStatus,
      cidade: perfil.cidade,
      sobre: perfil.sobre,
      status: perfil.preferencias.statusEscolhido,
      statusEscolhido: perfil.preferencias.statusEscolhido,
      privacidade: {
        buscavelPorTelefone: perfil.preferencias.buscavelPorTelefone,
        visibilidadeFoto: perfil.preferencias.visibilidadeFoto,
        visibilidadeStatus: perfil.preferencias.visibilidadeStatus,
        visibilidadePresenca: perfil.preferencias.visibilidadePresenca,
      },
    };
  }

  servidor.get("/perfil", { preHandler }, async (requisicao, resposta) => {
    const { identidadeId } = obterIdentidadeExigida(requisicao);
    const perfil = await buscarPerfil(banco, identidadeId);
    if (!perfil) return responder(resposta, 404, { codigo: "IDENTIDADE_NAO_ENCONTRADA", mensagem: "Identidade não encontrada." });
    return meuPerfil(perfil);
  });

  servidor.patch("/perfil", { preHandler }, async (requisicao, resposta) => {
    const { identidadeId } = obterIdentidadeExigida(requisicao);
    const entrada = atualizarPerfilEntradaSchema.safeParse(requisicao.body);
    if (!entrada.success) {
      return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: entrada.error.issues[0]?.message ?? "Dados inválidos." });
    }

    await atualizarPerfil(banco, identidadeId, entrada.data);
    const perfil = await buscarPerfil(banco, identidadeId);
    if (!perfil) return responder(resposta, 404, { codigo: "IDENTIDADE_NAO_ENCONTRADA", mensagem: "Identidade não encontrada." });
    return meuPerfil(perfil);
  });

  /** Status ESCOLHIDO e visibilidade. Nada aqui muda quem pode conversar — só o que aparece. */
  servidor.patch("/perfil/privacidade", { preHandler }, async (requisicao, resposta) => {
    const { identidadeId } = obterIdentidadeExigida(requisicao);
    const entrada = atualizarPrivacidadeEntradaSchema.safeParse(requisicao.body);
    if (!entrada.success) {
      return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: entrada.error.issues[0]?.message ?? "Dados inválidos." });
    }

    await atualizarPreferencias(banco, identidadeId, entrada.data);
    const perfil = await buscarPerfil(banco, identidadeId);
    if (!perfil) return responder(resposta, 404, { codigo: "IDENTIDADE_NAO_ENCONTRADA", mensagem: "Identidade não encontrada." });
    return meuPerfil(perfil);
  });

  /**
   * FOTO da identidade atuante (avatar da pessoa ou logo da empresa — mesma rota, mesmo domínio).
   * Os bytes passam pelo pipeline: o tipo é conferido nos bytes, o EXIF (com geolocalização!) é
   * descartado e a imagem é redimensionada antes de sair do servidor.
   */
  servidor.post("/perfil/foto", { preHandler }, async (requisicao, resposta) => {
    const { identidadeId } = obterIdentidadeExigida(requisicao);
    const perfil = await buscarPerfil(banco, identidadeId);
    if (!perfil) return responder(resposta, 404, { codigo: "IDENTIDADE_NAO_ENCONTRADA", mensagem: "Identidade não encontrada." });

    const arquivo = await requisicao.file();
    if (!arquivo) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Envie uma imagem." });

    const tipoAnexo = perfil.tipo === "empresarial" ? "logo-empresa" : "avatar";
    try {
      const bytes = await arquivo.toBuffer();
      const imagem = await processarImagem(bytes, tipoAnexo, arquivo.mimetype);
      const chave = montarChave(tipoAnexo, identidadeId);
      await armazenamento.salvar({ chave, conteudo: imagem.conteudo, tipoConteudo: imagem.tipoConteudo });

      const anterior = await definirFotoChave(banco, identidadeId, chave);
      // A imagem antiga vira lixo assim que a nova é gravada; falhar aqui não pode derrubar a troca.
      if (anterior && anterior !== chave) await armazenamento.remover(anterior).catch(() => undefined);

      return { chave, url: armazenamento.urlPublica(chave) };
    } catch (erro) {
      if (erro instanceof ImagemInvalidaErro) return responder(resposta, 400, { codigo: "ARQUIVO_INVALIDO", mensagem: erro.message });
      if (erro instanceof ArmazenamentoNaoConfiguradoErro) {
        return responder(resposta, 503, { codigo: "ARMAZENAMENTO_INDISPONIVEL", mensagem: "O envio de imagens ainda não está configurado neste ambiente." });
      }
      throw erro;
    }
  });

  servidor.delete("/perfil/foto", { preHandler }, async (requisicao) => {
    const { identidadeId } = obterIdentidadeExigida(requisicao);
    const anterior = await definirFotoChave(banco, identidadeId, null);
    if (anterior) await armazenamento.remover(anterior).catch(() => undefined);
    return { removida: anterior !== null };
  });

  servidor.get("/perfil/excecoes", { preHandler }, async (requisicao) => {
    const { identidadeId } = obterIdentidadeExigida(requisicao);
    const lista: ListaExcecoesPrivacidade = { excecoes: await listarExcecoes(banco, identidadeId) };
    return lista;
  });

  servidor.put("/perfil/excecoes", { preHandler }, async (requisicao, resposta) => {
    const { identidadeId } = obterIdentidadeExigida(requisicao);
    const entrada = salvarExcecaoPrivacidadeEntradaSchema.safeParse(requisicao.body);
    if (!entrada.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Informe a identidade e a decisão." });
    if (entrada.data.identidadeId === identidadeId) {
      return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Você não pode criar uma exceção para si mesmo." });
    }

    const alvo = await buscarPerfil(banco, entrada.data.identidadeId);
    if (!alvo) return responder(resposta, 404, { codigo: "IDENTIDADE_NAO_ENCONTRADA", mensagem: "Identidade não encontrada." });

    await salvarExcecao(banco, identidadeId, entrada.data.identidadeId, entrada.data.decisao);
    return { salva: true };
  });

  servidor.delete("/perfil/excecoes/:identidadeId", { preHandler }, async (requisicao, resposta) => {
    const { identidadeId } = obterIdentidadeExigida(requisicao);
    const parametros = z.object({ identidadeId: z.uuid() }).safeParse(requisicao.params);
    if (!parametros.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Exceção inválida." });

    const removida = await removerExcecao(banco, identidadeId, parametros.data.identidadeId);
    if (!removida) return responder(resposta, 404, { codigo: "IDENTIDADE_NAO_ENCONTRADA", mensagem: "Exceção não encontrada." });
    return { removida: true };
  });

  /**
   * PERFIL DE OUTRA IDENTIDADE, filtrado pela privacidade DELA. O que ela esconde chega como `null`:
   * quem olha não distingue "não preencheu" de "não mostra para você", e isso é proposital.
   */
  servidor.get("/identidades/:identidadeId/perfil", { preHandler }, async (requisicao, resposta) => {
    const { identidadeId: observador } = obterIdentidadeExigida(requisicao);
    const parametros = z.object({ identidadeId: z.uuid() }).safeParse(requisicao.params);
    if (!parametros.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Identidade inválida." });

    const alvo = await buscarPerfil(banco, parametros.data.identidadeId);
    if (!alvo) return responder(resposta, 404, { codigo: "IDENTIDADE_NAO_ENCONTRADA", mensagem: "Identidade não encontrada." });

    // O próprio perfil nunca é filtrado por privacidade.
    const ehEuMesmo = alvo.identidadeId === observador;
    const [ehContato, excecao] = ehEuMesmo ? [true, null] : await Promise.all([ehContatoDe(banco, alvo.identidadeId, observador), buscarExcecao(banco, alvo.identidadeId, observador)]);

    const mostrarFoto = ehEuMesmo || podeVer({ visibilidade: alvo.preferencias.visibilidadeFoto, ehContato, excecao });
    const mostrarStatus = ehEuMesmo || podeVer({ visibilidade: alvo.preferencias.visibilidadeStatus, ehContato, excecao });
    // Invisível nunca vaza para terceiros: para eles a identidade só aparece sem status.
    const statusVisivel = alvo.preferencias.statusEscolhido === "invisivel" && !ehEuMesmo ? null : alvo.preferencias.statusEscolhido;

    const perfil: PerfilPublico = {
      identidadeId: alvo.identidadeId,
      tipo: alvo.tipo,
      nomeExibicao: alvo.nomeExibicao,
      nomeUsuario: alvo.nomeUsuario,
      fotoUrl: mostrarFoto ? urlDaFoto(alvo.fotoChave) : null,
      fraseStatus: mostrarStatus ? alvo.fraseStatus : null,
      cidade: alvo.cidade,
      sobre: alvo.sobre,
      status: mostrarStatus ? statusVisivel : null,
      ehContato: ehEuMesmo ? false : await ehContatoDe(banco, observador, alvo.identidadeId),
    };
    return perfil;
  });
}
