import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { produtos } from "@jaa/banco/schema";
import type { Empresa, Produto } from "@jaa/contratos";
import { eq, sql } from "drizzle-orm";
import { criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * Integração REAL da administração de produtos (HTTP + Better Auth + PostgreSQL), com foco em isolamento
 * multiempresa: A possui Pizzaria e Farmácia; B possui Mercado.
 */

const PREFIXO = `prd${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987651301", "+5531987651302", "+5531987651303"],
  prefixoIp: "198.18.8.",
});

let A: Pessoa;
let B: Pessoa;
let pizzaria: Empresa;
let farmacia: Empresa;
let mercado: Empresa;
let calabresa: Produto;

const rotaProdutos = (empresa: Empresa | string) => `/empresas/${typeof empresa === "string" ? empresa : empresa.id}/produtos`;
const rotaProduto = (empresa: Empresa | string, produtoId: string) => `${rotaProdutos(empresa)}/${produtoId}`;

async function criarEmpresa(pessoa: Pessoa, sufixo: string, nome: string): Promise<Empresa> {
  const resposta = await ctx.api(pessoa, "POST", "/empresas", { nome, nomeUsuario: `${PREFIXO}_${sufixo}`, slug: `${PREFIXO}-${sufixo}` });
  assert.equal(resposta.statusCode, 201, resposta.body);
  return resposta.json();
}

async function criarProduto(pessoa: Pessoa, empresa: Empresa, corpo: Record<string, unknown>): Promise<Produto> {
  const resposta = await ctx.api(pessoa, "POST", rotaProdutos(empresa), corpo);
  assert.equal(resposta.statusCode, 201, resposta.body);
  return resposta.json();
}

async function linhaDoBanco(produtoId: string) {
  const [linha] = await ctx.banco.select().from(produtos).where(eq(produtos.id, produtoId));
  return linha;
}

before(async () => {
  await ctx.iniciar();
  A = await ctx.criarPessoa(0, `${PREFIXO}_a`, "Junior Rocha");
  B = await ctx.criarPessoa(1, `${PREFIXO}_b`, "Bruno Outro");
  pizzaria = await criarEmpresa(A, "pizzaria", "Pizzaria BH");
  farmacia = await criarEmpresa(A, "farmacia", "Farmácia Central");
  mercado = await criarEmpresa(B, "mercado", "Mercado B");
});

after(() => ctx.encerrar());

describe("proprietário administra produtos", () => {
  it("cria Pizza Calabresa por R$ 39,90: centavos exatos, empresa correta, descrição normalizada, disponível por padrão", async () => {
    calabresa = await criarProduto(A, pizzaria, { nome: "  Pizza   Calabresa ", descricao: "  Molho, calabresa e cebola  ", precoCentavos: 3990 });
    assert.equal(calabresa.empresaId, pizzaria.id);
    assert.equal(calabresa.nome, "Pizza Calabresa");
    assert.equal(calabresa.descricao, "Molho, calabresa e cebola");
    assert.equal(calabresa.precoCentavos, 3990);
    assert.equal(calabresa.disponibilidade, "disponivel");
    assert.deepEqual(Object.keys(calabresa).sort(), [
      "atualizadoEm",
      "categoriaId",
      "categoriaNome",
      "criadoEm",
      "descricao",
      "disponibilidade",
      "empresaId",
      "id",
      "imagemUrl",
      "nome",
      "precoCentavos",
    ]);
    // Sem categoria e sem imagem é o estado normal de um produto recém-criado, não um erro.
    assert.deepEqual([calabresa.categoriaId, calabresa.categoriaNome, calabresa.imagemUrl], [null, null, null]);

    const linha = await linhaDoBanco(calabresa.id);
    assert.equal(linha?.precoCentavos, 3990);
    assert.equal(typeof linha?.precoCentavos, "number");
    const [tipoColuna] = (await ctx.banco.execute<{ tipo: string }>(sql`select pg_typeof(preco_centavos)::text as tipo from produtos where id = ${calabresa.id}`)).rows;
    assert.equal(tipoColuna?.tipo, "integer", "sem ponto flutuante no banco");
  });

  it("descrição vazia vira null; lista e obtenção ('reload') mantêm os dados", async () => {
    const refri = await criarProduto(A, pizzaria, { nome: "Refrigerante 2L", descricao: "   ", precoCentavos: 1200 });
    assert.equal(refri.descricao, null);
    assert.equal((await linhaDoBanco(refri.id))?.descricao, null);

    const pagina = (await ctx.api(A, "GET", rotaProdutos(pizzaria))).json();
    const lista: Produto[] = pagina.produtos;
    // Mais recentes primeiro: é o que a empresa acabou de cadastrar e quer conferir.
    assert.deepEqual(lista.map((p) => p.id), [refri.id, calabresa.id]);
    assert.deepEqual(pagina.paginacao, { pagina: 1, limite: 20, total: 2, totalPaginas: 1 });
    assert.deepEqual((await ctx.api(A, "GET", rotaProduto(pizzaria, calabresa.id))).json(), calabresa);
  });

  it("edita nome, descrição e preço; limpa descrição; atualizadoEm avança e criadoEm fica", async () => {
    const editado = await ctx.api(A, "PATCH", rotaProduto(pizzaria, calabresa.id), { nome: "Pizza Calabresa Especial", descricao: "Com borda recheada", precoCentavos: 4590 });
    assert.equal(editado.statusCode, 200, editado.body);
    const produto: Produto = editado.json();
    assert.deepEqual([produto.nome, produto.descricao, produto.precoCentavos], ["Pizza Calabresa Especial", "Com borda recheada", 4590]);
    assert.equal(produto.criadoEm, calabresa.criadoEm);
    assert.ok(produto.atualizadoEm > calabresa.atualizadoEm);

    const semDescricao: Produto = (await ctx.api(A, "PATCH", rotaProduto(pizzaria, calabresa.id), { descricao: "" })).json();
    assert.equal(semDescricao.descricao, null);
    assert.equal(semDescricao.precoCentavos, 4590, "edição parcial preserva o resto");
    calabresa = (await ctx.api(A, "PATCH", rotaProduto(pizzaria, calabresa.id), { descricao: "Com borda recheada" })).json();
    assert.deepEqual((await ctx.api(A, "GET", rotaProduto(pizzaria, calabresa.id))).json(), calabresa);
  });

  it("indisponível continua existindo, listado e administrável; pode ser reativado", async () => {
    const indisponivel = await ctx.api(A, "PATCH", `${rotaProduto(pizzaria, calabresa.id)}/disponibilidade`, { disponibilidade: "indisponivel" });
    assert.equal(indisponivel.statusCode, 200);
    assert.equal(indisponivel.json().disponibilidade, "indisponivel");
    assert.ok((await ctx.api(A, "GET", rotaProdutos(pizzaria))).json().produtos.some((p: Produto) => p.id === calabresa.id));
    const precoNovo = await ctx.api(A, "PATCH", rotaProduto(pizzaria, calabresa.id), { precoCentavos: 4990 });
    assert.equal(precoNovo.json().precoCentavos, 4990);
    assert.equal(precoNovo.json().disponibilidade, "indisponivel");
    const reativado = await ctx.api(A, "PATCH", `${rotaProduto(pizzaria, calabresa.id)}/disponibilidade`, { disponibilidade: "disponivel" });
    assert.equal(reativado.json().disponibilidade, "disponivel");
    calabresa = reativado.json();
  });

  it("valores inválidos são recusados sem alterar nada", async () => {
    for (const corpo of [
      { nome: "", precoCentavos: 100 },
      { nome: "   ", precoCentavos: 100 },
      { nome: "Grátis", precoCentavos: 0 },
      { nome: "Negativo", precoCentavos: -3990 },
      { nome: "Fração", precoCentavos: 39.9 },
      { nome: "Texto", precoCentavos: "3990" },
      { nome: "Absurdo", precoCentavos: 100_000_000 },
      { nome: "Sem preço" },
      { nome: "x".repeat(121), precoCentavos: 100 },
    ]) {
      const resposta = await ctx.api(A, "POST", rotaProdutos(pizzaria), corpo);
      assert.equal(resposta.statusCode, 400, JSON.stringify(corpo).slice(0, 40));
      assert.equal(resposta.json().codigo, "DADOS_INVALIDOS");
    }
    for (const corpo of [{ precoCentavos: -1 }, { precoCentavos: 0 }, { nome: "" }, {}, { disponibilidade: "esgotado" }]) {
      assert.equal((await ctx.api(A, "PATCH", rotaProduto(pizzaria, calabresa.id), corpo)).statusCode, 400);
    }
    assert.equal((await ctx.api(A, "PATCH", `${rotaProduto(pizzaria, calabresa.id)}/disponibilidade`, { disponibilidade: "pausado" })).statusCode, 400);
    assert.deepEqual((await ctx.api(A, "GET", rotaProduto(pizzaria, calabresa.id))).json(), calabresa);
  });
});

describe("isolamento multiempresa e segurança", () => {
  let dipirona: Produto;
  let arroz: Produto;

  before(async () => {
    dipirona = await criarProduto(A, farmacia, { nome: "Dipirona", precoCentavos: 890 });
    arroz = await criarProduto(B, mercado, { nome: "Arroz 5kg", precoCentavos: 2599 });
  });

  it("catálogos separados: cada empresa lista só os seus produtos", async () => {
    const daPizzaria: Produto[] = (await ctx.api(A, "GET", rotaProdutos(pizzaria))).json().produtos;
    const daFarmacia: Produto[] = (await ctx.api(A, "GET", rotaProdutos(farmacia))).json().produtos;
    const doMercado: Produto[] = (await ctx.api(B, "GET", rotaProdutos(mercado))).json().produtos;
    assert.ok(daPizzaria.every((p) => p.empresaId === pizzaria.id) && !daPizzaria.some((p) => p.id === dipirona.id));
    assert.deepEqual(daFarmacia.map((p) => p.id), [dipirona.id]);
    assert.deepEqual(doMercado.map((p) => p.id), [arroz.id]);
  });

  it("produto da Pizzaria não é obtido, editado nem alterado pela rota da Farmácia (mesmo dono)", async () => {
    const pelaFarmacia = [
      await ctx.api(A, "GET", rotaProduto(farmacia, calabresa.id)),
      await ctx.api(A, "PATCH", rotaProduto(farmacia, calabresa.id), { precoCentavos: 1 }),
      await ctx.api(A, "PATCH", `${rotaProduto(farmacia, calabresa.id)}/disponibilidade`, { disponibilidade: "indisponivel" }),
    ];
    for (const resposta of pelaFarmacia) {
      assert.equal(resposta.statusCode, 404);
      assert.equal(resposta.json().codigo, "PRODUTO_NAO_ENCONTRADO");
    }
    assert.equal((await linhaDoBanco(calabresa.id))?.precoCentavos, calabresa.precoCentavos);
  });

  it("B não cria, lista, obtém, edita, altera preço ou disponibilidade nos produtos de A (404 sem revelar)", async () => {
    const tentativas = [
      await ctx.api(B, "GET", rotaProdutos(pizzaria)),
      await ctx.api(B, "POST", rotaProdutos(pizzaria), { nome: "Intruso", precoCentavos: 100 }),
      await ctx.api(B, "GET", rotaProduto(pizzaria, calabresa.id)),
      await ctx.api(B, "PATCH", rotaProduto(pizzaria, calabresa.id), { nome: "Tomado", precoCentavos: 1 }),
      await ctx.api(B, "PATCH", `${rotaProduto(pizzaria, calabresa.id)}/disponibilidade`, { disponibilidade: "indisponivel" }),
    ];
    for (const resposta of tentativas) {
      assert.equal(resposta.statusCode, 404);
      assert.equal(resposta.json().codigo, "EMPRESA_NAO_ENCONTRADA");
      assert.ok(!resposta.body.includes("Calabresa"));
    }
    const inexistente = await ctx.api(B, "GET", rotaProdutos(randomUUID()));
    assert.deepEqual(inexistente.json(), tentativas[0]?.json(), "empresa alheia e inexistente são indistinguíveis");

    // Produto de A pela rota do Mercado de B (id conhecido): não encontrado.
    assert.equal((await ctx.api(B, "PATCH", rotaProduto(mercado, calabresa.id), { precoCentavos: 1 })).statusCode, 404);
    const linha = await linhaDoBanco(calabresa.id);
    assert.deepEqual([linha?.nome, linha?.precoCentavos, linha?.disponibilidade, linha?.empresaId], [calabresa.nome, calabresa.precoCentavos, calabresa.disponibilidade, pizzaria.id]);
    assert.equal((await ctx.api(null, "GET", rotaProdutos(pizzaria))).statusCode, 401);
  });

  it("empresaId no corpo não cria nem move produto para outra empresa; o banco impede troca direta", async () => {
    const criado = await criarProduto(B, mercado, { nome: "Feijão", precoCentavos: 899, empresaId: pizzaria.id });
    assert.equal(criado.empresaId, mercado.id);

    const movido = await ctx.api(A, "PATCH", rotaProduto(pizzaria, calabresa.id), { empresaId: farmacia.id, nome: "Pizza Calabresa Especial" });
    assert.equal(movido.statusCode, 200);
    assert.equal(movido.json().empresaId, pizzaria.id);
    assert.equal((await ctx.api(A, "PATCH", rotaProduto(pizzaria, calabresa.id), { empresaId: farmacia.id })).statusCode, 400, "só empresaId não é edição válida");
    assert.equal((await linhaDoBanco(calabresa.id))?.empresaId, pizzaria.id);

    await assert.rejects(
      ctx.banco.update(produtos).set({ empresaId: farmacia.id }).where(eq(produtos.id, calabresa.id)),
      (erro: Error) => String((erro.cause as { constraint?: string } | undefined)?.constraint ?? erro.message).includes("produtos_empresa_imutavel"),
    );
    assert.equal((await linhaDoBanco(calabresa.id))?.empresaId, pizzaria.id);
  });

  it("slug não concede acesso administrativo", async () => {
    assert.equal((await ctx.api(B, "GET", `/empresas/${pizzaria.slug}/produtos`)).statusCode, 400);
    assert.equal((await ctx.api(B, "POST", `/empresas/${pizzaria.slug}/produtos`, { nome: "Via slug", precoCentavos: 100 })).statusCode, 400);
    assert.equal((await ctx.api(A, "GET", `/empresas/${pizzaria.slug}/produtos`)).statusCode, 400, "nem para o dono: a API usa ids");
  });

  it("resposta de produto não expõe conta, membros ou dados pessoais", async () => {
    const corpo = (await ctx.api(A, "GET", rotaProdutos(pizzaria))).body;
    for (const proibido of ["usuarioId", "telefone", "phone", "email", "papel", "sessao", "Junior Rocha", "+55319876513"]) {
      assert.ok(!corpo.includes(proibido), proibido);
    }
  });
});

describe("arquitetura", () => {
  const raiz = join(import.meta.dirname, "..", "..", "..");
  const arquivos = (diretorio: string): string[] =>
    readdirSync(diretorio).flatMap((nome) => {
      const caminho = join(diretorio, nome);
      return statSync(caminho).isDirectory() ? (nome === "node_modules" ? [] : arquivos(caminho)) : [caminho];
    });

  it("API de produtos não depende da Web (Next/React) e roda sem ela", () => {
    const pacote = JSON.parse(readFileSync(join(raiz, "apps/api/package.json"), "utf8"));
    const dependencias = Object.keys({ ...pacote.dependencies, ...pacote.devDependencies });
    assert.ok(!dependencias.some((nome) => nome === "next" || nome === "react" || nome === "web"));
    for (const arquivo of arquivos(join(raiz, "apps/api/src"))) {
      assert.ok(!/from ["'](next|react)|apps\/web/.test(readFileSync(arquivo, "utf8")), arquivo);
    }
  });

  it("nenhuma administração de produto no app Mobile nesta versão", () => {
    for (const arquivo of arquivos(join(raiz, "apps/mobile/src"))) {
      assert.ok(!/produto/i.test(readFileSync(arquivo, "utf8")), arquivo);
    }
  });
});
