import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { preferenciasIdentidade } from "@jaa/banco/schema";
import { LIMITE_RESULTADOS_EXTERNOS, type Contato, type Empresa, type ListaContatos, type RespostaBusca } from "@jaa/contratos";
import { como, criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * Integração REAL de CONTATOS e BUSCA.
 * A = Junior (dono da agenda e de uma empresa); B, C, D = outras pessoas.
 */

const PREFIXO = `con${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987656001", "+5531987656002", "+5531987656003", "+5531987656004"],
  prefixoIp: "198.18.19.",
});

let A: Pessoa;
let B: Pessoa;
let C: Pessoa;
let D: Pessoa;
let pizzaria: Empresa;

const buscar = (pessoa: Pessoa, termo: string) => ctx.api(pessoa, "GET", `/busca?termo=${encodeURIComponent(termo)}`);

before(async () => {
  await ctx.iniciar();
  A = await ctx.criarPessoa(0, `${PREFIXO}_junior`, "Junior Rocha");
  B = await ctx.criarPessoa(1, `${PREFIXO}_maria`, "Maria Silva");
  C = await ctx.criarPessoa(2, `${PREFIXO}_carlos`, "Carlos Souza");
  D = await ctx.criarPessoa(3, `${PREFIXO}_dora`, "Dora Lima");
  pizzaria = (await ctx.api(A, "POST", "/empresas", { nome: "Pizzaria Contato", nomeUsuario: `${PREFIXO}_pizza`, slug: `${PREFIXO}-pizzaria` })).json();
});

after(() => ctx.encerrar());

describe("agenda de contatos", () => {
  it("salvar é UNILATERAL: entra na minha agenda e não me coloca na do outro", async () => {
    const salvo = await ctx.api(A, "POST", "/contatos", { identidadeId: B.identidadeId, apelido: "Maria do trabalho" });
    assert.equal(salvo.statusCode, 201, salvo.body);
    const contato: Contato = salvo.json();
    assert.equal(contato.identidade.nomeExibicao, "Maria Silva");
    assert.equal(contato.apelido, "Maria do trabalho");
    // Identidade pública apenas: nada de telefone, conta ou e-mail.
    assert.deepEqual(Object.keys(contato.identidade).sort(), ["identidadeId", "nomeExibicao", "nomeUsuario", "tipo"]);
    assert.equal(JSON.stringify(contato).includes("+55"), false);

    const minha: ListaContatos = (await ctx.api(A, "GET", "/contatos")).json();
    assert.ok(minha.contatos.some((item) => item.identidade.identidadeId === B.identidadeId));

    const dela: ListaContatos = (await ctx.api(B, "GET", "/contatos")).json();
    assert.deepEqual(dela.contatos, [], "salvar alguém NÃO cria a relação inversa");
  });

  it("a agenda é por IDENTIDADE: a da empresa não se mistura com a pessoal", async () => {
    const comoEmpresa = como(A, pizzaria.identidadeId);
    const daEmpresa: ListaContatos = (await ctx.api(comoEmpresa, "GET", "/contatos")).json();
    assert.deepEqual(daEmpresa.contatos, [], "a empresa começa com agenda vazia mesmo com a pessoal cheia");

    assert.equal((await ctx.api(comoEmpresa, "POST", "/contatos", { identidadeId: C.identidadeId })).statusCode, 201);
    const depoisEmpresa: ListaContatos = (await ctx.api(comoEmpresa, "GET", "/contatos")).json();
    assert.deepEqual(depoisEmpresa.contatos.map((item) => item.identidade.nomeExibicao), ["Carlos Souza"]);

    const pessoal: ListaContatos = (await ctx.api(A, "GET", "/contatos")).json();
    assert.equal(pessoal.contatos.some((item) => item.identidade.identidadeId === C.identidadeId), false, "o contato da empresa não vaza para a agenda pessoal");
  });

  it("salvar de novo atualiza o apelido; remover tira só da minha agenda", async () => {
    assert.equal((await ctx.api(A, "POST", "/contatos", { identidadeId: B.identidadeId, apelido: "Maria" })).statusCode, 201);
    const lista: ListaContatos = (await ctx.api(A, "GET", "/contatos")).json();
    assert.equal(lista.contatos.filter((item) => item.identidade.identidadeId === B.identidadeId).length, 1, "não duplica");
    assert.equal(lista.contatos.find((item) => item.identidade.identidadeId === B.identidadeId)?.apelido, "Maria");

    assert.equal((await ctx.api(A, "DELETE", `/contatos/${B.identidadeId}`)).statusCode, 200);
    const depois: ListaContatos = (await ctx.api(A, "GET", "/contatos")).json();
    assert.equal(depois.contatos.some((item) => item.identidade.identidadeId === B.identidadeId), false);
    // Remover algo que não está na agenda é 404 (e não mexe em ninguém).
    assert.equal((await ctx.api(A, "DELETE", `/contatos/${D.identidadeId}`)).statusCode, 404);
  });

  it("não dá para salvar a si mesmo nem identidade inexistente", async () => {
    assert.equal((await ctx.api(A, "POST", "/contatos", { identidadeId: A.identidadeId })).statusCode, 400);
    assert.equal((await ctx.api(A, "POST", "/contatos", { identidadeId: randomUUID() })).statusCode, 404);
  });
});

describe("busca única", () => {
  it("meus contatos vêm primeiro e ficam marcados como contato", async () => {
    await ctx.api(A, "POST", "/contatos", { identidadeId: D.identidadeId, apelido: "Dora" });
    const resultado: RespostaBusca = (await buscar(A, "Dora")).json();

    assert.ok(resultado.contatos.some((item) => item.identidade.identidadeId === D.identidadeId));
    assert.equal(resultado.contatos[0]?.ehContato, true);
    assert.equal(resultado.externos.some((item) => item.identidade.identidadeId === D.identidadeId), false, "quem já é contato não se repete na descoberta");
  });

  it("encontra por nome e por @usuario, e nunca devolve telefone", async () => {
    const porNome: RespostaBusca = (await buscar(B, "Carlos")).json();
    assert.ok(porNome.externos.some((item) => item.identidade.nomeExibicao === "Carlos Souza"));

    const porUsuario: RespostaBusca = (await buscar(B, `${PREFIXO}_carlos`)).json();
    assert.ok(porUsuario.externos.some((item) => item.identidade.nomeUsuario === `${PREFIXO}_carlos`));
    assert.equal(JSON.stringify(porUsuario).includes("+55"), false, "telefone nunca aparece no resultado");
    // Empresa ativa também é encontrada (é uma identidade do Jaa).
    const empresaEncontrada: RespostaBusca = (await buscar(B, "Pizzaria Contato")).json();
    assert.ok(empresaEncontrada.externos.some((item) => item.identidade.tipo === "empresarial"));
  });

  it("descoberta externa é limitada e nunca devolve a própria identidade", async () => {
    const resultado: RespostaBusca = (await buscar(A, PREFIXO)).json();
    assert.ok(resultado.externos.length <= LIMITE_RESULTADOS_EXTERNOS, `externos: ${resultado.externos.length}`);
    assert.equal(
      [...resultado.contatos, ...resultado.externos].some((item) => item.identidade.identidadeId === A.identidadeId),
      false,
      "eu nunca apareço na minha própria busca",
    );
  });

  it("busca por TELEFONE só encontra quem optou por isso", async () => {
    const telefone = "(31) 98765-6003"; // Carlos
    const semPermissao: RespostaBusca = (await buscar(A, telefone)).json();
    assert.equal(
      [...semPermissao.contatos, ...semPermissao.externos].some((item) => item.identidade.identidadeId === C.identidadeId),
      false,
      "por padrão ninguém é encontrado pelo telefone",
    );

    // Carlos passa a permitir (a preferência é dele, e o padrão é o mais restritivo).
    await ctx.banco.insert(preferenciasIdentidade).values({ identidadeId: C.identidadeId, buscavelPorTelefone: true }).onConflictDoNothing();
    const comPermissao: RespostaBusca = (await buscar(A, telefone)).json();
    assert.ok(
      [...comPermissao.contatos, ...comPermissao.externos].some((item) => item.identidade.identidadeId === C.identidadeId),
      "com a permissão ligada, o telefone encontra",
    );
    assert.equal(JSON.stringify(comPermissao).includes("98765"), false, "mesmo achando por telefone, o telefone não volta");
  });

  it("termo curto demais não vira consulta", async () => {
    const resultado: RespostaBusca = (await buscar(A, "a")).json();
    assert.deepEqual(resultado, { contatos: [], externos: [] });
  });

  it("a busca é da identidade atuante: a empresa busca na agenda dela", async () => {
    const comoEmpresa = como(A, pizzaria.identidadeId);
    const daEmpresa: RespostaBusca = (await buscar(comoEmpresa, "Carlos")).json();
    assert.ok(daEmpresa.contatos.some((item) => item.identidade.identidadeId === C.identidadeId), "Carlos está na agenda da empresa");

    const pessoal: RespostaBusca = (await buscar(A, "Carlos")).json();
    assert.equal(pessoal.contatos.some((item) => item.identidade.identidadeId === C.identidadeId), false, "na agenda pessoal ele não está");
    assert.ok(pessoal.externos.some((item) => item.identidade.identidadeId === C.identidadeId), "mas aparece como descoberta");
  });

  it("sem sessão não há busca nem agenda", async () => {
    assert.equal((await ctx.api(null, "GET", "/busca?termo=Carlos")).statusCode, 401);
    assert.equal((await ctx.api(null, "GET", "/contatos")).statusCode, 401);
  });
});
