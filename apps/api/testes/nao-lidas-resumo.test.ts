import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { conversaDiretaSchema, empresaSchema, mensagemSchema, paginaConversasSchema, resumoNaoLidasSchema, type Mensagem } from "@jaa/contratos";
import { como, criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * RESUMO DE NÃO LIDAS (indicador de Conversas em qualquer área): mesma derivação da lista — marcador de
 * leitura persistido —, sem contador paralelo, sempre da identidade ATUANTE.
 */
const ctx = criarAmbienteIntegracao({ telefones: ["+5531987694001", "+5531987694002", "+5531987694003"], prefixoIp: "198.18.94." });

let ana: Pessoa;
let beto: Pessoa;
let caio: Pessoa;
let betoComoEmpresa: Pessoa;
let empresaUsuario = "";

async function chamar(pessoa: Pessoa, metodo: "GET" | "POST", caminho: string, corpo?: unknown) {
  const resposta = await ctx.api(pessoa, metodo, caminho, corpo);
  return { status: resposta.statusCode, corpo: resposta.json() as unknown };
}
async function abrir(pessoa: Pessoa, nomeUsuario: string): Promise<string> {
  return conversaDiretaSchema.parse((await chamar(pessoa, "POST", "/conversas/diretas", { nomeUsuario })).corpo).id;
}
async function enviar(pessoa: Pessoa, conversaId: string, conteudo: string, idCliente = randomUUID()): Promise<Mensagem> {
  const resposta = await chamar(pessoa, "POST", `/conversas/${conversaId}/mensagens`, { idCliente, conteudo });
  assert.ok(resposta.status === 200 || resposta.status === 201, JSON.stringify(resposta.corpo));
  return mensagemSchema.parse(resposta.corpo);
}
async function resumo(pessoa: Pessoa): Promise<Record<string, number>> {
  const lido = resumoNaoLidasSchema.parse((await chamar(pessoa, "GET", "/conversas/nao-lidas")).corpo);
  return Object.fromEntries(lido.conversas.map((item) => [item.conversaId, item.naoLidas]));
}

let comAna = "";
let comCaio = "";
let comEmpresa = "";
let ultimaDaAna: Mensagem;

before(async () => {
  await ctx.iniciar();
  ana = await ctx.criarPessoa(0, "nl_ana", "Ana");
  beto = await ctx.criarPessoa(1, "nl_beto", "Beto");
  caio = await ctx.criarPessoa(2, "nl_caio", "Caio");
  const empresa = empresaSchema.parse((await chamar(beto, "POST", "/empresas", { nome: "Loja do Beto", nomeUsuario: "nl_loja_beto", slug: "nl-loja-beto" })).corpo);
  betoComoEmpresa = como(beto, empresa.identidadeId);
  empresaUsuario = empresa.nomeUsuario;

  comAna = await abrir(ana, "nl_beto");
  await enviar(ana, comAna, "Oi, Beto");
  ultimaDaAna = await enviar(ana, comAna, "Tudo bem?");
  comCaio = await abrir(caio, "nl_beto");
  await enviar(caio, comCaio, "Beto, uma pergunta");
  // Para a EMPRESA do Beto (outra identidade da mesma conta).
  comEmpresa = await abrir(ana, empresaUsuario);
  await enviar(ana, comEmpresa, "Quero fazer um pedido");
});

after(async () => {
  await ctx.encerrar();
});

describe("resumo de não lidas", () => {
  it("conta só mensagens RECEBIDAS, por conversa (2 na mesma conversa, 1 em outra)", async () => {
    assert.deepEqual(await resumo(beto), { [comAna]: 2, [comCaio]: 1 });
  });

  it("quem enviou não tem não lidas das próprias mensagens", async () => {
    assert.deepEqual(await resumo(ana), {});
  });

  it("é o mesmo número da lista (mesma derivação, sem contador paralelo) e persiste entre leituras", async () => {
    const lista = paginaConversasSchema.parse((await chamar(beto, "GET", "/conversas")).corpo);
    const daLista = Object.fromEntries(lista.conversas.filter((item) => item.naoLidas > 0).map((item) => [item.id, item.naoLidas]));
    assert.deepEqual(await resumo(beto), daLista);
    // "F5": nada no servidor muda por ler o resumo.
    assert.deepEqual(await resumo(beto), daLista);
  });

  it("PESSOA e EMPRESA da mesma conta não se misturam", async () => {
    assert.equal((await resumo(beto))[comEmpresa], undefined);
    assert.deepEqual(await resumo(betoComoEmpresa), { [comEmpresa]: 1 });
  });

  it("ler uma conversa limpa SÓ ela; a outra continua não lida", async () => {
    const leitura = await chamar(beto, "POST", `/conversas/${comAna}/leitura`, { ateMensagemId: ultimaDaAna.id });
    assert.equal(leitura.status, 200, JSON.stringify(leitura.corpo));
    assert.deepEqual(await resumo(beto), { [comCaio]: 1 });
    assert.deepEqual(await resumo(betoComoEmpresa), { [comEmpresa]: 1 });
  });

  it("reenviar a MESMA mensagem (mesmo idCliente) não cria outra não lida", async () => {
    const idCliente = randomUUID();
    await enviar(caio, comCaio, "Repetida", idCliente);
    await enviar(caio, comCaio, "Repetida", idCliente);
    assert.deepEqual(await resumo(beto), { [comCaio]: 2 });
  });
});
