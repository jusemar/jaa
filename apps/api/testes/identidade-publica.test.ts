import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { identidadePublicaSchema, perfilPublicoSchema, type ConversaDireta, type Empresa, type IdentidadePublica } from "@jaa/contratos";
import { como, criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * LINK DO JAA: `GET /publico/identidades/:nomeUsuario` (sem sessão) + o que acontece depois de entrar
 * (a conversa direta de sempre, sem duplicar) + o perfil público entre contas, com a privacidade.
 */

const PREFIXO = `lnk${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({ telefones: ["+5531987652601", "+5531987652602"], prefixoIp: "198.18.26." });

let dono: Pessoa;
let cliente: Pessoa;
let pizzaria: Empresa;
let papelaria: Empresa;

const publica = (nomeUsuario: string, pessoa: Pessoa | null = null) => ctx.api(pessoa, "GET", `/publico/identidades/${encodeURIComponent(nomeUsuario)}`);

before(async () => {
  await ctx.iniciar();
  dono = await ctx.criarPessoa(0, `${PREFIXO}_dono`, "Mauro Dono");
  cliente = await ctx.criarPessoa(1, `${PREFIXO}_cli`, "Clara Cliente");
  pizzaria = (await ctx.api(dono, "POST", "/empresas", { nome: "Pizzaria do Link", nomeUsuario: `${PREFIXO}_pizza`, slug: `${PREFIXO}-pizza` })).json();
  papelaria = (await ctx.api(dono, "POST", "/empresas", { nome: "Papelaria Sem Cardápio", nomeUsuario: `${PREFIXO}_papel`, slug: `${PREFIXO}-papel` })).json();
  const produto = await ctx.api(dono, "POST", `/empresas/${pizzaria.id}/produtos`, { nome: "Pizza Calabresa", precoCentavos: 3990 });
  assert.equal(produto.statusCode, 201, produto.body);
  const esgotado = await ctx.api(dono, "POST", `/empresas/${papelaria.id}/produtos`, { nome: "Caderno esgotado", precoCentavos: 1500, disponibilidade: "indisponivel" });
  assert.equal(esgotado.statusCode, 201, esgotado.body);
  // Perfil da empresa e da pessoa preenchidos, para a privacidade ter o que esconder.
  assert.equal((await ctx.api(como(dono, pizzaria.identidadeId), "PATCH", "/perfil", { fraseStatus: "Entregamos até 23h", sobre: "Pizza de forno a lenha desde 2010." })).statusCode, 200);
  assert.equal((await ctx.api(dono, "PATCH", "/perfil", { fraseStatus: "Respondo à noite", sobre: "Dono da pizzaria." })).statusCode, 200);
});

after(() => ctx.encerrar());

describe("identidade pública pelo @usuario (visitante sem conta)", () => {
  it("empresa com cardápio: reconhecível sem sessão, com `temCardapio` e só os campos do contrato", async () => {
    const resposta = await publica(`${PREFIXO}_pizza`);
    assert.equal(resposta.statusCode, 200, resposta.body);
    const dados: IdentidadePublica = identidadePublicaSchema.parse(resposta.json());
    assert.deepEqual(dados, {
      identidadeId: pizzaria.identidadeId,
      tipo: "empresarial",
      nomeExibicao: "Pizzaria do Link",
      nomeUsuario: `${PREFIXO}_pizza`,
      fotoUrl: null,
      // Padrão de privacidade do status = "contatos": visitante não é contato.
      fraseStatus: null,
      sobre: "Pizza de forno a lenha desde 2010.",
      temCardapio: true,
    });
    for (const proibido of ["empresaId", "slug", "telefone", "email", "cidade", "status", "papel", "usuarioId"]) assert.equal(proibido in resposta.json(), false, proibido);
  });

  it("frase de status só aparece para o visitante quando o dono a deixou visível para TODOS", async () => {
    assert.equal((await ctx.api(como(dono, pizzaria.identidadeId), "PATCH", "/perfil/privacidade", { visibilidadeStatus: "todos" })).statusCode, 200);
    assert.equal((await publica(`${PREFIXO}_pizza`)).json().fraseStatus, "Entregamos até 23h");
    assert.equal((await ctx.api(como(dono, pizzaria.identidadeId), "PATCH", "/perfil/privacidade", { visibilidadeStatus: "ninguem" })).statusCode, 200);
    assert.equal((await publica(`${PREFIXO}_pizza`)).json().fraseStatus, null);
  });

  it("empresa só com produto indisponível não tem cardápio; a conversa continua possível", async () => {
    const dados: IdentidadePublica = (await publica(`${PREFIXO}_papel`)).json();
    assert.equal(dados.temCardapio, false);
    assert.equal(dados.tipo, "empresarial");
  });

  it("pessoa: sem cardápio e sem o 'sobre' para quem não tem conta", async () => {
    const dados: IdentidadePublica = (await publica(`${PREFIXO}_dono`)).json();
    assert.deepEqual({ tipo: dados.tipo, nome: dados.nomeExibicao, sobre: dados.sobre, frase: dados.fraseStatus, temCardapio: dados.temCardapio }, { tipo: "pessoal", nome: "Mauro Dono", sobre: null, frase: null, temCardapio: false });
  });

  it("aceita o @ e maiúsculas do link colado; a resposta é a mesma com ou sem sessão", async () => {
    const comArroba = await publica(`@${PREFIXO}_PIZZA`.replace(PREFIXO, PREFIXO.toUpperCase()));
    assert.equal(comArroba.statusCode, 200, comArroba.body);
    assert.equal(comArroba.json().identidadeId, pizzaria.identidadeId);
    assert.deepEqual((await publica(`${PREFIXO}_pizza`, cliente)).json(), (await publica(`${PREFIXO}_pizza`)).json());
  });

  it("inexistente, fora do formato e id interno no lugar do @usuario: sempre o mesmo 404", async () => {
    for (const valor of [`${PREFIXO}_ninguem`, "a", "nome com espaço", pizzaria.identidadeId, "../../conta"]) {
      const resposta = await publica(valor);
      assert.equal(resposta.statusCode, 404, `${valor}: ${resposta.body}`);
      assert.equal(resposta.json().codigo, "IDENTIDADE_NAO_ENCONTRADA");
    }
  });
});

describe("depois de entrar pelo link", () => {
  it("visitante não conversa: abrir a conversa exige sessão", async () => {
    const resposta = await ctx.api(null, "POST", "/conversas/diretas", { nomeUsuario: `${PREFIXO}_pizza` });
    assert.equal(resposta.statusCode, 401, resposta.body);
  });

  it("autenticado abre a conversa com a identidade do link; abrir de novo NÃO duplica", async () => {
    const primeira = await ctx.api(cliente, "POST", "/conversas/diretas", { nomeUsuario: `${PREFIXO}_pizza` });
    assert.equal(primeira.statusCode, 201, primeira.body);
    const conversa: ConversaDireta = primeira.json();
    assert.ok(conversa.participantes.some((participante) => participante.identidadeId === pizzaria.identidadeId));

    const segunda = await ctx.api(cliente, "POST", "/conversas/diretas", { nomeUsuario: `${PREFIXO}_pizza` });
    assert.equal(segunda.statusCode, 200, segunda.body);
    assert.equal(segunda.json().id, conversa.id);
  });

  it("o dono abrindo o próprio link não cria conversa consigo mesmo", async () => {
    const resposta = await ctx.api(dono, "POST", "/conversas/diretas", { nomeUsuario: `${PREFIXO}_dono` });
    assert.equal(resposta.statusCode, 400);
    assert.equal(resposta.json().codigo, "CONVERSA_CONSIGO_MESMO");
  });
});

describe("perfil público entre contas (cabeçalho da conversa)", () => {
  const perfilDe = async (identidadeId: string, quem: Pessoa) => {
    const resposta = await ctx.api(quem, "GET", `/identidades/${identidadeId}/perfil`);
    assert.equal(resposta.statusCode, 200, resposta.body);
    return perfilPublicoSchema.parse(resposta.json());
  };

  it("'sobre' aparece para quem tem conta; a frase de status segue a privacidade do dono", async () => {
    const identidadeDono = dono.identidadeId;
    // Padrão "contatos": a cliente não está na agenda do dono.
    let visto = await perfilDe(identidadeDono, cliente);
    assert.deepEqual({ id: visto.identidadeId, sobre: visto.sobre, frase: visto.fraseStatus }, { id: identidadeDono, sobre: "Dono da pizzaria.", frase: null });

    assert.equal((await ctx.api(dono, "PATCH", "/perfil/privacidade", { visibilidadeStatus: "todos" })).statusCode, 200);
    visto = await perfilDe(identidadeDono, cliente);
    assert.equal(visto.fraseStatus, "Respondo à noite");
  });

  it("campos vazios chegam como null (a tela não tem o que quebrar)", async () => {
    const visto = await perfilDe(cliente.identidadeId, dono);
    assert.deepEqual({ sobre: visto.sobre, frase: visto.fraseStatus, foto: visto.fotoUrl }, { sobre: null, frase: null, foto: null });
  });

  it("sem sessão o perfil entre contas não existe", async () => {
    assert.equal((await ctx.api(null, "GET", `/identidades/${dono.identidadeId}/perfil`)).statusCode, 401);
  });
});
