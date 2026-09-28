import type { Banco } from "@jaa/banco";
import {
  catalogoServicosSchema,
  listaMunicipiosSchema,
  type CodigoErroApi,
  type ErroApi,
  type RespostaPerfilProfissional,
  type SugestaoLocalizacao,
} from "@jaa/contratos";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import * as z from "zod";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import { exigirIdentidadeAtuante, obterIdentidadeExigida } from "../../autenticacao/lib/exigir-identidade-autenticada.js";
import type { GeocodificadorEndereco } from "../../enderecos/lib/geocodificador.js";
import {
  adicionarAreaAtuacao,
  adicionarServicoAoPerfil,
  ativarPerfilProfissional,
  atualizarDetalhesServicoDoPerfil,
  confirmarPontoBaseProfissional,
  definirConfiguracaoServico,
  definirHorariosAtendimentoServico,
  definirPreferenciasPerfil,
  desativarPerfilProfissional,
  editarAreaAtuacao,
  obterOuCriarPerfilProfissional,
  removerAreaAtuacao,
  removerServicoDoPerfilProfissional,
  salvarBaseProfissional,
} from "../casos-de-uso/gerir-perfil-profissional.js";
import { montarPerfilDoDono } from "../lib/serializar-perfil-dono.js";
import { buscarBase, buscarMunicipiosPorNome, buscarPerfilPorIdentidade } from "../repositorios/repositorio-perfis-profissionais.js";
import { listarCatalogoServicos } from "../repositorios/repositorio-taxonomia.js";

/*
 * PERFIL PROFISSIONAL — rotas do PRÓPRIO profissional. Toda rota age sobre o perfil da identidade
 * PESSOAL da sessão: não existe parâmetro de usuário/perfil/identidade vindo do cliente. Ids de
 * atividade/área na URL são sempre procurados DENTRO desse perfil (de outro perfil = 404).
 * Toda mutação devolve o perfil atualizado (visão privada do dono).
 */

// Resultado de caso de uso que é ERRO → resposta HTTP. O que não está aqui é sucesso.
const ERROS: Record<string, { status: number; codigo: CodigoErroApi; mensagem: string }> = {
  "perfil-nao-encontrado": { status: 404, codigo: "PERFIL_PROFISSIONAL_NAO_ENCONTRADO", mensagem: "Ative seu perfil profissional primeiro." },
  "identidade-nao-pessoal": { status: 403, codigo: "IDENTIDADE_NAO_AUTORIZADA", mensagem: "O perfil profissional é da sua conta pessoal." },
  "limite-servicos": { status: 409, codigo: "LIMITE_DE_ATIVIDADES_ATINGIDO", mensagem: "Máximo de 3 atividades." },
  "servico-nao-encontrado": { status: 404, codigo: "ATIVIDADE_NAO_ENCONTRADA", mensagem: "Atividade não encontrada." },
  // Atividade de outro perfil é indistinguível de inexistente.
  "servico-de-outro-perfil": { status: 404, codigo: "ATIVIDADE_NAO_ENCONTRADA", mensagem: "Atividade não encontrada." },
  "servico-duplicado": { status: 409, codigo: "ATIVIDADE_DUPLICADA", mensagem: "Essa atividade já está no seu perfil." },
  "especialidade-invalida": { status: 400, codigo: "ESCOLHAS_INVALIDAS", mensagem: "Especialidade não pertence a esta atividade." },
  "opcao-invalida": { status: 400, codigo: "ESCOLHAS_INVALIDAS", mensagem: "Opção não pertence a esta atividade." },
  "selecao-unica-violada": { status: 400, codigo: "ESCOLHAS_INVALIDAS", mensagem: "Escolha só uma opção nesse item." },
  "limite-areas": { status: 409, codigo: "LIMITE_DE_AREAS_ATINGIDO", mensagem: "Máximo de 5 áreas ativas." },
  "base-sem-ponto": { status: 409, codigo: "BASE_PROFISSIONAL_SEM_PONTO", mensagem: "Confirme sua base no mapa antes." },
  "base-nao-cadastrada": { status: 409, codigo: "BASE_PROFISSIONAL_SEM_PONTO", mensagem: "Cadastre o endereço da base antes." },
  // O ponto veio de um endereço que já mudou: nunca vira confirmação do endereço atual.
  "base-alterada": { status: 409, codigo: "BASE_PROFISSIONAL_ALTERADA", mensagem: "O endereço mudou. Confira o ponto no mapa de novo." },
  "geometria-invalida": { status: 400, codigo: "DADOS_INVALIDOS", mensagem: "Desenho da área inválido." },
  "municipio-nao-encontrado": { status: 404, codigo: "MUNICIPIO_NAO_ENCONTRADO", mensagem: "Município não encontrado." },
  "area-nao-encontrada": { status: 404, codigo: "AREA_NAO_ENCONTRADA", mensagem: "Área não encontrada." },
};

