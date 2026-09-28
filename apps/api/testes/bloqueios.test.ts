import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { mensagens } from "@jaa/banco/schema";
import {
  EVENTO_MENSAGEM_NOVA,
  EVENTO_NOTIFICACAO_NOVA_MENSAGEM,
  situacaoBloqueioSchema,
  type AcompanhamentoPedido,
  type Empresa,
  type Pedido,
  type Produto,
  type SaidaEntrega,
  type SituacaoBloqueio,
} from "@jaa/contratos";
import { eq } from "drizzle-orm";
import { aguardarAte, coletar, como, criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * BLOQUEIO DE COMUNICAÇÃO entre pessoas: corta MENSAGENS nos dois sentidos, nunca a OPERAÇÃO.
 * A = dona da Pizzaria; P = Paulo (entregador); B = Bruna (cliente); C = Caio (terceiro).
 */
const PREFIXO = `blq${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987695001", "+5531987695002", "+5531987695003", "+5531987695004"],
  prefixoIp: "198.18.95.",
});

let A: Pessoa;
let P: Pessoa;
let B: Pessoa;
let C: Pessoa;
let pizzaria: Empresa;
let pizza: Produto;
let paulo = "";
let conversaBP = "";
let conversaBPizzaria = "";
let enderecoB = "";

const enviar = (pessoa: Pessoa, conversaId: string, conteudo: string) =>
  ctx.api(pessoa, "POST", `/conversas/${conversaId}/mensagens`, { idCliente: randomUUID(), conteudo });
const situacao = async (pessoa: Pessoa, outra: Pessoa): Promise<SituacaoBloqueio> =>
  situacaoBloqueioSchema.parse((await ctx.api(pessoa, "GET", `/bloqueios/${outra.identidadeId}`)).json());
const bloquear = (pessoa: Pessoa, outra: Pessoa) => ctx.api(pessoa, "POST", "/bloqueios", { identidadeId: outra.identidadeId });
const desbloquear = (pessoa: Pessoa, outra: Pessoa) => ctx.api(pessoa, "DELETE", `/bloqueios/${outra.identidadeId}`);
const contarMensagens = async (conversaId: string) => (await ctx.banco.select({ id: mensagens.id }).from(mensagens).where(eq(mensagens.conversaId, conversaId))).length;

before(async () => {
  await ctx.iniciar();
  A = await ctx.criarPessoa(0, `${PREFIXO}_a`, "Ana da Pizzaria");
  P = await ctx.criarPessoa(1, `${PREFIXO}_p`, "Paulo Entregador");
  B = await ctx.criarPessoa(2, `${PREFIXO}_b`, "Bruna Cliente");
  C = await ctx.criarPessoa(3, `${PREFIXO}_c`, "Caio Terceiro");
  pizzaria = (await ctx.api(A, "POST", "/empresas", { nome: "Pizzaria Bloqueio", nomeUsuario: `${PREFIXO}_pizza`, slug: `${PREFIXO}-pizzaria` })).json();
  pizza = (await ctx.api(A, "POST", `/empresas/${pizzaria.id}/produtos`, { nome: "Pizza", precoCentavos: 3990 })).json();
  paulo = await ctx.criarEntregadorAtivo(A, pizzaria.id, P, `${PREFIXO}_p`);
  enderecoB = await ctx.criarEnderecoConfirmado(B, { apelido: "Casa" }, { latitude: -19.93, longitude: -43.95 });
  conversaBPizzaria = await ctx.abrirConversa(B, `${PREFIXO}_pizza`);
  // Cliente → entregador pela conversa DIRETA de sempre (mesma conversa nos dois sentidos).
  conversaBP = await ctx.abrirConversa(B, `${PREFIXO}_p`);
});

after(() => ctx.encerrar());

describe("cliente ↔ entregador pelas Conversas de sempre", () => {
  it("os dois abrem a MESMA conversa direta e trocam mensagens sem bloqueio", async () => {
    assert.equal(await ctx.abrirConversa(P, `${PREFIXO}_b`), conversaBP);
    assert.equal((await enviar(B, conversaBP, "Oi Paulo, portão azul")).statusCode, 201);
    assert.equal((await enviar(P, conversaBP, "Chego em 5 min")).statusCode, 201);
    assert.deepEqual(await situacao(B, P), { podeBloquear: true, euBloqueei: false, fuiBloqueado: false });
  });
});

describe("bloqueio de mensagens", () => {
  it("B bloqueia P: ninguém envia para ninguém, nada é gravado, nenhum evento/notificação sai", async () => {
    const [socketB, socketP] = await Promise.all([ctx.conectar(B), ctx.conectar(P)]);
    const novasB = coletar(socketB, EVENTO_MENSAGEM_NOVA);
    const novasP = coletar(socketP, EVENTO_MENSAGEM_NOVA);
    const avisosB = coletar(socketB, EVENTO_NOTIFICACAO_NOVA_MENSAGEM);
    const avisosP = coletar(socketP, EVENTO_NOTIFICACAO_NOVA_MENSAGEM);

    assert.equal((await bloquear(B, P)).statusCode, 200);
    assert.deepEqual(await situacao(B, P), { podeBloquear: true, euBloqueei: true, fuiBloqueado: false });
    assert.deepEqual(await situacao(P, B), { podeBloquear: true, euBloqueei: false, fuiBloqueado: true });

    const antes = await contarMensagens(conversaBP);
    for (const [quem, texto] of [[B, "de B"], [P, "de P"]] as const) {
      const resposta = await enviar(quem, conversaBP, texto);
      assert.equal(resposta.statusCode, 403, resposta.body);
      assert.equal(resposta.json().codigo, "COMUNICACAO_BLOQUEADA");
    }
    await new Promise((resolver) => setTimeout(resolver, 300));
    assert.equal(await contarMensagens(conversaBP), antes, "mensagem recusada não é persistida");
    assert.equal(novasB.length + novasP.length + avisosB.length + avisosP.length, 0, "nem realtime nem notificação");
    socketB.disconnect();
    socketP.disconnect();
  });

  it("editar mensagem antiga também é recusado; o HISTÓRICO continua visível para os dois", async () => {
    const historicoP = (await ctx.api(P, "GET", `/conversas/${conversaBP}/mensagens`)).json() as { mensagens: Array<{ id: string; conteudo: string; remetenteIdentidadeId: string }> };
    assert.ok(historicoP.mensagens.some((mensagem) => mensagem.conteudo === "Oi Paulo, portão azul"));
    const minha = historicoP.mensagens.find((mensagem) => mensagem.remetenteIdentidadeId === P.identidadeId);
    const edicao = await ctx.api(P, "PATCH", `/conversas/${conversaBP}/mensagens/${minha?.id}`, { conteudo: "editada" });
    assert.equal(edicao.statusCode, 403);
    const historicoB = (await ctx.api(B, "GET", `/conversas/${conversaBP}/mensagens`)).json() as { mensagens: unknown[] };
    assert.equal(historicoB.mensagens.length, historicoP.mensagens.length);
  });

  it("só quem criou remove o próprio bloqueio: P não desfaz o bloqueio de B", async () => {
    assert.equal((await desbloquear(P, B)).statusCode, 200);
    assert.deepEqual(await situacao(P, B), { podeBloquear: true, euBloqueei: false, fuiBloqueado: true });
    assert.equal((await enviar(P, conversaBP, "ainda bloqueado")).statusCode, 403);
    // Um terceiro também não mexe (e não enxerga) na relação dos dois.
    assert.equal((await desbloquear(C, B)).statusCode, 200);
    assert.deepEqual(await situacao(C, B), { podeBloquear: true, euBloqueei: false, fuiBloqueado: false });
    assert.equal((await enviar(P, conversaBP, "continua bloqueado")).statusCode, 403);
  });

  it("bloqueio mútuo: remover UM ainda mantém bloqueado; remover os dois libera", async () => {
    assert.equal((await bloquear(P, B)).statusCode, 200);
    assert.equal((await desbloquear(B, P)).statusCode, 200);
    assert.deepEqual(await situacao(B, P), { podeBloquear: true, euBloqueei: false, fuiBloqueado: true });
    assert.equal((await enviar(B, conversaBP, "ainda não")).statusCode, 403);
    assert.equal((await desbloquear(P, B)).statusCode, 200);
    assert.equal((await enviar(B, conversaBP, "voltou")).statusCode, 201);
    assert.equal((await enviar(P, conversaBP, "voltou mesmo")).statusCode, 201);
  });

  it("empresa não é bloqueada por bloqueio entre pessoas, e empresa não bloqueia nem é bloqueada", async () => {
    // B bloqueia A (a PESSOA dona da pizzaria): a conversa com a EMPRESA continua funcionando.
    assert.equal((await bloquear(B, A)).statusCode, 200);
    assert.equal((await enviar(B, conversaBPizzaria, "Quero uma pizza")).statusCode, 201);
    assert.equal((await enviar(como(A, pizzaria.identidadeId), conversaBPizzaria, "Claro!")).statusCode, 201);
    const bloquearEmpresa = await ctx.api(B, "POST", "/bloqueios", { identidadeId: pizzaria.identidadeId });
    assert.deepEqual([bloquearEmpresa.statusCode, bloquearEmpresa.json().codigo], [400, "BLOQUEIO_INVALIDO"]);
    assert.equal((await ctx.api(como(A, pizzaria.identidadeId), "POST", "/bloqueios", { identidadeId: B.identidadeId })).statusCode, 403);
    assert.equal((await ctx.api(B, "POST", "/bloqueios", { identidadeId: B.identidadeId })).statusCode, 400);
    assert.equal((await desbloquear(B, A)).statusCode, 200);
  });
});

describe("bloqueio NÃO interfere na operação da entrega", () => {
  async function pedidoPronto(): Promise<Pedido> {
    const criado = await ctx.api(B, "POST", "/pedidos", {
      idCliente: randomUUID(),
      empresaIdentidadeId: pizzaria.identidadeId,
      conversaId: conversaBPizzaria,
      enderecoId: enderecoB,
      itens: [{ produtoId: pizza.id, quantidade: 1 }],
      pagamento: { forma: "cartao" },
    });
    assert.equal(criado.statusCode, 201, criado.body);
    let pedido: Pedido = criado.json();
    for (const status of ["recebido", "em_preparacao"]) {
      const avanco = await ctx.api(A, "POST", `/empresas/${pizzaria.id}/pedidos/${pedido.id}/avancar`, { statusAtual: status });
      assert.equal(avanco.statusCode, 200, avanco.body);
      pedido = avanco.json();
    }
    return pedido;
  }

  it("B bloqueou P e P é de novo o entregador: atribuição, saída, fila, identidade e conclusão funcionam", async () => {
    assert.equal((await bloquear(B, P)).statusCode, 200);
    const pedido = await pedidoPronto();
    // A atribuição não olha bloqueio de mensagens.
    const saidaCriada = await ctx.api(A, "POST", `/empresas/${pizzaria.id}/saidas`, { entregadorId: paulo, pedidoIds: [pedido.id] });
    assert.equal(saidaCriada.statusCode, 201, saidaCriada.body);
    const saida: SaidaEntrega = saidaCriada.json();
    assert.equal((await ctx.api(A, "POST", `/empresas/${pizzaria.id}/saidas/${saida.id}/liberar`)).statusCode, 200);
    assert.equal((await ctx.api(P, "POST", `/entregas/saidas/${saida.id}/iniciar`)).statusCode, 200);

    // O entregador continua vendo quem é o cliente e o destino.
    const vistaP: SaidaEntrega = (await ctx.api(P, "GET", `/entregas/saidas/${saida.id}`)).json();
    assert.equal(vistaP.paradas[0]?.cliente.nomeUsuario, `${PREFIXO}_b`);
    assert.ok(vistaP.paradas[0]?.destino.latitude);

    // A cliente continua vendo quem é o entregador, a fila e o status.
    const acompanhamento: AcompanhamentoPedido = (await ctx.api(B, "GET", `/pedidos/${pedido.id}/acompanhamento`)).json();
    assert.equal(acompanhamento.entregador?.nomeUsuario, `${PREFIXO}_p`);
    assert.equal(acompanhamento.fila.situacao, "indo_ate_voce");

    // Rastreamento segue: a posição do entregador é aceita durante a saída.
    const posicao = await ctx.api(P, "POST", `/entregas/saidas/${saida.id}/posicao`, { latitude: -19.925, longitude: -43.945, precisaoMetros: 10, capturadaEm: new Date().toISOString() });
    assert.ok(posicao.statusCode === 200 || posicao.statusCode === 202 || posicao.statusCode === 204, posicao.body);

    // Mensagem continua bloqueada; a entrega termina normalmente.
    assert.equal((await enviar(P, conversaBP, "cheguei")).statusCode, 403);
    assert.equal((await ctx.api(P, "POST", `/entregas/saidas/${saida.id}/paradas/${pedido.id}/concluir`)).statusCode, 200);
    const final: Pedido = (await ctx.api(B, "GET", `/pedidos/${pedido.id}`)).json();
    assert.equal(final.status, "entregue");
  });
});
