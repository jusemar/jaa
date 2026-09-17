import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { CategoriaProduto, Produto } from "@jaa/contratos";
import sharp from "sharp";
import { criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";
import type { ArmazenamentoDeArquivos } from "../src/lib/armazenamento/armazenamento-arquivos.js";

/*
 * CATEGORIAS POR EMPRESA, PAGINAÇÃO da administração e IMAGEM do produto.
 * Armazenamento FAKE: nenhum teste fala com o Cloudflare de verdade.
 */

const TELEFONES = ["+5531987664001", "+5531987664002"];

const guardados = new Map<string, Buffer>();
const armazenamentoFake: ArmazenamentoDeArquivos = {
  nome: "teste",
  async salvar({ chave, conteudo }) {
    guardados.set(chave, conteudo);
    return { chave };
  },
  async remover(chave) {
    guardados.delete(chave);
  },
  urlPublica: (chave) => `https://arquivos.teste.invalid/${chave}`,
};

const ctx = criarAmbienteIntegracao({ telefones: TELEFONES, prefixoIp: "198.51.104.", armazenamento: armazenamentoFake });

let dona: Pessoa;
let estranho: Pessoa;
let pizzaria = "";
let mercado = "";

const rotaCategorias = (empresaId: string) => `/empresas/${empresaId}/categorias`;
const rotaProdutos = (empresaId: string) => `/empresas/${empresaId}/produtos`;
const imagem = (lado: number) => sharp({ create: { width: lado, height: lado, channels: 3, background: "#884422" } }).jpeg().toBuffer();

before(async () => {
  await ctx.iniciar();
  dona = await ctx.criarPessoa(0, "dona_cat", "Dona Catálogo");
  estranho = await ctx.criarPessoa(1, "estranho_cat", "Estranho");
  pizzaria = (await ctx.api(dona, "POST", "/empresas", { nome: "Pizzaria Cat", nomeUsuario: "pizzaria_cat", slug: "pizzaria-cat" })).json().id;
  mercado = (await ctx.api(dona, "POST", "/empresas", { nome: "Mercado Cat", nomeUsuario: "mercado_cat", slug: "mercado-cat" })).json().id;
});

after(async () => {
  await ctx.encerrar();
});

describe("categorias são de UMA empresa", () => {
  let bebidas = "";

  it("cria, ordena e conta os produtos de cada categoria", async () => {
    const criada = await ctx.api(dona, "POST", rotaCategorias(pizzaria), { nome: "  Bebidas  ", posicao: 1 });
    assert.equal(criada.statusCode, 201, criada.body);
    bebidas = criada.json().id;
    assert.equal(criada.json().nome, "Bebidas");

    await ctx.api(dona, "POST", rotaCategorias(pizzaria), { nome: "Pizzas", posicao: 0 });
    const lista: CategoriaProduto[] = (await ctx.api(dona, "GET", rotaCategorias(pizzaria))).json().categorias;
    assert.deepEqual(lista.map((c) => c.nome), ["Pizzas", "Bebidas"], "ordena pela posição escolhida pela empresa");
    assert.deepEqual(lista.map((c) => c.produtos), [0, 0]);
  });

  it("nome repetido na mesma empresa é recusado — em outra empresa é permitido", async () => {
    const repetida = await ctx.api(dona, "POST", rotaCategorias(pizzaria), { nome: "bebidas" });
    assert.equal(repetida.statusCode, 409, repetida.body);
    assert.equal(repetida.json().codigo, "CATEGORIA_NOME_EM_USO");
    // "Bebidas" da Pizzaria não é "Bebidas" do Mercado: não existe lista global.
    assert.equal((await ctx.api(dona, "POST", rotaCategorias(mercado), { nome: "Bebidas" })).statusCode, 201);
  });

  it("categoria de outra empresa não serve para o produto (nem existe para ela)", async () => {
    const doMercado: CategoriaProduto[] = (await ctx.api(dona, "GET", rotaCategorias(mercado))).json().categorias;
    const idDoMercado = doMercado[0]?.id as string;

    const produto = await ctx.api(dona, "POST", rotaProdutos(pizzaria), { nome: "Refri", precoCentavos: 900, categoriaId: idDoMercado });
    assert.equal(produto.statusCode, 404, produto.body);
    assert.equal(produto.json().codigo, "CATEGORIA_NAO_ENCONTRADA");
    assert.equal((await ctx.api(dona, "PATCH", `${rotaCategorias(pizzaria)}/${idDoMercado}`, { nome: "X" })).statusCode, 404);
  });

  it("quem não opera a empresa não vê nem cria categoria (404, sem revelar existência)", async () => {
    assert.equal((await ctx.api(estranho, "GET", rotaCategorias(pizzaria))).statusCode, 404);
    assert.equal((await ctx.api(estranho, "POST", rotaCategorias(pizzaria), { nome: "Minha" })).statusCode, 404);
    assert.equal((await ctx.api(null, "GET", rotaCategorias(pizzaria))).statusCode, 401);
  });

  it("apagar a categoria NÃO apaga produto: eles voltam para 'Sem categoria'", async () => {
    const produto: Produto = (await ctx.api(dona, "POST", rotaProdutos(pizzaria), { nome: "Guaraná 2L", precoCentavos: 1200, categoriaId: bebidas })).json();
    assert.equal(produto.categoriaId, bebidas);
    assert.equal(produto.categoriaNome, null, "a criação devolve o produto; o nome da categoria vem na leitura");
    assert.equal((await ctx.api(dona, "GET", `${rotaProdutos(pizzaria)}/${produto.id}`)).json().categoriaNome, "Bebidas");

    const comContagem: CategoriaProduto[] = (await ctx.api(dona, "GET", rotaCategorias(pizzaria))).json().categorias;
    assert.equal(comContagem.find((c) => c.id === bebidas)?.produtos, 1);

    assert.equal((await ctx.api(dona, "DELETE", `${rotaCategorias(pizzaria)}/${bebidas}`)).statusCode, 200);
    const orfao = await ctx.api(dona, "GET", `${rotaProdutos(pizzaria)}/${produto.id}`);
    assert.equal(orfao.statusCode, 200, "o produto continua existindo");
    assert.deepEqual([orfao.json().categoriaId, orfao.json().categoriaNome], [null, null]);
  });
});

describe("listagem paginada e filtrada", () => {
  before(async () => {
    for (let i = 1; i <= 25; i += 1) {
      const criado = await ctx.api(dona, "POST", rotaProdutos(mercado), { nome: `Item ${String(i).padStart(2, "0")}`, precoCentavos: 100 * i });
      assert.equal(criado.statusCode, 201, criado.body);
    }
  });

  it("devolve a página pedida e o total — a tela não baixa o catálogo inteiro", async () => {
    const primeira = (await ctx.api(dona, "GET", `${rotaProdutos(mercado)}?pagina=1&limite=10`)).json();
    assert.equal(primeira.produtos.length, 10);
    assert.deepEqual(primeira.paginacao, { pagina: 1, limite: 10, total: 25, totalPaginas: 3 });

    const terceira = (await ctx.api(dona, "GET", `${rotaProdutos(mercado)}?pagina=3&limite=10`)).json();
    assert.equal(terceira.produtos.length, 5, "a última página traz o resto");
    const idsPrimeira = new Set(primeira.produtos.map((p: Produto) => p.id));
    assert.equal(terceira.produtos.some((p: Produto) => idsPrimeira.has(p.id)), false, "páginas não se repetem");

    const alem = (await ctx.api(dona, "GET", `${rotaProdutos(mercado)}?pagina=9&limite=10`)).json();
    assert.deepEqual(alem.produtos, [], "página vazia é lista vazia, não erro");
  });

  it("limite absurdo é recusado; sem parâmetros vale o padrão", async () => {
    assert.equal((await ctx.api(dona, "GET", `${rotaProdutos(mercado)}?limite=5000`)).statusCode, 400);
    assert.equal((await ctx.api(dona, "GET", `${rotaProdutos(mercado)}?pagina=0`)).statusCode, 400);
    assert.deepEqual((await ctx.api(dona, "GET", rotaProdutos(mercado))).json().paginacao.limite, 20);
  });

  it("filtra por busca, disponibilidade e 'sem categoria'", async () => {
    const busca = (await ctx.api(dona, "GET", `${rotaProdutos(mercado)}?busca=Item 07`)).json();
    assert.deepEqual(busca.produtos.map((p: Produto) => p.nome), ["Item 07"]);
    assert.equal(busca.paginacao.total, 1, "o total respeita o filtro");

    const alvo: Produto = busca.produtos[0];
    await ctx.api(dona, "PATCH", `${rotaProdutos(mercado)}/${alvo.id}/disponibilidade`, { disponibilidade: "indisponivel" });
    const indisponiveis = (await ctx.api(dona, "GET", `${rotaProdutos(mercado)}?disponibilidade=indisponivel`)).json();
    assert.deepEqual(indisponiveis.produtos.map((p: Produto) => p.id), [alvo.id]);

    const categoria: CategoriaProduto = (await ctx.api(dona, "POST", rotaCategorias(mercado), { nome: "Limpeza" })).json();
    await ctx.api(dona, "PATCH", `${rotaProdutos(mercado)}/${alvo.id}`, { categoriaId: categoria.id });
    assert.equal((await ctx.api(dona, "GET", `${rotaProdutos(mercado)}?categoriaId=${categoria.id}`)).json().paginacao.total, 1);
    assert.equal((await ctx.api(dona, "GET", `${rotaProdutos(mercado)}?categoriaId=sem-categoria`)).json().paginacao.total, 24);
  });
});

describe("imagem do produto", () => {
  let produtoId = "";

  before(async () => {
    produtoId = (await ctx.api(dona, "POST", rotaProdutos(pizzaria), { nome: "Pizza da Foto", precoCentavos: 4500 })).json().id;
  });

  it("processa, guarda a chave e aparece como URL na leitura", async () => {
    const envio = await ctx.enviarArquivo(dona, `${rotaProdutos(pizzaria)}/${produtoId}/imagem`, { nome: "pizza.jpg", tipo: "image/jpeg", conteudo: await imagem(1600) });
    assert.equal(envio.statusCode, 200, envio.body);
    assert.match(envio.json().chave, /^imagem-produto\//);

    const guardada = guardados.get(envio.json().chave);
    assert.ok(guardada);
    assert.equal((await sharp(guardada).metadata()).width, 1024, "imagem de produto cabe em 1024px");
    assert.equal((await ctx.api(dona, "GET", `${rotaProdutos(pizzaria)}/${produtoId}`)).json().imagemUrl, envio.json().url);
  });

  it("empresa errada não coloca imagem no produto de outra (e não deixa lixo no storage)", async () => {
    const antes = guardados.size;
    const tentativa = await ctx.enviarArquivo(dona, `${rotaProdutos(mercado)}/${produtoId}/imagem`, { nome: "x.jpg", tipo: "image/jpeg", conteudo: await imagem(100) });
    assert.equal(tentativa.statusCode, 404, tentativa.body);
    assert.equal(guardados.size, antes, "o objeto gravado antes da recusa é removido");

    assert.equal((await ctx.enviarArquivo(estranho, `${rotaProdutos(pizzaria)}/${produtoId}/imagem`, { nome: "x.jpg", tipo: "image/jpeg", conteudo: await imagem(100) })).statusCode, 404);
  });

  it("remover a imagem apaga o arquivo e devolve o produto sem imagem", async () => {
    const chave = (await ctx.api(dona, "GET", `${rotaProdutos(pizzaria)}/${produtoId}`)).json().imagemUrl.split("/").slice(3).join("/");
    assert.equal((await ctx.api(dona, "DELETE", `${rotaProdutos(pizzaria)}/${produtoId}/imagem`)).statusCode, 200);
    assert.equal(guardados.has(chave), false);
    assert.equal((await ctx.api(dona, "GET", `${rotaProdutos(pizzaria)}/${produtoId}`)).json().imagemUrl, null);
  });
});
