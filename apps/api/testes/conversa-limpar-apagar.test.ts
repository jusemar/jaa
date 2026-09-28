import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
  EVENTO_CONVERSA_OBSERVAR,
  EVENTO_MENSAGENS_ENTREGUES,
  EVENTO_MENSAGENS_LIDAS,
  EVENTO_DIGITANDO_ATUALIZADO,
  EVENTO_DIGITANDO_INFORMAR,
  paginaConversasSchema,
  paginaMensagensSchema,
  type Empresa,
  type Pedido,
  type Produto,
  type RespostaEventoRealtime,
  type RespostaObservarConversa,
} from "@jaa/contratos";
import { aguardarAte, coletar, como, criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * LIMPAR / APAGAR conversa (estado SÓ de quem executa) e sinais sociais sob bloqueio ("digitando" e
 * presença). A = Ana; B = Beto; C = Caio (de fora); D = dona da Pizzaria.
 */
const PREFIXO = `lap${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987696001", "+5531987696002", "+5531987696003", "+5531987696004"],
  prefixoIp: "198.18.96.",
});

let A: Pessoa;
let B: Pessoa;
let C: Pessoa;
let D: Pessoa;
let conversaAB = "";

const enviar = async (pessoa: Pessoa, conversaId: string, conteudo: string) => {
  const resposta = await ctx.api(pessoa, "POST", `/conversas/${conversaId}/mensagens`, { idCliente: randomUUID(), conteudo });
  assert.equal(resposta.statusCode, 201, resposta.body);
  return resposta.json() as { id: string };
};
const historico = async (pessoa: Pessoa, conversaId: string) =>
  paginaMensagensSchema.parse((await ctx.api(pessoa, "GET", `/conversas/${conversaId}/mensagens`)).json()).mensagens.map((mensagem) => mensagem.conteudo);
const itemDaLista = async (pessoa: Pessoa, conversaId: string) =>
  paginaConversasSchema.parse((await ctx.api(pessoa, "GET", "/conversas")).json()).conversas.find((item) => item.id === conversaId);

before(async () => {
  await ctx.iniciar();
  A = await ctx.criarPessoa(0, `${PREFIXO}_a`, "Ana");
  B = await ctx.criarPessoa(1, `${PREFIXO}_b`, "Beto");
  C = await ctx.criarPessoa(2, `${PREFIXO}_c`, "Caio");
  D = await ctx.criarPessoa(3, `${PREFIXO}_d`, "Dona");
  conversaAB = await ctx.abrirConversa(A, `${PREFIXO}_b`);
});

after(() => ctx.encerrar());

describe("limpar conversa", () => {
  it("some só para quem limpou; a conversa fica na lista, sem prévia e sem não lidas; o outro não perde nada", async () => {
    await enviar(A, conversaAB, "oi Beto");
    await enviar(B, conversaAB, "oi Ana");
    assert.equal((await ctx.api(A, "POST", `/conversas/${conversaAB}/limpar`)).statusCode, 204);

    assert.deepEqual(await historico(A, conversaAB), []);
    const naLista = await itemDaLista(A, conversaAB);
    assert.deepEqual([naLista?.ultimaMensagem, naLista?.naoLidas], [null, 0]);
    assert.deepEqual((await historico(B, conversaAB)).sort(), ["oi Ana", "oi Beto"]);
    assert.equal((await itemDaLista(B, conversaAB))?.ultimaMensagem?.conteudo, "oi Ana");
  });

  it("mensagens NOVAS aparecem normalmente depois da limpeza", async () => {
    await enviar(B, conversaAB, "depois da limpeza");
    assert.deepEqual(await historico(A, conversaAB), ["depois da limpeza"]);
    const naLista = await itemDaLista(A, conversaAB);
    assert.deepEqual([naLista?.ultimaMensagem?.conteudo, naLista?.naoLidas], ["depois da limpeza", 1]);
    assert.equal((await historico(B, conversaAB)).length, 3);
  });

  it("quem não participa não limpa nem apaga (404, sem revelar a conversa)", async () => {
    assert.equal((await ctx.api(C, "POST", `/conversas/${conversaAB}/limpar`)).statusCode, 404);
    assert.equal((await ctx.api(C, "POST", `/conversas/${conversaAB}/apagar`)).statusCode, 404);
    assert.equal((await historico(B, conversaAB)).length, 3);
  });
});

describe("apagar conversa", () => {
  it("sai da lista só de quem apagou; nova mensagem a traz de volta, só com o que é novo", async () => {
    assert.equal((await ctx.api(A, "POST", `/conversas/${conversaAB}/apagar`)).statusCode, 204);
    assert.equal(await itemDaLista(A, conversaAB), undefined);
    assert.ok(await itemDaLista(B, conversaAB), "o outro continua vendo a conversa");
    assert.equal((await historico(B, conversaAB)).length, 3);

    await enviar(B, conversaAB, "voltei");
    assert.equal((await itemDaLista(A, conversaAB))?.ultimaMensagem?.conteudo, "voltei");
    assert.deepEqual(await historico(A, conversaAB), ["voltei"]);
  });

  it("reabrir a conversa com a pessoa também a traz de volta para a lista", async () => {
    assert.equal((await ctx.api(A, "POST", `/conversas/${conversaAB}/apagar`)).statusCode, 204);
    assert.equal(await itemDaLista(A, conversaAB), undefined);
    assert.equal(await ctx.abrirConversa(A, `${PREFIXO}_b`), conversaAB);
    const reaberta = await itemDaLista(A, conversaAB);
    assert.ok(reaberta);
    assert.equal(reaberta.ultimaMensagem, null);
  });

  it("limpar/apagar não mexem em pedido nem são confundidos entre pessoa e empresa", async () => {
    const pizzaria: Empresa = (await ctx.api(D, "POST", "/empresas", { nome: "Pizzaria LAP", nomeUsuario: `${PREFIXO}_pizza`, slug: `${PREFIXO}-pizza` })).json();
    const pizza: Produto = (await ctx.api(D, "POST", `/empresas/${pizzaria.id}/produtos`, { nome: "Pizza", precoCentavos: 3000 })).json();
    const endereco = await ctx.criarEnderecoConfirmado(B, { apelido: "Casa" });
    const conversaBP = await ctx.abrirConversa(B, `${PREFIXO}_pizza`);
    const criado = await ctx.api(B, "POST", "/pedidos", {
      idCliente: randomUUID(),
      empresaIdentidadeId: pizzaria.identidadeId,
      conversaId: conversaBP,
      enderecoId: endereco,
      itens: [{ produtoId: pizza.id, quantidade: 1 }],
      pagamento: { forma: "cartao" },
    });
    assert.equal(criado.statusCode, 201, criado.body);
    const pedido: Pedido = criado.json();

    // O cliente apaga a conversa: o pedido continua existindo e a EMPRESA ainda vê o card.
    assert.equal((await ctx.api(B, "POST", `/conversas/${conversaBP}/apagar`)).statusCode, 204);
    assert.equal((await ctx.api(B, "GET", `/pedidos/${pedido.id}`)).statusCode, 200);
    const empresa = como(D, pizzaria.identidadeId);
    assert.ok((await itemDaLista(empresa, conversaBP))?.ultimaMensagem, "para a empresa nada mudou");
    const avancou = await ctx.api(D, "POST", `/empresas/${pizzaria.id}/pedidos/${pedido.id}/avancar`, { statusAtual: "recebido" });
    assert.equal(avancou.statusCode, 200, avancou.body);

    // A PESSOA dona não limpa a conversa da EMPRESA (não participa dela como pessoa).
    assert.equal((await ctx.api(D, "POST", `/conversas/${conversaBP}/limpar`)).statusCode, 404);
    // Agindo como a empresa, limpa só para a empresa; o cliente não é afetado.
    assert.equal((await ctx.api(empresa, "POST", `/conversas/${conversaBP}/limpar`)).statusCode, 204);
    assert.deepEqual(await historico(empresa, conversaBP), []);
  });
});

describe("sinais sociais atravessando bloqueio", () => {
  const observar = (socket: Awaited<ReturnType<typeof ctx.conectar>>) =>
    socket.timeout(2000).emitWithAck(EVENTO_CONVERSA_OBSERVAR, { conversaId: conversaAB }) as Promise<RespostaObservarConversa>;
  const digitar = (socket: Awaited<ReturnType<typeof ctx.conectar>>) =>
    socket.timeout(2000).emitWithAck(EVENTO_DIGITANDO_INFORMAR, { conversaId: conversaAB, digitando: true }) as Promise<RespostaEventoRealtime>;

  it("com bloqueio (qualquer sentido) o servidor recusa 'digitando' e esconde a presença; desbloqueio devolve", async () => {
    const [socketA, socketB] = await Promise.all([ctx.conectar(A), ctx.conectar(B)]);
    const digitandoParaA = coletar(socketA, EVENTO_DIGITANDO_ATUALIZADO);
    const digitandoParaB = coletar(socketB, EVENTO_DIGITANDO_ATUALIZADO);

    assert.equal((await ctx.api(A, "POST", "/bloqueios", { identidadeId: B.identidadeId })).statusCode, 200);
    const vistaB = await observar(socketB);
    await observar(socketA);
    assert.ok(vistaB.ok);
    assert.equal(vistaB.ok && vistaB.presencas.length, 0, "presença de quem bloqueou não aparece");

    // Cliente "modificado" de B emitindo direto e o próprio A (quem bloqueou): os dois recusados.
    assert.deepEqual(await digitar(socketB), { ok: false, codigo: "COMUNICACAO_BLOQUEADA" });
    assert.deepEqual(await digitar(socketA), { ok: false, codigo: "COMUNICACAO_BLOQUEADA" });
    await new Promise((resolver) => setTimeout(resolver, 300));
    assert.equal(digitandoParaA.length + digitandoParaB.length, 0);
    // Mensagem continua recusada no servidor.
    assert.equal((await ctx.api(B, "POST", `/conversas/${conversaAB}/mensagens`, { idCliente: randomUUID(), conteudo: "x" })).statusCode, 403);

    // Desbloqueio (sem bloqueio inverso): "digitando" volta a chegar.
    assert.equal((await ctx.api(A, "DELETE", `/bloqueios/${B.identidadeId}`)).statusCode, 200);
    await observar(socketA);
    await observar(socketB);
    assert.deepEqual(await digitar(socketB), { ok: true });
    await aguardarAte(() => digitandoParaA.length > 0);

    // Bloqueio INVERSO (B bloqueia A): de novo recusado para os dois.
    assert.equal((await ctx.api(B, "POST", "/bloqueios", { identidadeId: A.identidadeId })).statusCode, 200);
    assert.deepEqual(await digitar(socketA), { ok: false, codigo: "COMUNICACAO_BLOQUEADA" });
    assert.equal((await ctx.api(A, "POST", `/conversas/${conversaAB}/mensagens`, { idCliente: randomUUID(), conteudo: "y" })).statusCode, 403);
    assert.equal((await ctx.api(B, "DELETE", `/bloqueios/${A.identidadeId}`)).statusCode, 200);
    socketA.disconnect();
    socketB.disconnect();
  });
});

describe("✓✓ (entregue/lida) não atravessam bloqueio", () => {
  it("sob bloqueio: recebimento e leitura novos não viram ✓✓ nem evento para o outro; o contador de quem leu zera; desbloqueio devolve", async () => {
    const conversaAC = await ctx.abrirConversa(A, `${PREFIXO}_c`);
    const mensagem = await enviar(C, conversaAC, "mensagem antes do bloqueio");
    const socketC = await ctx.conectar(C);
    const entregues = coletar(socketC, EVENTO_MENSAGENS_ENTREGUES);
    const lidas = coletar(socketC, EVENTO_MENSAGENS_LIDAS);

    assert.equal((await ctx.api(A, "POST", "/bloqueios", { identidadeId: C.identidadeId })).statusCode, 200);
    // "Cliente alterado": A chama a API direto, confirmando recebimento e leitura.
    assert.equal((await ctx.api(A, "POST", "/mensagens/recebimentos", { mensagemIds: [mensagem.id] })).statusCode, 200);
    assert.equal((await ctx.api(A, "POST", `/conversas/${conversaAC}/leitura`, { ateMensagemId: mensagem.id })).statusCode, 200);
    await new Promise((resolver) => setTimeout(resolver, 300));

    assert.equal(entregues.length + lidas.length, 0, "nada de ✓✓ em tempo real para quem enviou");
    const vistaC = paginaMensagensSchema.parse((await ctx.api(C, "GET", `/conversas/${conversaAC}/mensagens`)).json()).mensagens;
    assert.equal(vistaC.find((item) => item.id === mensagem.id)?.estado, "enviada", "nem ao reler o histórico");
    // Quem leu não fica com contador preso.
    assert.equal((await itemDaLista(A, conversaAC))?.naoLidas, 0);

    // Desbloqueou: a leitura nova volta a virar ✓✓ para o outro.
    assert.equal((await ctx.api(A, "DELETE", `/bloqueios/${C.identidadeId}`)).statusCode, 200);
    assert.equal((await ctx.api(A, "POST", `/conversas/${conversaAC}/leitura`, { ateMensagemId: mensagem.id })).statusCode, 200);
    await aguardarAte(() => lidas.length > 0);
    const depois = paginaMensagensSchema.parse((await ctx.api(C, "GET", `/conversas/${conversaAC}/mensagens`)).json()).mensagens;
    assert.equal(depois.find((item) => item.id === mensagem.id)?.estado, "lida");
    socketC.disconnect();
  });
});
