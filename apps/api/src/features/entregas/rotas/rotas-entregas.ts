import type { Banco } from "@jaa/banco";
import {
  alterarDisponibilidadeEntradaSchema,
  confirmarPontoBaseEntradaSchema,
  definirCompatibilidadesEntradaSchema,
  salvarConfiguracaoDespachoEntradaSchema,
  salvarZonaEntradaSchema,
  criarSaidaEntradaSchema,
  enviarLocalizacaoEntradaSchema,
  enviarPosicaoEntradaSchema,
  salvarBaseEntradaSchema,
  reordenarSequenciaEntradaSchema,
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
  type BaseEmpresa,
  type ListaSaidas,
  type ListaPosicoes,
  type ListaSituacoesOperacionais,
  type ListaZonas,
  type PosicaoEntregador,
  type PainelDespacho,
  type PainelOperacional,
  type ListaVinculosEntregador,
  type VinculoEntregador,
  type SugestaoLocalizacaoBase,
} from "@jaa/contratos";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import * as z from "zod";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import type { GeocodificadorEndereco } from "../../enderecos/lib/geocodificador.js";
import {
  exigirIdentidadeAutenticada,
  obterIdentidadeExigida,
} from "../../autenticacao/lib/exigir-identidade-autenticada.js";
import { serializarEmpresaPublica } from "../../catalogo/lib/serializar-catalogo.js";
import { buscarEmpresaPublicaPorId } from "../../catalogo/repositorios/repositorio-empresas-publicas.js";
import { autorizarEmpresa } from "../../empresas/lib/autorizacao-empresas.js";
import {
  atribuirEntregaAutorizada,
  listarMinhasEntregas,
  obterMinhaEntrega,
} from "../casos-de-uso/atribuir-entrega.js";
import {
  alterarMinhaDisponibilidade,
  alterarStatusEntregadorAutorizado,
  convidarEntregadorAutorizado,
  listarConvitesPendentes,
  listarEntregadoresAutorizado,
  listarMeusVinculos,
  responderConviteDaPessoa,
} from "../casos-de-uso/gerir-entregadores.js";
import {
  criarSaidaAutorizada,
  iniciarMinhaSaida,
  listarMinhasSaidas,
  listarSaidasAutorizado,
  obterMinhaSaida,
  obterSaidaDaEmpresaAutorizado,
  reordenarMinhaSaida,
  serializarSaidaComEmpresa,
} from "../casos-de-uso/gerir-saidas.js";
import {
  aoEntregadorEntrarNaFila,
  liberarSaidaManualmente,
  montarPainelDespacho,
  publicarDespacho,
  reconciliarDespacho,
} from "../casos-de-uso/despacho-automatico.js";
import {
  atualizarZonaAutorizada,
  criarZonaAutorizada,
  definirCompatibilidadesAutorizado,
  listarZonasAutorizado,
  obterConfiguracaoAutorizada,
  salvarConfiguracaoAutorizada,
} from "../casos-de-uso/gerir-zonas.js";
import {
  listarPosicoesAutorizadas,
  obterPosicaoAutorizada,
  registrarPosicaoDoEntregador,
} from "../casos-de-uso/rastrear-entrega.js";
import {
  confirmarPontoBaseAutorizado,
  listarMinhasSituacoes,
  montarSituacao,
  obterBaseAutorizada,
  obterPainelAutorizado,
  processarLocalizacao,
  reavaliarFila,
  salvarBaseAutorizada,
  serializarBase,
} from "../casos-de-uso/presenca-e-fila.js";
import type { CanalEventosEntregas } from "../lib/eventos-entregas.js";
import type { MotorDeRotas } from "../lib/motor-rotas.js";
import { publicarOperacao } from "../lib/publicar-operacao.js";
import { publicarSaida } from "../lib/publicar-saida.js";
import { publicarVinculoEntregador } from "../lib/publicar-vinculo.js";
import {
  buscarAtribuicaoAtual,
  buscarEmpresaDoPedido,
  listarHistoricoAtribuicoes,
} from "../repositorios/repositorio-atribuicoes.js";
import { buscarEntregadorDaEmpresa } from "../repositorios/repositorio-entregadores.js";
import { serializarEntregador } from "../lib/serializar-entrega.js";

const parametrosEmpresaSchema = z.object({ empresaId: z.uuid() });
const parametrosEntregadorSchema = z.object({
  empresaId: z.uuid(),
  entregadorId: z.uuid(),
});
const parametrosPedidoDaEmpresaSchema = z.object({
  empresaId: z.uuid(),
  pedidoId: z.uuid(),
});
const parametrosConviteSchema = z.object({ entregadorId: z.uuid() });
const parametrosEntregaSchema = z.object({ pedidoId: z.uuid() });
const parametrosSaidaSchema = z.object({ saidaId: z.uuid() });
const parametrosSaidaDaEmpresaSchema = z.object({
  empresaId: z.uuid(),
  saidaId: z.uuid(),
});
const parametrosZonaSchema = z.object({
  empresaId: z.uuid(),
  zonaId: z.uuid(),
});

function responder(resposta: FastifyReply, status: number, erro: ErroApi) {
  return resposta.code(status).send(erro);
}

const EMPRESA_NAO_ENCONTRADA: ErroApi = {
  codigo: "EMPRESA_NAO_ENCONTRADA",
  mensagem: "Empresa não encontrada.",
};
const ENTREGADOR_NAO_ENCONTRADO: ErroApi = {
  codigo: "ENTREGADOR_NAO_ENCONTRADO",
  mensagem: "Entregador não encontrado.",
};
const ENTREGA_NAO_ENCONTRADA: ErroApi = {
  codigo: "ENTREGA_NAO_ENCONTRADA",
  mensagem: "Entrega não encontrada.",
};
const SAIDA_NAO_ENCONTRADA: ErroApi = {
  codigo: "SAIDA_NAO_ENCONTRADA",
  mensagem: "Saída de entrega não encontrada.",
};
const ZONA_NAO_ENCONTRADA: ErroApi = {
  codigo: "ZONA_NAO_ENCONTRADA",
  mensagem: "Zona de entrega não encontrada.",
};

