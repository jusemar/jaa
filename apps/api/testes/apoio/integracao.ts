import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { criarConexaoBanco } from "@jaa/banco";
import { conversas, empresas, identidades, membrosEmpresa, mensagens, participantesConversa, produtos, rateLimits, users, verifications } from "@jaa/banco/schema";
import { CABECALHO_IDENTIDADE_ATUANTE, type Mensagem, type PaginaConversas, type PaginaMensagens } from "@jaa/contratos";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { count, inArray, like, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { io, type Socket } from "socket.io-client";
import { criarAplicacao } from "../../src/aplicacao.js";
import { criarOpcoesAutenticacao } from "../../src/features/autenticacao/autenticacao.js";
import { criarAvisoSessoesEncerradas } from "../../src/features/autenticacao/lib/sessoes-encerradas.js";
import { criarCanalEventosMensagens } from "../../src/features/mensagens/lib/eventos-mensagens.js";
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

export function criarAmbienteIntegracao({ telefones, prefixoIp }: { telefones: string[]; prefixoIp: string }) {
  const ambiente = carregarAmbiente();
  const conexao = criarConexaoBanco(ambiente.DATABASE_URL);
  const { banco } = conexao;
  const eventosMensagens = criarCanalEventosMensagens();
  const sessoesEncerradas = criarAvisoSessoesEncerradas();
  const opcoes = criarOpcoesAutenticacao({ banco, ambiente, entregadorOtp: { enviar: async () => {} }, sessoesEncerradas });
  const autenticacao = betterAuth({ ...opcoes, plugins: [...opcoes.plugins, testUtils({ captureOTP: true })] });
  const clientes: Socket[] = [];
  let app: FastifyInstance;
  let porta = 0;

  function api(pessoa: Pessoa | null, metodo: "GET" | "POST" | "PATCH" | "DELETE", url: string, corpo?: unknown) {
    return app.inject({
      method: metodo,
      url,
      remoteAddress: pessoa?.ip ?? `${prefixoIp}99`,
      headers: {
        origin: ORIGEM_WEB,
        ...(corpo !== undefined ? { "content-type": "application/json" } : {}),
        ...(pessoa ? { cookie: pessoa.cookie } : {}),
        ...(pessoa?.identidadeAtuanteId ? { [CABECALHO_IDENTIDADE_ATUANTE]: pessoa.identidadeAtuanteId } : {}),
      },
      ...(corpo !== undefined ? { payload: JSON.stringify(corpo) } : {}),
    });
  }

  async function limpar() {
    const usuariosTeste = banco.select({ id: users.id }).from(users).where(inArray(users.phoneNumber, telefones));
    const empresasTeste = banco.select({ id: membrosEmpresa.empresaId }).from(membrosEmpresa).where(inArray(membrosEmpresa.usuarioId, usuariosTeste));
    const identidadesTeste = banco
      .select({ id: identidades.id })
      .from(identidades)
      .where(or(inArray(identidades.usuarioId, usuariosTeste), inArray(identidades.empresaId, empresasTeste)));
    const conversasTeste = banco
      .select({ id: participantesConversa.conversaId })
      .from(participantesConversa)
      .where(inArray(participantesConversa.identidadeId, identidadesTeste));
    await banco.delete(mensagens).where(inArray(mensagens.conversaId, conversasTeste));
    await banco.delete(conversas).where(inArray(conversas.id, conversasTeste));
    // Empresas das contas de teste: identidade empresarial primeiro (FK), depois a empresa (membros em cascata).
    const idsEmpresas = (await empresasTeste).map((linha) => linha.id);
    if (idsEmpresas.length > 0) {
      await banco.delete(produtos).where(inArray(produtos.empresaId, idsEmpresas));
      await banco.delete(identidades).where(inArray(identidades.empresaId, idsEmpresas));
      await banco.delete(empresas).where(inArray(empresas.id, idsEmpresas));
    }
    await banco.delete(identidades).where(inArray(identidades.usuarioId, usuariosTeste));
    await banco.delete(users).where(inArray(users.phoneNumber, telefones));
    await banco.delete(verifications).where(inArray(verifications.identifier, telefones));
    await banco.delete(rateLimits).where(like(rateLimits.key, `${prefixoIp}%`));
  }

  return {
    banco,
    eventosMensagens,
    api,

    async iniciar() {
      await limpar();
      app = await criarAplicacao({ ambiente, banco, autenticacao, eventosMensagens, logger: false });
      configurarRealtime(app, { autenticacao, banco, sessoesEncerradas, eventosMensagens, origensPermitidas: ambiente.ORIGENS_WEB_PERMITIDAS });
      await app.listen({ port: 0, host: "127.0.0.1" });
      porta = (app.server.address() as AddressInfo).port;
    },

    async encerrar() {
      for (const cliente of clientes) cliente.disconnect();
      await app.close();
      await limpar();
      const [restantes] = await banco.select({ total: count() }).from(users).where(inArray(users.phoneNumber, telefones));
      assert.equal(restantes?.total, 0, "dados de teste não foram limpos");
      await conexao.encerrar();
    },

    async criarPessoa(indice: number, nomeUsuario: string, nomeExibicao: string): Promise<Pessoa> {
      const telefone = telefones[indice] as string;
      const semSessao: Pessoa = { cookie: "", identidadeId: "", nomeExibicao, ip: `${prefixoIp}${indice + 1}` };
      assert.equal((await api(semSessao, "POST", "/api/auth/phone-number/send-otp", { phoneNumber: telefone })).statusCode, 200);
      const codigo = (await autenticacao.$context).test.getOTP?.(telefone);
      assert.ok(codigo);
      const verificacao = await api(semSessao, "POST", "/api/auth/phone-number/verify", { phoneNumber: telefone, code: codigo });
      const cookieSessao = verificacao.cookies.find((c) => c.name === "better-auth.session_token");
      assert.ok(cookieSessao);
      const pessoa: Pessoa = { ...semSessao, cookie: `${cookieSessao.name}=${cookieSessao.value}` };
      const identidade = await api(pessoa, "POST", "/identidades/pessoal", { nomeExibicao, nomeUsuario });
      assert.equal(identidade.statusCode, 201, identidade.body);
      return { ...pessoa, identidadeId: identidade.json().id };
    },

    async abrirConversa(origem: Pessoa, nomeUsuarioDestino: string): Promise<string> {
      const resposta = await api(origem, "POST", "/conversas/diretas", { nomeUsuario: nomeUsuarioDestino });
      assert.ok([200, 201].includes(resposta.statusCode), resposta.body);
      return resposta.json().id;
    },

    async enviar(pessoa: Pessoa, conversaId: string, conteudo: string, extras: Record<string, unknown> = {}): Promise<Mensagem> {
      const resposta = await api(pessoa, "POST", `/conversas/${conversaId}/mensagens`, { idCliente: randomUUID(), conteudo, ...extras });
      assert.equal(resposta.statusCode, 201, resposta.body);
      return resposta.json();
    },

    async historico(pessoa: Pessoa, conversaId: string, consulta = "limite=100"): Promise<PaginaMensagens> {
      const resposta = await api(pessoa, "GET", `/conversas/${conversaId}/mensagens?${consulta}`);
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
        ...(pessoa.identidadeAtuanteId ? { auth: { identidadeId: pessoa.identidadeAtuanteId } } : {}),
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

export async function aguardarAte(condicao: () => boolean, limiteMs = 3000) {
  const inicio = Date.now();
  while (!condicao()) {
    if (Date.now() - inicio > limiteMs) throw new Error("condição não atingida a tempo");
    await new Promise((r) => setTimeout(r, 20));
  }
}

export const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
