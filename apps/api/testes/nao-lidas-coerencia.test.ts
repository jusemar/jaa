import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
  EVENTO_CONVERSA_NAO_LIDAS,
  conversaDiretaSchema,
  empresaSchema,
  mensagemSchema,
  paginaConversasSchema,
  resumoNaoLidasSchema,
  type EventoConversaNaoLidas,
  type Mensagem,
} from "@jaa/contratos";
import { aguardarAte, coletar, como, criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * REGRESSÃO "badge com não lidas, lista sem": o indicador de Conversas (resumo + evento) e a LISTA
 * (contador por conversa) derivam do MESMO estado persistido. Em todo o ciclo — receber, ler, limpar,
 * apagar, bloquear, desbloquear, pessoa × empresa — a soma da lista é o total do resumo, e toda conversa
 * que o resumo conta está NA lista com o mesmo número.
 */
const ctx = criarAmbienteIntegracao({ telefones: ["+5531987695001", "+5531987695002", "+5531987695003"], prefixoIp: "198.18.95." });

let leitor: Pessoa;
let joao: Pessoa;
let maria: Pessoa;
let leitorComoEmpresa: Pessoa;
let comJoao = "";
let comMaria = "";
let comEmpresa = "";

async function abrir(pessoa: Pessoa, nomeUsuario: string): Promise<string> {
  return conversaDiretaSchema.parse((await ctx.api(pessoa, "POST", "/conversas/diretas", { nomeUsuario })).json()).id;
}
async function enviar(pessoa: Pessoa, conversaId: string, conteudo: string): Promise<Mensagem> {
  const resposta = await ctx.api(pessoa, "POST", `/conversas/${conversaId}/mensagens`, { idCliente: randomUUID(), conteudo });
  assert.ok(resposta.statusCode === 200 || resposta.statusCode === 201, resposta.body);
  return mensagemSchema.parse(resposta.json());
}
async function estado(pessoa: Pessoa) {
  const resumo = resumoNaoLidasSchema.parse((await ctx.api(pessoa, "GET", "/conversas/nao-lidas")).json()).conversas;
  const lista = paginaConversasSchema.parse((await ctx.api(pessoa, "GET", "/conversas")).json()).conversas;
  const global = resumo.reduce((total, item) => total + item.naoLidas, 0);
  const somaLista = lista.reduce((total, item) => total + item.naoLidas, 0);
  // Toda conversa contada pelo indicador está na lista, com o MESMO número.
  for (const contada of resumo) {
    assert.equal(lista.find((item) => item.id === contada.conversaId)?.naoLidas, contada.naoLidas, `conversa ${contada.conversaId} ausente/diferente na lista`);
  }
  assert.equal(somaLista, global, "soma da lista = indicador global");
  const naoLidasDe = (conversaId: string) => lista.find((item) => item.id === conversaId)?.naoLidas ?? 0;
  const abaNaoLidas = lista.filter((item) => item.naoLidas > 0).map((item) => item.id);
  return { global, naoLidasDe, abaNaoLidas };
}
const ler = async (pessoa: Pessoa, conversaId: string, ate: Mensagem) =>
  assert.equal((await ctx.api(pessoa, "POST", `/conversas/${conversaId}/leitura`, { ateMensagemId: ate.id })).statusCode, 200);

before(async () => {
  await ctx.iniciar();
  leitor = await ctx.criarPessoa(0, "nlc_leitor", "Leitor");
  joao = await ctx.criarPessoa(1, "nlc_joao", "João");
  maria = await ctx.criarPessoa(2, "nlc_maria", "Maria");
  const empresa = empresaSchema.parse((await ctx.api(leitor, "POST", "/empresas", { nome: "Loja do Leitor", nomeUsuario: "nlc_loja", slug: "nlc-loja" })).json());
  leitorComoEmpresa = como(leitor, empresa.identidadeId);
  comJoao = await abrir(joao, "nlc_leitor");
  comMaria = await abrir(maria, "nlc_leitor");
  comEmpresa = await abrir(maria, "nlc_loja");
});

after(async () => {
  await ctx.encerrar();
});

describe("não lidas: indicador global e lista sempre coerentes", () => {
  let ultimaDoJoao: Mensagem;
  let ultimaDaMaria: Mensagem;

  it("João manda 3, Maria 1: contadores individuais 3 e 1, global 4, aba 'Não lidas' com as duas — e o realtime acompanha", async () => {
    const socket = await ctx.conectar(leitor);
    const eventos = coletar<EventoConversaNaoLidas>(socket, EVENTO_CONVERSA_NAO_LIDAS);

    await enviar(joao, comJoao, "oi");
    let atual = await estado(leitor);
    assert.equal(atual.naoLidasDe(comJoao), 1);
    assert.equal(atual.global, 1);
    assert.deepEqual(atual.abaNaoLidas, [comJoao]);

    await enviar(joao, comJoao, "tudo bem?");
    ultimaDoJoao = await enviar(joao, comJoao, "responde!");
    ultimaDaMaria = await enviar(maria, comMaria, "oi, sou a Maria");
    atual = await estado(leitor);
    assert.equal(atual.naoLidasDe(comJoao), 3);
    assert.equal(atual.naoLidasDe(comMaria), 1);
    assert.equal(atual.global, 4);
    assert.deepEqual(new Set(atual.abaNaoLidas), new Set([comJoao, comMaria]));

    // Sem F5: o último valor ABSOLUTO emitido por conversa é o mesmo da lista.
    await aguardarAte(() => eventos.some((e) => e.conversaId === comMaria && e.naoLidas === 1) && eventos.some((e) => e.conversaId === comJoao && e.naoLidas === 3));
    assert.equal(eventos.filter((e) => e.conversaId === comJoao).at(-1)?.naoLidas, 3);
    socket.close();
  });

  it("pessoa e empresa da mesma conta não se misturam", async () => {
    await enviar(maria, comEmpresa, "quero um pedido");
    const pessoal = await estado(leitor);
    const empresa = await estado(leitorComoEmpresa);
    assert.equal(pessoal.global, 4);
    assert.equal(pessoal.naoLidasDe(comEmpresa), 0);
    assert.equal(empresa.global, 1);
    assert.deepEqual(empresa.abaNaoLidas, [comEmpresa]);
  });

  it("abrir João zera SÓ João (global 4 → 1); abrir Maria zera o resto", async () => {
    await ler(leitor, comJoao, ultimaDoJoao);
    let atual = await estado(leitor);
    assert.equal(atual.naoLidasDe(comJoao), 0);
    assert.equal(atual.naoLidasDe(comMaria), 1);
    assert.equal(atual.global, 1);
    await ler(leitor, comMaria, ultimaDaMaria);
    atual = await estado(leitor);
    assert.equal(atual.global, 0);
    assert.deepEqual(atual.abaNaoLidas, []);
    // A empresa continua com a dela.
    assert.equal((await estado(leitorComoEmpresa)).global, 1);
  });

  it("limpar e apagar não deixam contador fantasma; mensagem nova depois volta a contar na lista", async () => {
    await enviar(joao, comJoao, "de novo 1");
    await enviar(maria, comMaria, "de novo 2");
    assert.equal((await estado(leitor)).global, 2);
    assert.equal((await ctx.api(leitor, "POST", `/conversas/${comJoao}/limpar`)).statusCode, 204);
    assert.equal((await ctx.api(leitor, "POST", `/conversas/${comMaria}/apagar`)).statusCode, 204);
    assert.equal((await estado(leitor)).global, 0);
    await enviar(maria, comMaria, "voltei");
    const atual = await estado(leitor);
    assert.equal(atual.global, 1);
    assert.deepEqual(atual.abaNaoLidas, [comMaria]);
  });

  it("bloquear e desbloquear não quebram a coerência (leitura privada durante o bloqueio incluída)", async () => {
    const naMaria = (await estado(leitor)).naoLidasDe(comMaria);
    assert.equal((await ctx.api(leitor, "POST", "/bloqueios", { identidadeId: maria.identidadeId })).statusCode < 300, true);
    assert.equal((await estado(leitor)).naoLidasDe(comMaria), naMaria, "bloquear não muda a contagem");
    const historico = (await ctx.api(leitor, "GET", `/conversas/${comMaria}/mensagens`)).json() as { mensagens: Mensagem[] };
    await ler(leitor, comMaria, historico.mensagens.at(-1)!);
    assert.equal((await estado(leitor)).global, 0);
    assert.equal((await ctx.api(leitor, "DELETE", `/bloqueios/${maria.identidadeId}`)).statusCode < 300, true);
    await enviar(maria, comMaria, "depois do desbloqueio");
    const atual = await estado(leitor);
    assert.equal(atual.global, 1);
    assert.equal(atual.naoLidasDe(comMaria), 1);
  });
});
