import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { criarConexaoBanco } from "@jaa/banco";
import {
  atribuicoesEntrega,
  categoriasProduto,
  compatibilidadesZona,
  contatos,
  excecoesPrivacidade,
  preferenciasIdentidade,
  configuracoesDespacho,
  conversas,
  empresas,
  enderecosCliente,
  entregadoresEmpresa,
  paradasSaida,
  recusasSaida,
  saidasEntrega,
  identidades,
  membrosEmpresa,
  mensagens,
  participantesConversa,
  pedidos,
  produtos,
  rateLimits,
  users,
  verifications,
  zonasEntrega,
} from "@jaa/banco/schema";
import {
  CABECALHO_IDENTIDADE_ATUANTE,
  type Mensagem,
  type PaginaConversas,
  type PaginaMensagens,
} from "@jaa/contratos";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { count, inArray, like, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { io, type Socket } from "socket.io-client";
import type { MotorDeRotas } from "../../src/features/entregas/lib/motor-rotas.js";
import type { ArmazenamentoDeArquivos } from "../../src/lib/armazenamento/armazenamento-arquivos.js";
import { criarAplicacao } from "../../src/aplicacao.js";
import { criarOpcoesAutenticacao } from "../../src/features/autenticacao/autenticacao.js";
import { criarAvisoSessoesEncerradas } from "../../src/features/autenticacao/lib/sessoes-encerradas.js";
import { criarCanalEventosMensagens } from "../../src/features/mensagens/lib/eventos-mensagens.js";
import { criarCanalEventosEntregas } from "../../src/features/entregas/lib/eventos-entregas.js";
import { criarCanalEventosPedidos } from "../../src/features/pedidos/lib/eventos-pedidos.js";
import { carregarAmbiente } from "../../src/lib/ambiente.js";
import { configurarRealtime } from "../../src/realtime/configurar-realtime.js";

/*
 * Apoio para testes de integração REAIS (Fastify + Better Auth + PostgreSQL local + Socket.IO numa porta).
 * Cada arquivo usa telefones e prefixo de IP reservados próprios; tudo o que cria é removido ao final.
 */

const ORIGEM_WEB = "http://localhost:3000";

export interface Pessoa {
  cookie: string;
  identidadeId: string;
  nomeExibicao: string;
  ip: string;
  // Intenção de agir como outra identidade (cabeçalho HTTP / auth do socket). Ausente = pessoal.
  identidadeAtuanteId?: string | string[];
}

// A mesma conta/sessão pedindo para agir como `identidadeId` (o servidor decide se pode).
export function como(pessoa: Pessoa, identidadeId: string | string[]): Pessoa {
  return { ...pessoa, identidadeAtuanteId: identidadeId };
}

export function criarAmbienteIntegracao({
  telefones,
  prefixoIp,
  // Motor de rotas FAKE quando o teste precisa dele: nenhum teste chama provedor externo real.
  motorRotas,
  // Armazenamento FAKE quando o teste precisa dele: nenhum teste fala com o Cloudflare de verdade.
  armazenamento,
}: {
  telefones: string[];
  prefixoIp: string;
  motorRotas?: MotorDeRotas | undefined;
  armazenamento?: ArmazenamentoDeArquivos | undefined;
}) {
  const ambiente = carregarAmbiente();
  // A origem do teste é definida AQUI: mudar as origens do .env local não pode quebrar a suíte.
  const ambienteDoTeste = { ...ambiente, ORIGENS_WEB_PERMITIDAS: [ORIGEM_WEB] };
  const conexao = criarConexaoBanco(ambiente.DATABASE_URL);
  const { banco } = conexao;
  const eventosMensagens = criarCanalEventosMensagens();
  const eventosPedidos = criarCanalEventosPedidos();
  const eventosEntregas = criarCanalEventosEntregas();
  const sessoesEncerradas = criarAvisoSessoesEncerradas();
  const opcoes = criarOpcoesAutenticacao({
    banco,
    ambiente: ambienteDoTeste,
    entregadorOtp: { enviar: async () => {} },
    sessoesEncerradas,
  });
  const autenticacao = betterAuth({
    ...opcoes,
    plugins: [...opcoes.plugins, testUtils({ captureOTP: true })],
  });
  const clientes: Socket[] = [];
  let app: FastifyInstance;
  let porta = 0;

  function api(
    pessoa: Pessoa | null,
    metodo: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    corpo?: unknown,
  ) {
    return app.inject({
      method: metodo,
      url,
      remoteAddress: pessoa?.ip ?? `${prefixoIp}99`,
      headers: {
        origin: ORIGEM_WEB,
        ...(corpo !== undefined ? { "content-type": "application/json" } : {}),
        ...(pessoa ? { cookie: pessoa.cookie } : {}),
        ...(pessoa?.identidadeAtuanteId
          ? { [CABECALHO_IDENTIDADE_ATUANTE]: pessoa.identidadeAtuanteId }
          : {}),
      },
      ...(corpo !== undefined ? { payload: JSON.stringify(corpo) } : {}),
    });
  }

  /**
   * Envio de arquivo (multipart/form-data) montado à mão: o teste precisa exercitar exatamente o
   * mesmo caminho do navegador, inclusive o tipo declarado — que o servidor não deve acreditar.
   */
  function enviarArquivo(
    pessoa: Pessoa,
    url: string,
    arquivo: { nome: string; tipo: string; conteudo: Buffer },
  ) {
    const limite = "----JaaTeste";
    const cabecalho = Buffer.from(
      `--${limite}\r\nContent-Disposition: form-data; name="arquivo"; filename="${arquivo.nome}"\r\nContent-Type: ${arquivo.tipo}\r\n\r\n`,
    );
    const fim = Buffer.from(`\r\n--${limite}--\r\n`);
    return app.inject({
      method: "POST",
      url,
      remoteAddress: pessoa.ip,
      headers: {
        origin: ORIGEM_WEB,
        cookie: pessoa.cookie,
        "content-type": `multipart/form-data; boundary=${limite}`,
        ...(pessoa.identidadeAtuanteId
          ? { [CABECALHO_IDENTIDADE_ATUANTE]: pessoa.identidadeAtuanteId }
          : {}),
      },
      payload: Buffer.concat([cabecalho, arquivo.conteudo, fim]),
    });
  }

  async function limpar() {
    const usuariosTeste = banco
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.phoneNumber, telefones));
    const empresasTeste = banco
      .select({ id: membrosEmpresa.empresaId })
      .from(membrosEmpresa)
      .where(inArray(membrosEmpresa.usuarioId, usuariosTeste));
    const identidadesTeste = banco
      .select({ id: identidades.id })
      .from(identidades)
      .where(
        or(
          inArray(identidades.usuarioId, usuariosTeste),
          inArray(identidades.empresaId, empresasTeste),
        ),
      );
    const conversasTeste = banco
      .select({ id: participantesConversa.conversaId })
      .from(participantesConversa)
      .where(inArray(participantesConversa.identidadeId, identidadesTeste));
    // Ordem: mensagens (referenciam pedidos) → pedidos (itens em cascata) → conversas → produtos → …
    await banco
      .delete(contatos)
      .where(
        or(
          inArray(contatos.identidadeId, identidadesTeste),
          inArray(contatos.contatoIdentidadeId, identidadesTeste),
        ),
      );
    await banco
      .delete(preferenciasIdentidade)
      .where(inArray(preferenciasIdentidade.identidadeId, identidadesTeste));
    await banco
      .delete(excecoesPrivacidade)
      .where(
        or(
          inArray(excecoesPrivacidade.identidadeId, identidadesTeste),
          inArray(excecoesPrivacidade.alvoIdentidadeId, identidadesTeste),
        ),
      );
    await banco
      .delete(mensagens)
      .where(inArray(mensagens.conversaId, conversasTeste));
    await banco
      .delete(atribuicoesEntrega)
      .where(
        inArray(
          atribuicoesEntrega.pedidoId,
          banco
            .select({ id: pedidos.id })
            .from(pedidos)
            .where(inArray(pedidos.clienteIdentidadeId, identidadesTeste)),
        ),
      );
    await banco
      .delete(pedidos)
      .where(inArray(pedidos.clienteIdentidadeId, identidadesTeste));
    await banco.delete(conversas).where(inArray(conversas.id, conversasTeste));
    // Endereços do cliente: apagados depois dos pedidos (o destino referencia o endereço).
    await banco
      .delete(enderecosCliente)
      .where(inArray(enderecosCliente.identidadeId, identidadesTeste));
    // Empresas das contas de teste: identidade empresarial primeiro (FK), depois a empresa (membros em cascata).
    const idsEmpresas = (await empresasTeste).map((linha) => linha.id);
    if (idsEmpresas.length > 0) {
      // Saídas referenciam entregadores (restrict): saem antes deles; paradas caem em cascata.
      await banco
        .delete(paradasSaida)
        .where(inArray(paradasSaida.empresaId, idsEmpresas));
      await banco
        .delete(recusasSaida)
        .where(inArray(recusasSaida.empresaId, idsEmpresas));
      await banco
        .delete(saidasEntrega)
        .where(inArray(saidasEntrega.empresaId, idsEmpresas));
      // Zonas e configuração de despacho da empresa (as compatibilidades caem em cascata, mas o
      // delete explícito mantém a limpeza legível).
      await banco
        .delete(compatibilidadesZona)
        .where(inArray(compatibilidadesZona.empresaId, idsEmpresas));
      await banco
        .delete(zonasEntrega)
        .where(inArray(zonasEntrega.empresaId, idsEmpresas));
      await banco
        .delete(configuracoesDespacho)
        .where(inArray(configuracoesDespacho.empresaId, idsEmpresas));
      await banco
        .delete(atribuicoesEntrega)
        .where(inArray(atribuicoesEntrega.empresaId, idsEmpresas));
      await banco
        .delete(entregadoresEmpresa)
        .where(inArray(entregadoresEmpresa.empresaId, idsEmpresas));
      await banco
        .delete(pedidos)
        .where(inArray(pedidos.empresaId, idsEmpresas));
      await banco
        .delete(produtos)
        .where(inArray(produtos.empresaId, idsEmpresas));
      await banco
        .delete(categoriasProduto)
        .where(inArray(categoriasProduto.empresaId, idsEmpresas));
      await banco
        .delete(identidades)
        .where(inArray(identidades.empresaId, idsEmpresas));
      await banco.delete(empresas).where(inArray(empresas.id, idsEmpresas));
    }
    await banco
      .delete(identidades)
      .where(inArray(identidades.usuarioId, usuariosTeste));
    await banco.delete(users).where(inArray(users.phoneNumber, telefones));
    await banco
      .delete(verifications)
      .where(inArray(verifications.identifier, telefones));
    await banco.delete(rateLimits).where(like(rateLimits.key, `${prefixoIp}%`));
  }

  return {
    banco,
    eventosMensagens,
    eventosPedidos,
    eventosEntregas,
    api,
    enviarArquivo,

    async iniciar() {
      await limpar();
      app = await criarAplicacao({
        ambiente: ambienteDoTeste,
        banco,
        autenticacao,
        eventosMensagens,
        eventosPedidos,
        eventosEntregas,
        ...(motorRotas ? { motorRotas } : {}),
        ...(armazenamento ? { armazenamento } : {}),
        logger: false,
      });
      configurarRealtime(app, {
        autenticacao,
        banco,
        sessoesEncerradas,
        eventosMensagens,
        eventosPedidos,
        eventosEntregas,
        origensPermitidas: ambienteDoTeste.ORIGENS_WEB_PERMITIDAS,
      });
      await app.listen({ port: 0, host: "127.0.0.1" });
      porta = (app.server.address() as AddressInfo).port;
    },

    async encerrar() {
      for (const cliente of clientes) cliente.disconnect();
      await app.close();
      await limpar();
      const [restantes] = await banco
        .select({ total: count() })
        .from(users)
        .where(inArray(users.phoneNumber, telefones));
      assert.equal(restantes?.total, 0, "dados de teste não foram limpos");
      await conexao.encerrar();
    },

    async criarPessoa(
      indice: number,
      nomeUsuario: string,
      nomeExibicao: string,
    ): Promise<Pessoa> {
      const telefone = telefones[indice] as string;
      const semSessao: Pessoa = {
        cookie: "",
        identidadeId: "",
        nomeExibicao,
        ip: `${prefixoIp}${indice + 1}`,
      };
      assert.equal(
        (
          await api(semSessao, "POST", "/api/auth/phone-number/send-otp", {
            phoneNumber: telefone,
          })
        ).statusCode,
        200,
      );
      const codigo = (await autenticacao.$context).test.getOTP?.(telefone);
      assert.ok(codigo);
      const verificacao = await api(
        semSessao,
        "POST",
        "/api/auth/phone-number/verify",
        { phoneNumber: telefone, code: codigo },
      );
      const cookieSessao = verificacao.cookies.find(
        (c) => c.name === "better-auth.session_token",
      );
      assert.ok(cookieSessao);
      const pessoa: Pessoa = {
        ...semSessao,
        cookie: `${cookieSessao.name}=${cookieSessao.value}`,
      };
      const identidade = await api(pessoa, "POST", "/identidades/pessoal", {
        nomeExibicao,
        nomeUsuario,
      });
      assert.equal(identidade.statusCode, 201, identidade.body);
      return { ...pessoa, identidadeId: identidade.json().id };
    },

    // Endereço do cliente com o ponto JÁ confirmado (atalho para testes que focam no pedido).
    async criarEnderecoConfirmado(
      pessoa: Pessoa,
      dados: Record<string, unknown> = {},
      coordenadas = { latitude: -19.919125, longitude: -43.938602 },
    ): Promise<string> {
      const criado = await api(pessoa, "POST", "/enderecos", {
        apelido: "Casa",
        cep: "30123-000",
        logradouro: "Rua das Flores",
        numero: "150",
        complemento: "Apto 302",
        bairro: "Centro",
        cidade: "Belo Horizonte",
        uf: "MG",
        pontoReferencia: "Portão azul",
        ...dados,
      });
      assert.equal(criado.statusCode, 201, criado.body);
      const enderecoId: string = criado.json().id;
      const confirmado = await api(
        pessoa,
        "POST",
        `/enderecos/${enderecoId}/localizacao`,
        coordenadas,
      );
      assert.equal(confirmado.statusCode, 200, confirmado.body);
      return enderecoId;
    },

    /*
     * Entregador pronto para receber entregas: a empresa convida pelo @usuario, a pessoa aceita
     * (vínculo ATIVO, começando INDISPONÍVEL) e então escolhe ficar DISPONÍVEL para essa empresa.
     */
    async criarEntregadorAtivo(
      dona: Pessoa,
      empresaId: string,
      pessoa: Pessoa,
      nomeUsuario: string,
      disponivel = true,
    ): Promise<string> {
      const convite = await api(
        dona,
        "POST",
        `/empresas/${empresaId}/entregadores`,
        { nomeUsuario },
      );
      assert.equal(convite.statusCode, 201, convite.body);
      const entregadorId: string = convite.json().id;
      // Convidar quem já está ativo não reabre convite: nesse caso não há o que aceitar.
      if (convite.json().status === "convidado") {
        const aceite = await api(
          pessoa,
          "POST",
          `/entregas/convites/${entregadorId}`,
          { resposta: "aceitar" },
        );
        assert.equal(aceite.statusCode, 200, aceite.body);
      }
      if (disponivel) {
        const disponibilidade = await api(
          pessoa,
          "PATCH",
          `/entregas/vinculos/${entregadorId}`,
          { disponivel: true },
        );
        assert.equal(disponibilidade.statusCode, 200, disponibilidade.body);
      }
      return entregadorId;
    },

    async abrirConversa(
      origem: Pessoa,
      nomeUsuarioDestino: string,
    ): Promise<string> {
      const resposta = await api(origem, "POST", "/conversas/diretas", {
        nomeUsuario: nomeUsuarioDestino,
      });
      assert.ok([200, 201].includes(resposta.statusCode), resposta.body);
      return resposta.json().id;
    },

    async enviar(
      pessoa: Pessoa,
      conversaId: string,
      conteudo: string,
      extras: Record<string, unknown> = {},
    ): Promise<Mensagem> {
      const resposta = await api(
        pessoa,
        "POST",
        `/conversas/${conversaId}/mensagens`,
        { idCliente: randomUUID(), conteudo, ...extras },
      );
      assert.equal(resposta.statusCode, 201, resposta.body);
      return resposta.json();
    },

    async historico(
      pessoa: Pessoa,
      conversaId: string,
      consulta = "limite=100",
    ): Promise<PaginaMensagens> {
      const resposta = await api(
        pessoa,
        "GET",
        `/conversas/${conversaId}/mensagens?${consulta}`,
      );
      assert.equal(resposta.statusCode, 200, resposta.body);
      return resposta.json();
    },

    async lista(pessoa: Pessoa): Promise<PaginaConversas> {
      const resposta = await api(pessoa, "GET", "/conversas?limite=50");
      assert.equal(resposta.statusCode, 200, resposta.body);
      return resposta.json();
    },

    async conectar(pessoa: Pessoa): Promise<Socket> {
      const socket = io(`http://127.0.0.1:${porta}`, {
        forceNew: true,
        reconnection: false,
        extraHeaders: { origin: ORIGEM_WEB, cookie: pessoa.cookie },
        ...(pessoa.identidadeAtuanteId
          ? { auth: { identidadeId: pessoa.identidadeAtuanteId } }
          : {}),
      });
      clientes.push(socket);
      await new Promise<void>((resolver, rejeitar) => {
        socket.once("connect", () => resolver());
        socket.once("connect_error", rejeitar);
      });
      return socket;
    },
  };
}

export function coletar<T>(socket: Socket, evento: string): T[] {
  const recebidos: T[] = [];
  socket.on(evento, (dados: T) => recebidos.push(dados));
  return recebidos;
}

// A condição pode consultar a API (assíncrona) ou só olhar eventos já coletados (síncrona).
export async function aguardarAte(
  condicao: () => boolean | Promise<boolean>,
  limiteMs = 3000,
) {
  const inicio = Date.now();
  while (!(await condicao())) {
    if (Date.now() - inicio > limiteMs)
      throw new Error("condição não atingida a tempo");
    await new Promise((r) => setTimeout(r, 20));
  }
}

export const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
