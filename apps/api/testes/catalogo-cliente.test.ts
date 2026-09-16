import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { CatalogoPublico, Empresa, Produto } from "@jaa/contratos";
import { criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * Integração REAL da consulta de CLIENTE do catálogo (pública) e da descoberta técnica de empresas.
 * Mesmo domínio Produto da administração, com contrato e rotas separados.
 */

const PREFIXO = `cat${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987651501", "+5531987651502"],
  prefixoIp: "198.18.10.",
});

let A: Pessoa;
let B: Pessoa;
let pizzaria: Empresa;
let farmacia: Empresa;
let calabresa: Produto;
let refrigerante: Produto;
let esgotado: Produto;
let dipirona: Produto;

const catalogo = (identidadeId: string, pessoa: Pessoa | null = null) => ctx.api(pessoa, "GET", `/publico/empresas/${identidadeId}/catalogo`);
const detalhe = (identidadeId: string, produtoId: string, pessoa: Pessoa | null = null) =>
  ctx.api(pessoa, "GET", `/publico/empresas/${identidadeId}/catalogo/produtos/${produtoId}`);

async function criarProduto(empresa: Empresa, corpo: Record<string, unknown>): Promise<Produto> {
  const resposta = await ctx.api(A, "POST", `/empresas/${empresa.id}/produtos`, corpo);
  assert.equal(resposta.statusCode, 201, resposta.body);
  return resposta.json();
}

before(async () => {
  await ctx.iniciar();
  A = await ctx.criarPessoa(0, `${PREFIXO}_a`, "Junior Rocha");
  B = await ctx.criarPessoa(1, `${PREFIXO}_b`, "Bruna Cliente");
  pizzaria = (await ctx.api(A, "POST", "/empresas", { nome: "Pizzaria BH", nomeUsuario: `${PREFIXO}_pizza`, slug: `${PREFIXO}-pizzaria` })).json();
  farmacia = (await ctx.api(A, "POST", "/empresas", { nome: "Farmácia Central", nomeUsuario: `${PREFIXO}_farma`, slug: `${PREFIXO}-farmacia` })).json();
  calabresa = await criarProduto(pizzaria, { nome: "Pizza Calabresa", descricao: "Molho e calabresa", precoCentavos: 3990 });
  refrigerante = await criarProduto(pizzaria, { nome: "Refrigerante 2L", precoCentavos: 1200 });
  esgotado = await criarProduto(pizzaria, { nome: "Pizza Esgotada", precoCentavos: 4500, disponibilidade: "indisponivel" });
  dipirona = await criarProduto(farmacia, { nome: "Dipirona", precoCentavos: 890 });
});

after(() => ctx.encerrar());

describe("catálogo do cliente", () => {
  it("lista só produtos DISPONÍVEIS da empresa, com preço exato e só campos públicos; funciona sem sessão", async () => {
    for (const pessoa of [null, B]) {
      const resposta = await catalogo(pizzaria.identidadeId, pessoa);
      assert.equal(resposta.statusCode, 200, resposta.body);
      const dados: CatalogoPublico = resposta.json();
      assert.deepEqual(dados.empresa, { identidadeId: pizzaria.identidadeId, nome: "Pizzaria BH", nomeUsuario: `${PREFIXO}_pizza`, slug: `${PREFIXO}-pizzaria` });
      assert.deepEqual(dados.produtos, [
        { id: calabresa.id, nome: "Pizza Calabresa", descricao: "Molho e calabresa", precoCentavos: 3990, disponibilidade: "disponivel" },
        { id: refrigerante.id, nome: "Refrigerante 2L", descricao: null, precoCentavos: 1200, disponibilidade: "disponivel" },
      ]);
      for (const proibido of [esgotado.id, "Esgotada", pizzaria.id, "empresaId", "papel", "proprietario", "usuarioId", "criadoEm", "atualizadoEm", "Junior", "Dipirona"]) {
        assert.ok(!resposta.body.includes(proibido), proibido);
      }
    }
  });

  it("detalhe: disponível abre com empresa; indisponível, de outra empresa ou inexistente → 404", async () => {
    const aberto = await detalhe(pizzaria.identidadeId, calabresa.id, B);
    assert.equal(aberto.statusCode, 200);
    assert.deepEqual(aberto.json(), {
      empresa: { identidadeId: pizzaria.identidadeId, nome: "Pizzaria BH", nomeUsuario: `${PREFIXO}_pizza`, slug: `${PREFIXO}-pizzaria` },
      produto: { id: calabresa.id, nome: "Pizza Calabresa", descricao: "Molho e calabresa", precoCentavos: 3990, disponibilidade: "disponivel" },
    });
    for (const [identidadeId, produtoId] of [[pizzaria.identidadeId, esgotado.id], [pizzaria.identidadeId, dipirona.id], [pizzaria.identidadeId, randomUUID()]] as const) {
      const resposta = await detalhe(identidadeId, produtoId, B);
      assert.equal(resposta.statusCode, 404);
      assert.equal(resposta.json().codigo, "PRODUTO_NAO_ENCONTRADO");
    }
  });

  it("disponibilidade alterada na administração reflete no catálogo do cliente", async () => {
    await ctx.api(A, "PATCH", `/empresas/${pizzaria.id}/produtos/${refrigerante.id}/disponibilidade`, { disponibilidade: "indisponivel" });
    assert.deepEqual((await catalogo(pizzaria.identidadeId)).json().produtos.map((p: { id: string }) => p.id), [calabresa.id]);
    await ctx.api(A, "PATCH", `/empresas/${pizzaria.id}/produtos/${refrigerante.id}/disponibilidade`, { disponibilidade: "disponivel" });
    // Administração continua vendo todos, inclusive indisponíveis.
    assert.equal((await ctx.api(A, "GET", `/empresas/${pizzaria.id}/produtos`)).json().produtos.length, 3);
  });

  it("não vira endpoint administrativo nem aceita chaves erradas: identidade pessoal, empresaId interno, slug ou parâmetros extras", async () => {
    assert.equal((await catalogo(A.identidadeId, A)).statusCode, 404, "identidade pessoal não tem catálogo");
    assert.equal((await catalogo(pizzaria.id, A)).statusCode, 404, "empresaId interno não é chave pública");
    assert.equal((await catalogo(randomUUID())).statusCode, 404);
    assert.equal((await ctx.api(null, "GET", `/publico/empresas/${pizzaria.slug}/catalogo`)).statusCode, 400);
    const comParametros = await ctx.api(A, "GET", `/publico/empresas/${pizzaria.identidadeId}/catalogo?admin=true&incluirIndisponiveis=true&empresaId=${pizzaria.id}`);
    assert.ok(!comParametros.body.includes(esgotado.id));
    // Cliente não administra: rotas administrativas continuam 404 para B, sem sessão 401.
    assert.equal((await ctx.api(B, "GET", `/empresas/${pizzaria.id}/produtos`)).statusCode, 404);
    assert.equal((await ctx.api(B, "PATCH", `/empresas/${pizzaria.id}/produtos/${calabresa.id}`, { precoCentavos: 1 })).statusCode, 404);
    assert.equal((await ctx.api(null, "GET", `/empresas/${pizzaria.id}/produtos`)).statusCode, 401);
  });
});

describe("descoberta técnica de empresas", () => {
  it("exige sessão; busca empresas ativas por nome ou @usuario; nunca lista pessoas nem dados privados", async () => {
    assert.equal((await ctx.api(null, "GET", "/descoberta/empresas")).statusCode, 401);
    const porNome = (await ctx.api(B, "GET", `/descoberta/empresas?busca=${encodeURIComponent("pizzaria bh")}`)).json().empresas as Array<Record<string, string>>;
    assert.ok(porNome.some((e) => e.identidadeId === pizzaria.identidadeId));
    const porUsuario = (await ctx.api(B, "GET", `/descoberta/empresas?busca=${encodeURIComponent(`@${PREFIXO}_farma`)}`)).json().empresas as Array<Record<string, string>>;
    assert.deepEqual(porUsuario, [{ identidadeId: farmacia.identidadeId, nome: "Farmácia Central", nomeUsuario: `${PREFIXO}_farma`, slug: `${PREFIXO}-farmacia` }]);
    const pessoas = (await ctx.api(B, "GET", `/descoberta/empresas?busca=${PREFIXO}_a`)).json().empresas;
    assert.deepEqual(pessoas, [], "identidade pessoal não aparece");
    assert.deepEqual((await ctx.api(B, "GET", "/descoberta/empresas?busca=%25%25")).json().empresas.filter((e: { nomeUsuario: string }) => e.nomeUsuario.startsWith(PREFIXO)), [], "curingas são literais");
    assert.equal((await ctx.api(B, "GET", `/descoberta/empresas?busca=${"x".repeat(51)}`)).statusCode, 400);
  });
});