const ROTULO_PENDENCIA: Record<string, string> = { base: "base", atividade: "atividade", area: "área de atuação" };

const parametrosAtividade = z.object({ atividadeId: z.uuid() });
const parametrosArea = z.object({ areaId: z.uuid() });

function responder(resposta: FastifyReply, status: number, erro: ErroApi) {
  return resposta.code(status).send(erro);
}

export function registrarRotasPerfilProfissional(
  servidor: FastifyInstance,
  dependencias: { banco: Banco; autenticacao: Autenticacao; geocodificador: GeocodificadorEndereco },
) {
  const preHandler = exigirIdentidadeAtuante(dependencias);
  const { banco, geocodificador } = dependencias;

  // Perfil profissional é da PESSOA: agindo como empresa, nada disto se aplica.
  function identidadePessoal(requisicao: FastifyRequest, resposta: FastifyReply): string | null {
    const contexto = obterIdentidadeExigida(requisicao);
    if (contexto.tipoIdentidade !== "pessoal") {
      responder(resposta, 403, { codigo: "IDENTIDADE_NAO_AUTORIZADA", mensagem: "O perfil profissional é da sua conta pessoal." });
      return null;
    }
    return contexto.identidadeId;
  }

  async function perfilAtual(identidadeId: string): Promise<RespostaPerfilProfissional> {
    return { perfil: await montarPerfilDoDono(banco, identidadeId) };
  }

  // Erro conhecido → resposta de erro; sucesso → perfil atualizado.
  async function concluir(resposta: FastifyReply, identidadeId: string, resultado: { tipo: string; mensagem?: string; pendencias?: string[] }) {
    if (resultado.tipo === "dados-invalidos") return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: resultado.mensagem ?? "Dados inválidos." });
    if (resultado.tipo === "requisitos-pendentes") {
      const falta = (resultado.pendencias ?? []).map((pendencia) => ROTULO_PENDENCIA[pendencia] ?? pendencia).join(", ");
      return responder(resposta, 409, { codigo: "PERFIL_PROFISSIONAL_INCOMPLETO", mensagem: `Falta: ${falta}.` });
    }
    const erro = ERROS[resultado.tipo];
    if (erro) return responder(resposta, erro.status, { codigo: erro.codigo, mensagem: erro.mensagem });
    return perfilAtual(identidadeId);
  }

  function parametros<T>(schema: z.ZodType<T>, requisicao: FastifyRequest, resposta: FastifyReply, erro: keyof typeof ERROS): T | null {
    const lidos = schema.safeParse(requisicao.params);
    if (lidos.success) return lidos.data;
    const conhecido = ERROS[erro];
    if (conhecido) responder(resposta, conhecido.status, { codigo: conhecido.codigo, mensagem: conhecido.mensagem });
    return null;
  }

  /* ---------- Catálogo e municípios (dados de apoio, sem nada privado) ---------- */

  servidor.get("/profissional/catalogo", { preHandler }, async () => catalogoServicosSchema.parse(await listarCatalogoServicos(banco)));

  // Catálogo LOCAL de municípios (PostgreSQL); nenhum serviço externo é consultado.
  servidor.get("/profissional/municipios", { preHandler }, async (requisicao, resposta) => {
    const consulta = z.object({ busca: z.string().trim().min(2).max(80) }).safeParse(requisicao.query);
    if (!consulta.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Digite ao menos 2 letras." });
    return listaMunicipiosSchema.parse({ municipios: await buscarMunicipiosPorNome(banco, consulta.data.busca) });
  });

  /* ---------- Perfil ---------- */

  servidor.get("/profissional/perfil", { preHandler }, async (requisicao, resposta) => {
    const identidadeId = identidadePessoal(requisicao, resposta);
    if (!identidadeId) return resposta;
    return perfilAtual(identidadeId);
  });

  // "Ativar perfil": cria o perfil (idempotente). Ele só fica UTILIZÁVEL depois de configurado.
  servidor.post("/profissional/perfil", { preHandler }, async (requisicao, resposta) => {
    const identidadeId = identidadePessoal(requisicao, resposta);
    if (!identidadeId) return resposta;
    return concluir(resposta, identidadeId, await obterOuCriarPerfilProfissional(banco, identidadeId));
  });

  servidor.patch("/profissional/perfil/preferencias", { preHandler }, async (requisicao, resposta) => {
    const identidadeId = identidadePessoal(requisicao, resposta);
    if (!identidadeId) return resposta;
    return concluir(resposta, identidadeId, await definirPreferenciasPerfil(banco, identidadeId, requisicao.body));
  });

  servidor.post("/profissional/perfil/ativar", { preHandler }, async (requisicao, resposta) => {
    const identidadeId = identidadePessoal(requisicao, resposta);
    if (!identidadeId) return resposta;
    return concluir(resposta, identidadeId, await ativarPerfilProfissional(banco, identidadeId));
  });

  servidor.post("/profissional/perfil/desativar", { preHandler }, async (requisicao, resposta) => {
    const identidadeId = identidadePessoal(requisicao, resposta);
    if (!identidadeId) return resposta;
    return concluir(resposta, identidadeId, await desativarPerfilProfissional(banco, identidadeId));
  });

  /* ---------- Base ---------- */

  servidor.put("/profissional/perfil/base", { preHandler }, async (requisicao, resposta) => {
    const identidadeId = identidadePessoal(requisicao, resposta);
    if (!identidadeId) return resposta;
    return concluir(resposta, identidadeId, await salvarBaseProfissional(banco, identidadeId, requisicao.body));
  });

  // Palpite da geocodificação para ABRIR o mapa perto da base salva. Não confirma nada.
  servidor.post("/profissional/perfil/base/sugestao-localizacao", { preHandler }, async (requisicao, resposta) => {
    const identidadeId = identidadePessoal(requisicao, resposta);
    if (!identidadeId) return resposta;
    const perfil = await buscarPerfilPorIdentidade(banco, identidadeId);
    const base = perfil ? await buscarBase(banco, perfil.id) : null;
    if (!perfil || !base) return concluir(resposta, identidadeId, { tipo: perfil ? "base-nao-cadastrada" : "perfil-nao-encontrado" });
    const sugestao: SugestaoLocalizacao = {
      disponivel: geocodificador.disponivel,
      coordenadas: geocodificador.disponivel ? await geocodificador.sugerir(base) : null,
    };
    return sugestao;
  });

  servidor.put("/profissional/perfil/base/ponto", { preHandler }, async (requisicao, resposta) => {
    const identidadeId = identidadePessoal(requisicao, resposta);
    if (!identidadeId) return resposta;
    return concluir(resposta, identidadeId, await confirmarPontoBaseProfissional(banco, identidadeId, requisicao.body));
  });

  /* ---------- Atividades ---------- */

  servidor.post("/profissional/perfil/atividades", { preHandler }, async (requisicao, resposta) => {
    const identidadeId = identidadePessoal(requisicao, resposta);
    if (!identidadeId) return resposta;
    const resultado = await adicionarServicoAoPerfil(banco, identidadeId, requisicao.body);
    if (resultado.tipo === "adicionado") resposta.code(201);
    return concluir(resposta, identidadeId, resultado);
  });

  servidor.patch("/profissional/perfil/atividades/:atividadeId", { preHandler }, async (requisicao, resposta) => {
    const identidadeId = identidadePessoal(requisicao, resposta);
    const lidos = identidadeId && parametros(parametrosAtividade, requisicao, resposta, "servico-nao-encontrado");
    if (!identidadeId || !lidos) return resposta;
    return concluir(resposta, identidadeId, await atualizarDetalhesServicoDoPerfil(banco, identidadeId, lidos.atividadeId, requisicao.body));
  });

  servidor.delete("/profissional/perfil/atividades/:atividadeId", { preHandler }, async (requisicao, resposta) => {
    const identidadeId = identidadePessoal(requisicao, resposta);
    const lidos = identidadeId && parametros(parametrosAtividade, requisicao, resposta, "servico-nao-encontrado");
    if (!identidadeId || !lidos) return resposta;
    return concluir(resposta, identidadeId, await removerServicoDoPerfilProfissional(banco, identidadeId, lidos.atividadeId));
  });

  servidor.put("/profissional/perfil/atividades/:atividadeId/horarios", { preHandler }, async (requisicao, resposta) => {
    const identidadeId = identidadePessoal(requisicao, resposta);
    const lidos = identidadeId && parametros(parametrosAtividade, requisicao, resposta, "servico-nao-encontrado");
    if (!identidadeId || !lidos) return resposta;
    return concluir(resposta, identidadeId, await definirHorariosAtendimentoServico(banco, identidadeId, lidos.atividadeId, requisicao.body));
  });

  servidor.patch("/profissional/perfil/atividades/:atividadeId/configuracao", { preHandler }, async (requisicao, resposta) => {
    const identidadeId = identidadePessoal(requisicao, resposta);
    const lidos = identidadeId && parametros(parametrosAtividade, requisicao, resposta, "servico-nao-encontrado");
    if (!identidadeId || !lidos) return resposta;
    return concluir(resposta, identidadeId, await definirConfiguracaoServico(banco, identidadeId, lidos.atividadeId, requisicao.body));
  });

  /* ---------- Áreas ---------- */

  servidor.post("/profissional/perfil/areas", { preHandler }, async (requisicao, resposta) => {
    const identidadeId = identidadePessoal(requisicao, resposta);
    if (!identidadeId) return resposta;
    const resultado = await adicionarAreaAtuacao(banco, identidadeId, requisicao.body);
    if (resultado.tipo === "adicionada") resposta.code(201);
    return concluir(resposta, identidadeId, resultado);
  });

  servidor.patch("/profissional/perfil/areas/:areaId", { preHandler }, async (requisicao, resposta) => {
    const identidadeId = identidadePessoal(requisicao, resposta);
    const lidos = identidadeId && parametros(parametrosArea, requisicao, resposta, "area-nao-encontrada");
    if (!identidadeId || !lidos) return resposta;
    return concluir(resposta, identidadeId, await editarAreaAtuacao(banco, identidadeId, lidos.areaId, requisicao.body));
  });

  servidor.delete("/profissional/perfil/areas/:areaId", { preHandler }, async (requisicao, resposta) => {
    const identidadeId = identidadePessoal(requisicao, resposta);
    const lidos = identidadeId && parametros(parametrosArea, requisicao, resposta, "area-nao-encontrada");
    if (!identidadeId || !lidos) return resposta;
    return concluir(resposta, identidadeId, await removerAreaAtuacao(banco, identidadeId, lidos.areaId));
  });
}
