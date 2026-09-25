import type { Banco } from "@jaa/banco";
import {
  atualizarEnderecoEntradaSchema,
  type CoberturaEntrega,
  type EnderecoDoCep,
  confirmarLocalizacaoEntradaSchema,
  criarEnderecoEntradaSchema,
  salvarEnderecoParaEmpresaEntradaSchema,
  type ErroApi,
  type ListaEnderecos,
  type SugestaoLocalizacao,
} from "@jaa/contratos";
import type { FastifyInstance, FastifyReply } from "fastify";
import * as z from "zod";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import { criarConsultaViaCep, type ConsultaCep } from "../lib/consulta-cep.js";
import {
  exigirIdentidadeAtuante,
  obterIdentidadeExigida,
} from "../../autenticacao/lib/exigir-identidade-autenticada.js";
import {
  arquivarEnderecoDoCliente,
  cadastrarEndereco,
  cadastrarEnderecoComLocalizacao,
  confirmarPontoDeEntrega,
  editarEndereco,
  editarEnderecoComLocalizacao,
  listarEnderecosDoCliente,
  obterEnderecoDoCliente,
} from "../casos-de-uso/administrar-enderecos.js";
import type { GeocodificadorEndereco } from "../lib/geocodificador.js";
import { serializarEndereco } from "../lib/serializar-endereco.js";
import { buscarEmpresaPublicaPorIdentidade } from "../../catalogo/repositorios/repositorio-empresas-publicas.js";
import { avaliarCoberturaDoPonto } from "../../entregas/casos-de-uso/gerir-zonas.js";

const parametrosEnderecoSchema = z.object({ enderecoId: z.uuid() });
const parametrosEmpresaPublicaSchema = z.object({
  empresaIdentidadeId: z.uuid(),
});
const parametrosEnderecoEmpresaSchema = parametrosEnderecoSchema.extend({
  empresaIdentidadeId: z.uuid(),
});

function responder(resposta: FastifyReply, status: number, erro: ErroApi) {
  return resposta.code(status).send(erro);
}

const NAO_ENCONTRADO: ErroApi = {
  codigo: "ENDERECO_NAO_ENCONTRADO",
  mensagem: "Endereço não encontrado.",
};

/**
 * AGENDA DE ENDEREÇOS do cliente — privada. Só a própria identidade PESSOAL lista, cadastra, edita,
 * arquiva e confirma o ponto; identidade empresarial não cadastra endereço de consumidor por aqui.
 * A empresa nunca acessa estas rotas: o que ela vê é o snapshot do endereço no Pedido.
 */