/**
 * ENTREGADORES e ENTREGAS. Dois lados bem separados:
 * - EMPRESA (permissão `gerenciar-entregadores`): quadro de entregadores e atribuição dos pedidos;
 * - PESSOA: seus convites e as entregas atribuídas a ela AGORA — nunca pedidos arbitrários.
 * Entregador não recebe nenhuma rota administrativa: não é membro nem opera a identidade da empresa.
 */
export function registrarRotasEntregas(
  servidor: FastifyInstance,
  dependencias: {
    banco: Banco;
    autenticacao: Autenticacao;
    eventosEntregas: CanalEventosEntregas;
    geocodificador: GeocodificadorEndereco;
    // Motor de rotas: usado só ao planejar a saída e ao recalcular a ordem do entregador.
    motorRotas?: MotorDeRotas | undefined;
    // Iniciar a saída avança os pedidos pela máquina de estados existente (nunca por atalho).
    avancarPedidoParaEntrega: (
      usuarioId: string,
      empresaId: string,
      pedidoId: string,
    ) => Promise<void>;
    // O mesmo avanço quando quem inicia é o ENTREGADOR da saída (autorizado pelo caso de uso da saída).
    avancarPedidoPeloEntregador: (
      usuarioId: string,
      empresaId: string,
      pedidoId: string,
    ) => Promise<void>;
  },
) {
  const preHandler = exigirIdentidadeAutenticada(dependencias);
  const { banco } = dependencias;

  servidor.get(
    "/empresas/:empresaId/entregadores",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Empresa inválida.",
        });

      const resultado = await listarEntregadoresAutorizado(
        banco,
        usuarioId,
        parametros.data.empresaId,
      );
      if (resultado.tipo !== "lista")
        return responder(resposta, 404, EMPRESA_NAO_ENCONTRADA);
      const lista: ListaEntregadores = {
        entregadores: resultado.entregadores.map(serializarEntregador),
      };
      return lista;
    },
  );

  servidor.post(
    "/empresas/:empresaId/entregadores",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
      const entrada = convidarEntregadorEntradaSchema.safeParse(
        requisicao.body,
      );
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Empresa inválida.",
        });
      if (!entrada.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Informe o @usuario da pessoa.",
        });

      const resultado = await convidarEntregadorAutorizado(
        banco,
        usuarioId,
        parametros.data.empresaId,
        entrada.data.nomeUsuario,
      );
      switch (resultado.tipo) {
        case "empresa-nao-encontrada":
          return responder(resposta, 404, EMPRESA_NAO_ENCONTRADA);
        case "pessoa-nao-encontrada":
          return responder(resposta, 404, {
            codigo: "IDENTIDADE_NAO_ENCONTRADA",
            mensagem: "Não encontramos esse @usuario.",
          });
        case "pessoa-e-operadora":
          return responder(resposta, 409, {
            codigo: "IDENTIDADE_NAO_AUTORIZADA",
            mensagem:
              "Quem opera a empresa não pode ser cadastrado como entregador.",
          });
        case "convidado":
          // O convite aparece NA HORA para quem foi convidado (antes só aparecia com F5).
          await publicarVinculoEntregador(dependencias, resultado.entregador);
          return resposta
            .code(201)
            .send(serializarEntregador(resultado.entregador));
      }
    },
  );

  servidor.patch(
    "/empresas/:empresaId/entregadores/:entregadorId",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosEntregadorSchema.safeParse(
        requisicao.params,
      );
      const entrada = alterarStatusEntregadorEntradaSchema.safeParse(
        requisicao.body,
      );
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Entregador inválido.",
        });
      if (!entrada.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Status inválido.",
        });

      const resultado = await alterarStatusEntregadorAutorizado(
        banco,
        usuarioId,
        parametros.data.empresaId,
        parametros.data.entregadorId,
        entrada.data.status,
      );
      if (resultado.tipo === "empresa-nao-encontrada")
        return responder(resposta, 404, EMPRESA_NAO_ENCONTRADA);
      if (resultado.tipo !== "alterado")
        return responder(resposta, 404, ENTREGADOR_NAO_ENCONTRADO);

      // A pessoa vê na hora que a empresa ativou/desativou o vínculo dela.
      await publicarVinculoEntregador(dependencias, resultado.entregador);

      // Vínculo desativado deixa de ser elegível: sai da fila da base na hora.
      const apos = await reavaliarFila(
        banco,
        parametros.data.entregadorId,
        "Vínculo desativado",
      );
      if (apos) {
        await publicarOperacao(dependencias, apos.registro);
        await aoEntregadorEntrarNaFila(dependencias, apos.registro);
      }

      // Revogação imediata: as entregas que ele tinha saem da lista dele agora (histórico preservado).
      for (const pedidoId of resultado.pedidosLiberados) {
        dependencias.eventosEntregas.publicar({
          tipo: "entrega-atualizada",
          destinatariosIdentidadeIds: [
            resultado.entregador.pessoa.identidadeId,
          ],
          pedidoId,
          entrega: null,
        });
      }
      return serializarEntregador(resultado.entregador);
    },
  );

  // Entregador atual + histórico de atribuições de um pedido (visão operacional da empresa).
  servidor.get(
    "/empresas/:empresaId/pedidos/:pedidoId/entrega",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosPedidoDaEmpresaSchema.safeParse(
        requisicao.params,
      );
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Pedido inválido.",
        });

      const acesso = await autorizarEmpresa(
        banco,
        usuarioId,
        parametros.data.empresaId,
        "ver-pedidos",
      );
      if (!acesso) return responder(resposta, 404, EMPRESA_NAO_ENCONTRADA);

      // O pedido precisa ser DESTA empresa: nada de espiar entrega alheia sabendo o id.
      const { empresaId, pedidoId } = parametros.data;
      if ((await buscarEmpresaDoPedido(banco, pedidoId)) !== empresaId) {
        return responder(resposta, 404, {
          codigo: "PEDIDO_NAO_ENCONTRADO",
          mensagem: "Pedido não encontrado.",
        });
      }

      const atual = await buscarAtribuicaoAtual(banco, pedidoId);
      const entrega: EntregaDoPedido = {
        entregadorAtual: atual
          ? {
              id: atual.entregadorId,
              pessoa: atual.pessoa,
              status: atual.status,
              disponivel: atual.disponivel,
              atribuidoEm: atual.atribuidoEm.toISOString(),
            }
          : null,
        historico: await listarHistoricoAtribuicoes(banco, pedidoId),
      };
      return entrega;
    },
  );

  servidor.post(
    "/empresas/:empresaId/pedidos/:pedidoId/entrega",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosPedidoDaEmpresaSchema.safeParse(
        requisicao.params,
      );
      const entrada = atribuirEntregaEntradaSchema.safeParse(requisicao.body);
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Pedido inválido.",
        });
      if (!entrada.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Escolha um entregador.",
        });

      const resultado = await atribuirEntregaAutorizada(
        dependencias,
        usuarioId,
        parametros.data.empresaId,
        parametros.data.pedidoId,
        entrada.data,
      );
      switch (resultado.tipo) {
        case "empresa-nao-encontrada":
          return responder(resposta, 404, EMPRESA_NAO_ENCONTRADA);
        case "pedido-nao-encontrado":
          return responder(resposta, 404, {
            codigo: "PEDIDO_NAO_ENCONTRADO",
            mensagem: "Pedido não encontrado.",
          });
        case "entregador-nao-encontrado":
          return responder(resposta, 404, ENTREGADOR_NAO_ENCONTRADO);
        case "entregador-inativo":
          return responder(resposta, 409, {
            codigo: "ENTREGADOR_INATIVO",
            mensagem: "Este entregador não está ativo na empresa.",
          });
        case "entregador-indisponivel":
          return responder(resposta, 409, {
            codigo: "ENTREGADOR_INDISPONIVEL",
            mensagem:
              "Este entregador não está disponível para novas entregas agora.",
          });
        case "status-invalido":
          return responder(resposta, 409, {
            codigo: "TRANSICAO_PEDIDO_INVALIDA",
            mensagem:
              "O pedido precisa estar pronto (ou já em entrega) para ter entregador.",
          });
        case "pedido-em-saida":
          return responder(resposta, 409, {
            codigo: "SAIDA_EM_ANDAMENTO",
            mensagem:
              "Este pedido faz parte de uma saída de entrega; troque pela saída, não por pedido.",
          });
        case "conflito":
          return responder(resposta, 409, {
            codigo: "ATRIBUICAO_CONFLITANTE",
            mensagem:
              "A atribuição deste pedido mudou. Recarregue para ver quem está com ele.",
          });
        case "atribuido": {
          const atual = await buscarAtribuicaoAtual(
            banco,
            parametros.data.pedidoId,
          );
          const entrega: EntregaDoPedido = {
            entregadorAtual: atual
              ? {
                  id: atual.entregadorId,
                  pessoa: atual.pessoa,
                  status: atual.status,
                  disponivel: atual.disponivel,
                  atribuidoEm: atual.atribuidoEm.toISOString(),
                }
              : null,
            historico: await listarHistoricoAtribuicoes(
              banco,
              parametros.data.pedidoId,
            ),
          };
          return entrega;
        }
      }
    },
  );

  /* BASE OPERACIONAL da empresa: endereço, ponto confirmado e raio (área da base, não de entrega). */

  servidor.get(
    "/empresas/:empresaId/base",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Empresa inválida.",
        });

      const resultado = await obterBaseAutorizada(
        banco,
        usuarioId,
        parametros.data.empresaId,
      );
      if (resultado.tipo !== "base")
        return responder(resposta, 404, EMPRESA_NAO_ENCONTRADA);
      if (!resultado.base)
        return responder(resposta, 404, {
          codigo: "BASE_NAO_CONFIGURADA",
          mensagem:
            "Esta empresa ainda não configurou a base de onde saem as entregas.",
        });
      const base: BaseEmpresa = serializarBase(resultado.base);
      return base;
    },
  );

  servidor.post(
    "/empresas/:empresaId/base",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
      const entrada = salvarBaseEntradaSchema.safeParse(requisicao.body);
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Empresa inválida.",
        });
      if (!entrada.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: entrada.error.issues[0]?.message ?? "Base inválida.",
        });

      const resultado = await salvarBaseAutorizada(
        banco,
        usuarioId,
        parametros.data.empresaId,
        entrada.data,
      );
      if (resultado.tipo !== "base")
        return responder(resposta, 404, EMPRESA_NAO_ENCONTRADA);
      return serializarBase(resultado.base);
    },
  );

  // Confirmação EXPLÍCITA do ponto da base (o mapa nunca corrige o endereço digitado).
  servidor.post(
    "/empresas/:empresaId/base/localizacao",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
      const entrada = confirmarPontoBaseEntradaSchema.safeParse(
        requisicao.body,
      );
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Empresa inválida.",
        });
      if (!entrada.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Coordenadas inválidas.",
        });

      const resultado = await confirmarPontoBaseAutorizado(
        banco,
        usuarioId,
        parametros.data.empresaId,
        entrada.data,
      );
      if (resultado.tipo === "empresa-nao-encontrada")
        return responder(resposta, 404, EMPRESA_NAO_ENCONTRADA);
      if (resultado.tipo !== "base")
        return responder(resposta, 404, {
          codigo: "BASE_NAO_CONFIGURADA",
          mensagem: "Configure o endereço da base antes de confirmar o ponto.",
        });
      return serializarBase(resultado.base);
    },
  );

  // Sugestão reutiliza o mesmo geocodificador dos endereços de entrega e nunca confirma o ponto.
  servidor.get(
    "/empresas/:empresaId/base/sugestao-localizacao",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Empresa inválida.",
        });

      const resultado = await obterBaseAutorizada(
        banco,
        usuarioId,
        parametros.data.empresaId,
      );
      if (resultado.tipo !== "base")
        return responder(resposta, 404, EMPRESA_NAO_ENCONTRADA);
      if (!resultado.base)
        return responder(resposta, 404, {
          codigo: "BASE_NAO_CONFIGURADA",
          mensagem: "Configure o endereço da base antes de buscar o ponto.",
        });

      const sugestao: SugestaoLocalizacaoBase = {
        disponivel: dependencias.geocodificador.disponivel,
        coordenadas: dependencias.geocodificador.disponivel
          ? await dependencias.geocodificador.sugerir(resultado.base)
          : null,
      };
      return sugestao;
    },
  );

  // Painel operacional: fila da base, disponíveis fora da base e indisponíveis (estados derivados).
  servidor.get(
    "/empresas/:empresaId/operacao",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Empresa inválida.",
        });

      const resultado = await obterPainelAutorizado(
        banco,
        usuarioId,
        parametros.data.empresaId,
      );
      if (resultado.tipo !== "painel")
        return responder(resposta, 404, EMPRESA_NAO_ENCONTRADA);
      const painel: PainelOperacional = resultado.painel;
      return painel;
    },
  );

  /* PRESENÇA do entregador: ele manda o que mediu; o servidor decide se está na base. */

  servidor.post(
    "/entregas/vinculos/:entregadorId/localizacao",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosConviteSchema.safeParse(requisicao.params);
      const entrada = enviarLocalizacaoEntradaSchema.safeParse(requisicao.body);
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Vínculo inválido.",
        });
      if (!entrada.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Leitura de localização inválida.",
        });

      const resultado = await processarLocalizacao(
        banco,
        usuarioId,
        parametros.data.entregadorId,
        {
          latitude: entrada.data.latitude,
          longitude: entrada.data.longitude,
          precisaoMetros: entrada.data.precisaoMetros ?? null,
          medidaEm: new Date(entrada.data.medidaEm),
        },
      );

      switch (resultado.tipo) {
        case "vinculo-nao-encontrado":
          return responder(resposta, 404, ENTREGADOR_NAO_ENCONTRADO);
        case "base-nao-configurada":
          return responder(resposta, 409, {
            codigo: "BASE_NAO_CONFIGURADA",
            mensagem: "Esta empresa ainda não confirmou o ponto da base.",
          });
        case "leitura-imprecisa":
          return responder(resposta, 409, {
            codigo: "LOCALIZACAO_IMPRECISA",
            mensagem:
              "Leitura de localização antiga ou imprecisa demais para confirmar presença.",
          });
        case "processada": {
          // Entrou/saiu da base ou da fila: empresa e entregador acompanham sem F5.
          if (resultado.presencaMudou || resultado.filaMudou)
            await publicarOperacao(dependencias, resultado.registro);
          // Entrou na fila da base: se havia saída esperando, ela é despachada agora (sem F5).
          if (resultado.filaMudou)
            await aoEntregadorEntrarNaFila(dependencias, resultado.registro);
          return montarSituacao(banco, resultado.registro);
        }
      }
    },
  );

  // "Em que empresas eu trabalho e como estou agora" (presença, estado e posição na fila).
  servidor.get("/entregas/situacao", { preHandler }, async (requisicao) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const lista: ListaSituacoesOperacionais = {
      situacoes: await listarMinhasSituacoes(banco, usuarioId),
    };
    return lista;
  });

  /*
   * ZONAS DE ENTREGA e AUTOMAÇÃO. Só quem opera a empresa configura; o cliente nunca vê zona alguma e
   * o entregador também não (para ele existe a saída atribuída a ele, nada mais).
   */

  servidor.get(
    "/empresas/:empresaId/zonas",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Empresa inválida.",
        });

      const resultado = await listarZonasAutorizado(
        banco,
        usuarioId,
        parametros.data.empresaId,
      );
      if (resultado.tipo !== "lista")
        return responder(resposta, 404, EMPRESA_NAO_ENCONTRADA);
      const lista: ListaZonas = { zonas: resultado.zonas };
      return lista;
    },
  );

  const responderZona = async (
    resposta: FastifyReply,
    resultado: Awaited<ReturnType<typeof criarZonaAutorizada>>,
    empresaId: string,
    criada: boolean,
  ) => {
    switch (resultado.tipo) {
      case "empresa-nao-encontrada":
        return responder(resposta, 404, EMPRESA_NAO_ENCONTRADA);
      case "zona-nao-encontrada":
        return responder(resposta, 404, ZONA_NAO_ENCONTRADA);
      case "geometria-invalida":
        return responder(resposta, 400, {
          codigo: "ZONA_INVALIDA",
          mensagem:
            "O contorno da zona precisa ser um polígono simples, sem cruzar as próprias linhas.",
        });
      case "nome-duplicado":
        return responder(resposta, 409, {
          codigo: "ZONA_INVALIDA",
          mensagem: "Já existe uma zona com esse nome nesta empresa.",
        });
      case "sobreposta":
        return responder(resposta, 409, {
          codigo: "ZONAS_SOBREPOSTAS",
          mensagem: `Esta área se sobrepõe à zona "${resultado.zonaConflitante.nome}". Ajuste o contorno para que cada endereço fique em uma zona só.`,
        });
      case "salva": {
        // Zona nova/alterada muda a automação: reconcilia os pedidos prontos e atualiza o painel.
        await reconciliarDespacho(dependencias, empresaId);
        await publicarDespacho(dependencias, empresaId);
        const zonas = await listarZonasAutorizadoOuVazio(empresaId);
        const zona = zonas.find((item) => item.id === resultado.zona.id);
        return criada ? resposta.code(201).send(zona) : zona;
      }
    }
  };

  const listarZonasAutorizadoOuVazio = async (empresaId: string) =>
    (await montarPainelDespacho(banco, empresaId)).zonas;

  servidor.post(
    "/empresas/:empresaId/zonas",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
      const entrada = salvarZonaEntradaSchema.safeParse(requisicao.body);
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Empresa inválida.",
        });
      if (!entrada.success)
        return responder(resposta, 400, {
          codigo: "ZONA_INVALIDA",
          mensagem: entrada.error.issues[0]?.message ?? "Zona inválida.",
        });

      const resultado = await criarZonaAutorizada(
        banco,
        usuarioId,
        parametros.data.empresaId,
        entrada.data,
      );
      return responderZona(
        resposta,
        resultado,
        parametros.data.empresaId,
        true,
      );
    },
  );

  servidor.patch(
    "/empresas/:empresaId/zonas/:zonaId",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosZonaSchema.safeParse(requisicao.params);
      const entrada = salvarZonaEntradaSchema.safeParse(requisicao.body);
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Zona inválida.",
        });
      if (!entrada.success)
        return responder(resposta, 400, {
          codigo: "ZONA_INVALIDA",
          mensagem: entrada.error.issues[0]?.message ?? "Zona inválida.",
        });

      const resultado = await atualizarZonaAutorizada(
        banco,
        usuarioId,
        parametros.data.empresaId,
        parametros.data.zonaId,
        entrada.data,
      );
      return responderZona(
        resposta,
        resultado,
        parametros.data.empresaId,
        false,
      );
    },
  );

  // Compatibilidade entre zonas: decisão explícita do gestor, normalizada para valer nos dois sentidos.
  servidor.post(
    "/empresas/:empresaId/zonas/:zonaId/compatibilidades",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosZonaSchema.safeParse(requisicao.params);
      const entrada = definirCompatibilidadesEntradaSchema.safeParse(
        requisicao.body,
      );
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Zona inválida.",
        });
      if (!entrada.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Informe as zonas compatíveis.",
        });

      const resultado = await definirCompatibilidadesAutorizado(
        banco,
        usuarioId,
        parametros.data.empresaId,
        parametros.data.zonaId,
        entrada.data.zonaIds,
      );
      if (resultado.tipo === "empresa-nao-encontrada")
        return responder(resposta, 404, EMPRESA_NAO_ENCONTRADA);
      if (resultado.tipo !== "definida")
        return responder(resposta, 404, ZONA_NAO_ENCONTRADA);
      const lista: ListaZonas = { zonas: resultado.zonas };
      return lista;
    },
  );

  // Painel de logística: configuração, zonas e os pedidos que ficaram fora das zonas (pendência).
  servidor.get(
    "/empresas/:empresaId/despacho",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Empresa inválida.",
        });

      const resultado = await obterConfiguracaoAutorizada(
        banco,
        usuarioId,
        parametros.data.empresaId,
      );
      if (resultado.tipo !== "configuracao")
        return responder(resposta, 404, EMPRESA_NAO_ENCONTRADA);
      // Abrir o painel também é um ponto natural de reconciliação (nada depende de tela aberta).
      await reconciliarDespacho(dependencias, parametros.data.empresaId);
      const painel: PainelDespacho = await montarPainelDespacho(
        banco,
        parametros.data.empresaId,
      );
      return painel;
    },
  );

  servidor.post(
    "/empresas/:empresaId/despacho",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
      const entrada = salvarConfiguracaoDespachoEntradaSchema.safeParse(
        requisicao.body,
      );
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Empresa inválida.",
        });
      if (!entrada.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem:
            entrada.error.issues[0]?.message ?? "Configuração inválida.",
        });

      const resultado = await salvarConfiguracaoAutorizada(
        banco,
        usuarioId,
        parametros.data.empresaId,
        entrada.data,
      );
      if (resultado.tipo !== "configuracao")
        return responder(resposta, 404, EMPRESA_NAO_ENCONTRADA);
      await publicarDespacho(dependencias, parametros.data.empresaId);
      const painel: PainelDespacho = await montarPainelDespacho(
        banco,
        parametros.data.empresaId,
      );
      return painel;
    },
  );

  /* SAÍDAS — lado da EMPRESA: montar, acompanhar e iniciar a operação. */

  servidor.get(
    "/empresas/:empresaId/saidas",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Empresa inválida.",
        });

      const consulta = requisicao.query as { ativas?: string };
      const resultado = await listarSaidasAutorizado(
        banco,
        usuarioId,
        parametros.data.empresaId,
        consulta.ativas !== "false",
      );
      if (resultado.tipo !== "lista")
        return responder(resposta, 404, EMPRESA_NAO_ENCONTRADA);
      const lista: ListaSaidas = {
        saidas: await Promise.all(
          resultado.saidas.map((saida) =>
            serializarSaidaComEmpresa(banco, saida),
          ),
        ),
      };
      return lista;
    },
  );

  servidor.post(
    "/empresas/:empresaId/saidas",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
      const entrada = criarSaidaEntradaSchema.safeParse(requisicao.body);
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Empresa inválida.",
        });
      if (!entrada.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Escolha o entregador e ao menos um pedido.",
        });

      const resultado = await criarSaidaAutorizada(
        dependencias,
        usuarioId,
        parametros.data.empresaId,
        entrada.data,
      );
      switch (resultado.tipo) {
        case "empresa-nao-encontrada":
          return responder(resposta, 404, EMPRESA_NAO_ENCONTRADA);
        case "entregador-nao-encontrado":
          return responder(resposta, 404, ENTREGADOR_NAO_ENCONTRADO);
        case "entregador-indisponivel":
          return responder(resposta, 409, {
            codigo: "ENTREGADOR_INDISPONIVEL",
            mensagem:
              "Este entregador não está disponível para novas entregas agora.",
          });
        case "pedidos-invalidos":
          return responder(resposta, 409, {
            codigo: "PEDIDOS_INVALIDOS_PARA_SAIDA",
            mensagem:
              "Só entram pedidos prontos desta empresa, com destino confirmado e fora de outra saída.",
          });
        case "conflito":
          return responder(resposta, 409, {
            codigo: "PEDIDOS_INVALIDOS_PARA_SAIDA",
            mensagem:
              "Algum pedido entrou em outra saída agora há pouco. Recarregue a lista.",
          });
        case "criada": {
          // Recebeu saída: sai da fila da base (está indo para a rua).
          const aposSaida = await reavaliarFila(
            banco,
            entrada.data.entregadorId,
            "Recebeu saída de entrega",
          );
          if (aposSaida)
            await publicarOperacao(dependencias, aposSaida.registro);
          await publicarSaida(dependencias, resultado.saida);
          return resposta
            .code(201)
            .send(await serializarSaidaComEmpresa(banco, resultado.saida));
        }
      }
    },
  );

  servidor.get(
    "/empresas/:empresaId/saidas/:saidaId",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosSaidaDaEmpresaSchema.safeParse(
        requisicao.params,
      );
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Saída inválida.",
        });

      const resultado = await obterSaidaDaEmpresaAutorizado(
        banco,
        usuarioId,
        parametros.data.empresaId,
        parametros.data.saidaId,
      );
      if (resultado.tipo === "empresa-nao-encontrada")
        return responder(resposta, 404, EMPRESA_NAO_ENCONTRADA);
      if (resultado.tipo !== "saida")
        return responder(resposta, 404, SAIDA_NAO_ENCONTRADA);
      return serializarSaidaComEmpresa(banco, resultado.saida);
    },
  );

  /**
   * LIBERAÇÃO pelo gestor: se ainda estiver em formação, primeiro congela e organiza a rota; depois
   * autoriza a retirada. Sem entregador na fila, a decisão fica registrada e vale quando ele chegar.
   */
  const liberarSaida = async (
    requisicao: FastifyRequest,
    resposta: FastifyReply,
  ) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosSaidaDaEmpresaSchema.safeParse(
      requisicao.params,
    );
    if (!parametros.success)
      return responder(resposta, 400, {
        codigo: "DADOS_INVALIDOS",
        mensagem: "Saída inválida.",
      });

    const { empresaId, saidaId } = parametros.data;
    const acesso = await autorizarEmpresa(
      banco,
      usuarioId,
      empresaId,
      "gerenciar-logistica",
    );
    if (!acesso) return responder(resposta, 404, EMPRESA_NAO_ENCONTRADA);

    if (!(await liberarSaidaManualmente(dependencias, empresaId, saidaId))) {
      const existente = await obterSaidaDaEmpresaAutorizado(
        banco,
        usuarioId,
        empresaId,
        saidaId,
      );
      if (existente.tipo !== "saida")
        return responder(resposta, 404, SAIDA_NAO_ENCONTRADA);
      return responder(resposta, 409, {
        codigo: "SAIDA_NAO_PODE_SER_LIBERADA",
        mensagem: "Esta saída já foi liberada, iniciada ou concluída.",
      });
    }
    const atual = await obterSaidaDaEmpresaAutorizado(
      banco,
      usuarioId,
      empresaId,
      saidaId,
    );
    if (atual.tipo !== "saida")
      return responder(resposta, 404, SAIDA_NAO_ENCONTRADA);
    return serializarSaidaComEmpresa(banco, atual.saida);
  };
  servidor.post(
    "/empresas/:empresaId/saidas/:saidaId/liberar",
    { preHandler },
    liberarSaida,
  );
  // Compatibilidade temporária com clientes anteriores: a antiga ação de fechar agora libera.
  servidor.post(
    "/empresas/:empresaId/saidas/:saidaId/fechar",
    { preHandler },
    liberarSaida,
  );

  /*
   * RASTREAMENTO — só DENTRO da operação. O aparelho do entregador manda o que mediu; o servidor
   * confere que a saída é dele e está EM ANDAMENTO, decide o que aceitar e quem recebe.
   * Nenhuma posição aqui chama provedor de rotas: GPS não recalcula percurso.
   */
  servidor.post(
    "/entregas/saidas/:saidaId/posicao",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosSaidaSchema.safeParse(requisicao.params);
      const entrada = enviarPosicaoEntradaSchema.safeParse(requisicao.body);
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Saída inválida.",
        });
      if (!entrada.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Leitura de localização inválida.",
        });

      const resultado = await registrarPosicaoDoEntregador(
        dependencias,
        usuarioId,
        parametros.data.saidaId,
        entrada.data,
      );
      switch (resultado.tipo) {
        case "saida-nao-encontrada":
          return responder(resposta, 404, SAIDA_NAO_ENCONTRADA);
        case "fora-de-operacao":
          // Saída ainda não iniciada ou já encerrada: o aparelho deve PARAR de rastrear.
          return responder(resposta, 409, {
            codigo: "SAIDA_NAO_ESTA_EM_ANDAMENTO",
            mensagem:
              "Esta saída não está em andamento: o rastreamento desta operação terminou.",
          });
        case "leitura-invalida":
          return responder(resposta, 409, {
            codigo: "LOCALIZACAO_IMPRECISA",
            mensagem: "Leitura de localização antiga ou imprecisa demais.",
          });
        case "ignorada":
          // Pacote atrasado/fora de ordem: a posição atual é mais nova e permanece.
          return resposta.code(202).send({ aplicada: false });
        case "registrada":
          return resultado.posicao;
      }
    },
  );

  // Reconexão do ENTREGADOR: a última posição da própria saída, sem depender do último evento.
  servidor.get(
    "/entregas/saidas/:saidaId/posicao",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosSaidaSchema.safeParse(requisicao.params);
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Saída inválida.",
        });

      const resultado = await obterPosicaoAutorizada(
        banco,
        usuarioId,
        parametros.data.saidaId,
      );
      if (resultado.tipo !== "posicao")
        return responder(resposta, 404, SAIDA_NAO_ENCONTRADA);
      const posicao: PosicaoEntregador | null = resultado.posicao;
      return { posicao };
    },
  );

  // Reconexão da EMPRESA: última posição de UMA saída dela.
  servidor.get(
    "/empresas/:empresaId/saidas/:saidaId/posicao",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosSaidaDaEmpresaSchema.safeParse(
        requisicao.params,
      );
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Saída inválida.",
        });

      const resultado = await obterPosicaoAutorizada(
        banco,
        usuarioId,
        parametros.data.saidaId,
        parametros.data.empresaId,
      );
      if (resultado.tipo !== "posicao")
        return responder(resposta, 404, SAIDA_NAO_ENCONTRADA);
      const posicao: PosicaoEntregador | null = resultado.posicao;
      return { posicao };
    },
  );

  /**
   * Painel da empresa: posições das saídas EM ANDAMENTO dela. Fora da operação não há rastreamento —
   * isto acompanha entrega, não pessoa.
   */
  servidor.get(
    "/empresas/:empresaId/posicoes",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Empresa inválida.",
        });

      const resultado = await listarPosicoesAutorizadas(
        banco,
        usuarioId,
        parametros.data.empresaId,
      );
      if (resultado.tipo !== "lista")
        return responder(resposta, 404, EMPRESA_NAO_ENCONTRADA);
      const lista: ListaPosicoes = { posicoes: resultado.posicoes };
      return lista;
    },
  );

  /* SAÍDAS — lado do ENTREGADOR: as próprias saídas e a reordenação da própria sequência. */

  servidor.get("/entregas/saidas", { preHandler }, async (requisicao) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const consulta = requisicao.query as { ativas?: string };
    const saidas = await listarMinhasSaidas(
      banco,
      usuarioId,
      consulta.ativas !== "false",
    );
    const lista: ListaSaidas = {
      saidas: await Promise.all(
        saidas.map((saida) => serializarSaidaComEmpresa(banco, saida)),
      ),
    };
    return lista;
  });

  servidor.get(
    "/entregas/saidas/:saidaId",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosSaidaSchema.safeParse(requisicao.params);
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Saída inválida.",
        });

      const saida = await obterMinhaSaida(
        banco,
        usuarioId,
        parametros.data.saidaId,
      );
      if (!saida) return responder(resposta, 404, SAIDA_NAO_ENCONTRADA);
      return serializarSaidaComEmpresa(banco, saida);
    },
  );

  /**
   * INICIAR pelo ENTREGADOR: é ele quem sai com os pedidos. Só parte de "liberada para retirada";
   * a troca é condicional e os pedidos avançam pela máquina de estados. O rastreamento só passa a
   * valer depois disto. Iniciar de novo é recusado: nada muda numa saída em andamento.
   */
  servidor.post(
    "/entregas/saidas/:saidaId/iniciar",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosSaidaSchema.safeParse(requisicao.params);
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Saída inválida.",
        });

      const resultado = await iniciarMinhaSaida(
        banco,
        usuarioId,
        parametros.data.saidaId,
        (empresaId, pedidoId) =>
          dependencias.avancarPedidoPeloEntregador(
            usuarioId,
            empresaId,
            pedidoId,
          ),
      );
      if (resultado.tipo === "saida-nao-encontrada")
        return responder(resposta, 404, SAIDA_NAO_ENCONTRADA);
      if (resultado.tipo !== "iniciada") {
        return responder(resposta, 409, {
          codigo: "SAIDA_NAO_LIBERADA",
          mensagem:
            "Esta saída ainda não foi liberada para retirada, já foi iniciada ou foi concluída.",
        });
      }
      // Empresa e entregador recebem a saída em andamento sem F5.
      await publicarSaida(dependencias, resultado.saida);
      if (resultado.saida.saida.entregadorId) {
        const emEntrega = await reavaliarFila(
          banco,
          resultado.saida.saida.entregadorId,
          "Iniciou saída de entrega",
        );
        if (emEntrega) await publicarOperacao(dependencias, emEntrega.registro);
      }
      return serializarSaidaComEmpresa(banco, resultado.saida);
    },
  );

  /**
   * A sequência do Jaa é sugestão: quem conhece a região é quem está na rua. Só o entregador ATUAL
   * da saída reordena, e a versão que ele viu precisa ser a atual (nada é sobrescrito em silêncio).
   */
  servidor.patch(
    "/entregas/saidas/:saidaId/sequencia",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosSaidaSchema.safeParse(requisicao.params);
      const entrada = reordenarSequenciaEntradaSchema.safeParse(
        requisicao.body,
      );
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Saída inválida.",
        });
      if (!entrada.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Informe a nova ordem e a versão da sequência.",
        });

      const resultado = await reordenarMinhaSaida(
        dependencias,
        usuarioId,
        parametros.data.saidaId,
        entrada.data,
      );
      switch (resultado.tipo) {
        case "saida-nao-encontrada":
          return responder(resposta, 404, SAIDA_NAO_ENCONTRADA);
        case "sequencia-invalida":
          return responder(resposta, 400, {
            codigo: "DADOS_INVALIDOS",
            mensagem:
              "A nova ordem precisa conter exatamente as entregas ativas desta saída.",
          });
        case "versao-desatualizada":
          return responder(resposta, 409, {
            codigo: "SEQUENCIA_DESATUALIZADA",
            mensagem:
              "A sequência mudou enquanto você organizava. Recarregue para ver a ordem atual.",
          });
        case "reordenada":
          await publicarSaida(dependencias, resultado.saida);
          return serializarSaidaComEmpresa(banco, resultado.saida);
      }
    },
  );

  /* Lado da PESSOA: convites e entregas próprias. Nenhuma dessas rotas aceita empresaId do cliente. */

  servidor.get("/entregas/convites", { preHandler }, async (requisicao) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const convites: ConviteEntregador[] = [];
    for (const convite of await listarConvitesPendentes(banco, usuarioId)) {
      const empresa = await buscarEmpresaPublicaPorId(banco, convite.empresaId);
      if (empresa)
        convites.push({
          id: convite.id,
          empresa: serializarEmpresaPublica(empresa),
          status: convite.status,
          convidadoEm: convite.convidadoEm.toISOString(),
        });
    }
    const lista: ListaConvitesEntregador = { convites };
    return lista;
  });

  servidor.post(
    "/entregas/convites/:entregadorId",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosConviteSchema.safeParse(requisicao.params);
      const entrada = responderConviteEntradaSchema.safeParse(requisicao.body);
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Convite inválido.",
        });
      if (!entrada.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Resposta inválida.",
        });

      const resultado = await responderConviteDaPessoa(
        banco,
        usuarioId,
        parametros.data.entregadorId,
        entrada.data.resposta === "aceitar",
      );
      if (resultado.tipo !== "respondido")
        return responder(resposta, 404, ENTREGADOR_NAO_ENCONTRADO);

      // Respondeu: o convite sai da lista dele e o vínculo entra (nas outras abas/dispositivos também).
      const atualizado = await buscarEntregadorDaEmpresa(
        banco,
        resultado.empresaId,
        parametros.data.entregadorId,
      );
      if (atualizado) await publicarVinculoEntregador(dependencias, atualizado);
      return { status: resultado.status };
    },
  );

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
        disponibilidadeAtualizadaEm:
          vinculo.disponibilidadeAtualizadaEm?.toISOString() ?? null,
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
  servidor.patch(
    "/entregas/vinculos/:entregadorId",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosConviteSchema.safeParse(requisicao.params);
      const entrada = alterarDisponibilidadeEntradaSchema.safeParse(
        requisicao.body,
      );
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Vínculo inválido.",
        });
      if (!entrada.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Informe se você está disponível.",
        });

      const resultado = await alterarMinhaDisponibilidade(
        banco,
        usuarioId,
        parametros.data.entregadorId,
        entrada.data.disponivel,
      );
      if (resultado.tipo !== "alterado")
        return responder(resposta, 404, ENTREGADOR_NAO_ENCONTRADO);

      // Deixar de aceitar entregas tira da fila; voltar a aceitar na base recoloca no final dela.
      const naFila = await reavaliarFila(
        banco,
        parametros.data.entregadorId,
        "Parou de aceitar entregas",
      );
      if (naFila) {
        await publicarOperacao(dependencias, naFila.registro);
        await aoEntregadorEntrarNaFila(dependencias, naFila.registro);
      }

      // A empresa daquele vínculo acompanha em tempo real quem ficou disponível (e só ela).
      const empresa = await buscarEmpresaPublicaPorId(
        banco,
        resultado.entregador.empresaId,
      );
      if (empresa) {
        dependencias.eventosEntregas.publicar({
          tipo: "disponibilidade-atualizada",
          destinatariosIdentidadeIds: [empresa.identidadeId],
          entregador: serializarEntregador(resultado.entregador),
        });
      }
      return serializarEntregador(resultado.entregador);
    },
  );

  servidor.get("/entregas", { preHandler }, async (requisicao) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const lista: ListaEntregas = {
      entregas: await listarMinhasEntregas(banco, usuarioId),
    };
    return lista;
  });

  servidor.get(
    "/entregas/:pedidoId",
    { preHandler },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosEntregaSchema.safeParse(requisicao.params);
      if (!parametros.success)
        return responder(resposta, 400, {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Entrega inválida.",
        });

      const entrega = await obterMinhaEntrega(
        banco,
        usuarioId,
        parametros.data.pedidoId,
      );
      if (!entrega) return responder(resposta, 404, ENTREGA_NAO_ENCONTRADA);
      return entrega;
    },
  );
}