export function registrarRotasEnderecos(
  servidor: FastifyInstance,
  dependencias: {
    banco: Banco;
    autenticacao: Autenticacao;
    geocodificador: GeocodificadorEndereco;
    consultaCep?: ConsultaCep;
  },
) {
  const preHandler = exigirIdentidadeAtuante(dependencias);
  const { banco, geocodificador } = dependencias;
  // Sem provedor injetado, usa o ViaCEP (público, sem chave); os testes injetam um falso.
  const consultaCep = dependencias.consultaCep ?? criarConsultaViaCep();

  // Endereço é do consumidor: quem age como empresa não tem agenda de endereços.
  function identidadePessoal(
    requisicao: Parameters<typeof obterIdentidadeExigida>[0],
    resposta: FastifyReply,
  ) {
    const contexto = obterIdentidadeExigida(requisicao);
    if (contexto.tipoIdentidade !== "pessoal") {
      responder(resposta, 403, {
        codigo: "IDENTIDADE_NAO_AUTORIZADA",
        mensagem: "Endereços pertencem à sua identidade pessoal.",
      });
      return null;
    }
    return contexto.identidadeId;
  }

  /**
   * CONSULTA DE CEP: preenche o formulário (logradouro, bairro, cidade, UF). NÃO confirma ponto
   * geográfico — o ponto continua sendo a ação explícita no mapa.
   */
  servidor.get(
    "/enderecos/cep/:cep",
    { preHandler },
    async (requisicao, resposta) => {
      const parametros = z
        .object({ cep: z.string().min(8).max(9) })
        .safeParse(requisicao.params);
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "CEP inválido.",
        });

      const resultado = await consultaCep.consultar(parametros.data.cep);
      if (resultado.tipo === "indisponivel") {
        return responder(resposta, 503, {
          codigo: "CEP_INDISPONIVEL",
          mensagem:
            "Não foi possível consultar o CEP agora. Preencha o endereço manualmente.",
        });
      }
      if (resultado.tipo === "nao-encontrado") {
        return responder(resposta, 404, {
          codigo: "CEP_NAO_ENCONTRADO",
          mensagem:
            "CEP não encontrado. Confira o número ou preencha manualmente.",
        });
      }
      const endereco: EnderecoDoCep = {
        ...resultado.endereco,
        encontrado: true,
      };
      return endereco;
    },
  );

  servidor.get("/enderecos", { preHandler }, async (requisicao, resposta) => {
    const identidadeId = identidadePessoal(requisicao, resposta);
    if (!identidadeId) return resposta;

    const lista: ListaEnderecos = {
      enderecos: (await listarEnderecosDoCliente(banco, identidadeId)).map(
        serializarEndereco,
      ),
    };
    return lista;
  });

  servidor.post("/enderecos", { preHandler }, async (requisicao, resposta) => {
    const identidadeId = identidadePessoal(requisicao, resposta);
    if (!identidadeId) return resposta;

    const entrada = criarEnderecoEntradaSchema.safeParse(requisicao.body);
    if (!entrada.success)
      return responder(resposta, 400, {
        codigo: "DADOS_INVALIDOS",
        mensagem: entrada.error.issues[0]?.message ?? "Endereço inválido.",
      });

    const resultado = await cadastrarEndereco(
      banco,
      identidadeId,
      entrada.data,
    );
    if (resultado.tipo === "limite-de-enderecos")
      return responder(resposta, 400, {
        codigo: "DADOS_INVALIDOS",
        mensagem: "Você atingiu o limite de endereços salvos.",
      });
    if (resultado.tipo !== "ok")
      return responder(resposta, 404, NAO_ENCONTRADO);
    return resposta.code(201).send(serializarEndereco(resultado.dados));
  });

  servidor.get(
    "/enderecos/:enderecoId",
    { preHandler },
    async (requisicao, resposta) => {
      const identidadeId = identidadePessoal(requisicao, resposta);
      if (!identidadeId) return resposta;

      const parametros = parametrosEnderecoSchema.safeParse(requisicao.params);
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Endereço inválido.",
        });

      const resultado = await obterEnderecoDoCliente(
        banco,
        identidadeId,
        parametros.data.enderecoId,
      );
      if (resultado.tipo !== "ok")
        return responder(resposta, 404, NAO_ENCONTRADO);
      return serializarEndereco(resultado.dados);
    },
  );

  servidor.patch(
    "/enderecos/:enderecoId",
    { preHandler },
    async (requisicao, resposta) => {
      const identidadeId = identidadePessoal(requisicao, resposta);
      if (!identidadeId) return resposta;

      const parametros = parametrosEnderecoSchema.safeParse(requisicao.params);
      const entrada = atualizarEnderecoEntradaSchema.safeParse(requisicao.body);
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Endereço inválido.",
        });
      if (!entrada.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: entrada.error.issues[0]?.message ?? "Endereço inválido.",
        });

      const resultado = await editarEndereco(
        banco,
        identidadeId,
        parametros.data.enderecoId,
        entrada.data,
      );
      if (resultado.tipo !== "ok")
        return responder(resposta, 404, NAO_ENCONTRADO);
      return serializarEndereco(resultado.dados);
    },
  );

  servidor.delete(
    "/enderecos/:enderecoId",
    { preHandler },
    async (requisicao, resposta) => {
      const identidadeId = identidadePessoal(requisicao, resposta);
      if (!identidadeId) return resposta;

      const parametros = parametrosEnderecoSchema.safeParse(requisicao.params);
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Endereço inválido.",
        });

      const resultado = await arquivarEnderecoDoCliente(
        banco,
        identidadeId,
        parametros.data.enderecoId,
      );
      if (resultado.tipo !== "ok")
        return responder(resposta, 404, NAO_ENCONTRADO);
      return resposta.code(204).send();
    },
  );

  /**
   * CONFIRMAÇÃO EXPLÍCITA do ponto de entrega (e reajuste do pin depois). Só aqui nascem latitude,
   * longitude e `localizacaoConfirmadaEm`. Abrir o mapa ou geocodificar não confirma nada, e o texto
   * do endereço continua exatamente como o cliente cadastrou.
   */
  servidor.post(
    "/enderecos/:enderecoId/localizacao",
    { preHandler },
    async (requisicao, resposta) => {
      const identidadeId = identidadePessoal(requisicao, resposta);
      if (!identidadeId) return resposta;

      const parametros = parametrosEnderecoSchema.safeParse(requisicao.params);
      const entrada = confirmarLocalizacaoEntradaSchema.safeParse(
        requisicao.body,
      );
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Endereço inválido.",
        });
      if (!entrada.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Coordenadas inválidas.",
        });

      const resultado = await confirmarPontoDeEntrega(
        banco,
        identidadeId,
        parametros.data.enderecoId,
        entrada.data,
      );
      if (resultado.tipo !== "ok")
        return responder(resposta, 404, NAO_ENCONTRADO);
      return serializarEndereco(resultado.dados);
    },
  );

  /** Pré-validação: não grava e usa a mesma classificação de zonas da logística. */
  servidor.post(
    "/empresas/:empresaIdentidadeId/cobertura-entrega",
    { preHandler },
    async (requisicao, resposta) => {
      const identidadeId = identidadePessoal(requisicao, resposta);
      if (!identidadeId) return resposta;
      const parametros = parametrosEmpresaPublicaSchema.safeParse(
        requisicao.params,
      );
      const entrada = confirmarLocalizacaoEntradaSchema.safeParse(
        requisicao.body,
      );
      if (!parametros.success || !entrada.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Empresa ou coordenadas inválidas.",
        });
      const empresa = await buscarEmpresaPublicaPorIdentidade(
        banco,
        parametros.data.empresaIdentidadeId,
      );
      if (!empresa)
        return responder(resposta, 404, {
          codigo: "EMPRESA_NAO_ENCONTRADA",
          mensagem: "Empresa não encontrada.",
        });
      const cobertura: CoberturaEntrega = await avaliarCoberturaDoPonto(
        banco,
        empresa.empresaId,
        entrada.data,
      );
      return cobertura;
    },
  );

  /** Geocodifica o rascunho sem persistir; o cliente ainda confirma ou ajusta o ponto no mapa. */
  servidor.post(
    "/empresas/:empresaIdentidadeId/enderecos/sugestao-localizacao",
    { preHandler },
    async (requisicao, resposta) => {
      const identidadeId = identidadePessoal(requisicao, resposta);
      if (!identidadeId) return resposta;
      const parametros = parametrosEmpresaPublicaSchema.safeParse(
        requisicao.params,
      );
      const entrada = criarEnderecoEntradaSchema.safeParse(requisicao.body);
      if (!parametros.success || !entrada.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: entrada.success
            ? "Empresa inválida."
            : (entrada.error.issues[0]?.message ?? "Endereço inválido."),
        });
      const empresa = await buscarEmpresaPublicaPorIdentidade(
        banco,
        parametros.data.empresaIdentidadeId,
      );
      if (!empresa)
        return responder(resposta, 404, {
          codigo: "EMPRESA_NAO_ENCONTRADA",
          mensagem: "Empresa não encontrada.",
        });
      const sugestao: SugestaoLocalizacao = {
        disponivel: geocodificador.disponivel,
        coordenadas: geocodificador.disponivel
          ? await geocodificador.sugerir(entrada.data)
          : null,
      };
      return sugestao;
    },
  );

  /** Texto e ponto do rascunho só são gravados depois da cobertura aprovada. */
  servidor.post(
    "/empresas/:empresaIdentidadeId/enderecos",
    { preHandler },
    async (requisicao, resposta) => {
      const identidadeId = identidadePessoal(requisicao, resposta);
      if (!identidadeId) return resposta;
      const parametros = parametrosEmpresaPublicaSchema.safeParse(
        requisicao.params,
      );
      const entrada = salvarEnderecoParaEmpresaEntradaSchema.safeParse(
        requisicao.body,
      );
      if (!parametros.success || !entrada.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Endereço ou coordenadas inválidas.",
        });
      const empresa = await buscarEmpresaPublicaPorIdentidade(
        banco,
        parametros.data.empresaIdentidadeId,
      );
      if (!empresa)
        return responder(resposta, 404, {
          codigo: "EMPRESA_NAO_ENCONTRADA",
          mensagem: "Empresa não encontrada.",
        });
      const cobertura = await avaliarCoberturaDoPonto(
        banco,
        empresa.empresaId,
        entrada.data.coordenadas,
      );
      if (!cobertura.atendida)
        return responder(resposta, 409, {
          codigo: "ENDERECO_FORA_AREA_ENTREGA",
          mensagem: "Esta empresa ainda não realiza entregas neste endereço.",
        });
      const resultado = await cadastrarEnderecoComLocalizacao(
        banco,
        identidadeId,
        entrada.data.endereco,
        entrada.data.coordenadas,
      );
      if (resultado.tipo === "limite-de-enderecos")
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Você atingiu o limite de endereços salvos.",
        });
      if (resultado.tipo !== "ok")
        return responder(resposta, 404, NAO_ENCONTRADO);
      return resposta.code(201).send(serializarEndereco(resultado.dados));
    },
  );

  servidor.patch(
    "/enderecos/:enderecoId/empresas/:empresaIdentidadeId",
    { preHandler },
    async (requisicao, resposta) => {
      const identidadeId = identidadePessoal(requisicao, resposta);
      if (!identidadeId) return resposta;
      const parametros = parametrosEnderecoEmpresaSchema.safeParse(
        requisicao.params,
      );
      const entrada = salvarEnderecoParaEmpresaEntradaSchema.safeParse(
        requisicao.body,
      );
      if (!parametros.success || !entrada.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Endereço ou coordenadas inválidas.",
        });
      const empresa = await buscarEmpresaPublicaPorIdentidade(
        banco,
        parametros.data.empresaIdentidadeId,
      );
      if (!empresa)
        return responder(resposta, 404, {
          codigo: "EMPRESA_NAO_ENCONTRADA",
          mensagem: "Empresa não encontrada.",
        });
      const cobertura = await avaliarCoberturaDoPonto(
        banco,
        empresa.empresaId,
        entrada.data.coordenadas,
      );
      if (!cobertura.atendida)
        return responder(resposta, 409, {
          codigo: "ENDERECO_FORA_AREA_ENTREGA",
          mensagem: "Esta empresa ainda não realiza entregas neste endereço.",
        });
      const resultado = await editarEnderecoComLocalizacao(
        banco,
        identidadeId,
        parametros.data.enderecoId,
        entrada.data.endereco,
        entrada.data.coordenadas,
      );
      if (resultado.tipo !== "ok")
        return responder(resposta, 404, NAO_ENCONTRADO);
      return serializarEndereco(resultado.dados);
    },
  );

  /** Confirma o ponto no carrinho somente quando a empresa atende a coordenada. */
  servidor.post(
    "/enderecos/:enderecoId/localizacao/empresas/:empresaIdentidadeId",
    { preHandler },
    async (requisicao, resposta) => {
      const identidadeId = identidadePessoal(requisicao, resposta);
      if (!identidadeId) return resposta;
      const parametros = parametrosEnderecoEmpresaSchema.safeParse(
        requisicao.params,
      );
      const entrada = confirmarLocalizacaoEntradaSchema.safeParse(
        requisicao.body,
      );
      if (!parametros.success || !entrada.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Endereço, empresa ou coordenadas inválidas.",
        });
      const empresa = await buscarEmpresaPublicaPorIdentidade(
        banco,
        parametros.data.empresaIdentidadeId,
      );
      if (!empresa)
        return responder(resposta, 404, {
          codigo: "EMPRESA_NAO_ENCONTRADA",
          mensagem: "Empresa não encontrada.",
        });
      const cobertura = await avaliarCoberturaDoPonto(
        banco,
        empresa.empresaId,
        entrada.data,
      );
      if (!cobertura.atendida)
        return responder(resposta, 409, {
          codigo: "ENDERECO_FORA_AREA_ENTREGA",
          mensagem: "Esta empresa ainda não realiza entregas neste endereço.",
        });
      const resultado = await confirmarPontoDeEntrega(
        banco,
        identidadeId,
        parametros.data.enderecoId,
        entrada.data,
      );
      if (resultado.tipo !== "ok")
        return responder(resposta, 404, NAO_ENCONTRADO);
      return serializarEndereco(resultado.dados);
    },
  );

  // Palpite para ABRIR o mapa perto do lugar provável. Nunca vira confirmação nem corrige o texto.
  servidor.get(
    "/enderecos/:enderecoId/sugestao-localizacao",
    { preHandler },
    async (requisicao, resposta) => {
      const identidadeId = identidadePessoal(requisicao, resposta);
      if (!identidadeId) return resposta;

      const parametros = parametrosEnderecoSchema.safeParse(requisicao.params);
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Endereço inválido.",
        });

      const resultado = await obterEnderecoDoCliente(
        banco,
        identidadeId,
        parametros.data.enderecoId,
      );
      if (resultado.tipo !== "ok")
        return responder(resposta, 404, NAO_ENCONTRADO);

      const sugestao: SugestaoLocalizacao = {
        disponivel: geocodificador.disponivel,
        coordenadas: geocodificador.disponivel
          ? await geocodificador.sugerir(resultado.dados)
          : null,
      };
      return sugestao;
    },
  );
}
