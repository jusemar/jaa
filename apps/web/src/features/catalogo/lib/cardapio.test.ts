import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CategoriaPublica, ProdutoPublico } from "@jaa/contratos";
import {
  filtrarProdutos,
  ID_SECAO_SEM_CATEGORIA,
  montarSecoes,
  NOME_SECAO_SEM_CATEGORIA,
  produtoParaMontarNaSecao,
  secaoAtiva,
  secaoInicial,
} from "./cardapio.ts";

const produto = (id: string, nome: string, categoriaId: string | null, descricao: string | null = null, personalizavel = false): ProdutoPublico => ({
  id,
  nome,
  descricao,
  precoCentavos: 1000,
  disponibilidade: "disponivel",
  categoriaId,
  imagemUrl: null,
  personalizavel,
});

// Categorias REAIS da empresa: a ordem é a que ela escolheu, não alfabética nem fixa no código.
const salgados: CategoriaPublica = { id: "c1111111-0000-4000-8000-000000000000", nome: "Salgados", posicao: 0 };
const bebidas: CategoriaPublica = { id: "c2222222-0000-4000-8000-000000000000", nome: "Bebidas", posicao: 1 };
const monte: CategoriaPublica = { id: "c3333333-0000-4000-8000-000000000000", nome: "Monte seu prato", posicao: 2 };
const vazia: CategoriaPublica = { id: "c4444444-0000-4000-8000-000000000000", nome: "Sem nada aqui", posicao: 3 };

const coxinha = produto("p1111111-0000-4000-8000-000000000000", "Coxinha", salgados.id, "Frango desfiado");
const pastel = produto("p2222222-0000-4000-8000-000000000000", "Pastel de queijo", salgados.id);
const guarana = produto("p3333333-0000-4000-8000-000000000000", "Guaraná", bebidas.id, "Lata 350ml sem lactose");
const brinde = produto("p4444444-0000-4000-8000-000000000000", "Brinde do mês", null);
const montar = produto("p5555555-0000-4000-8000-000000000000", "Monte seu prato", monte.id, null, true);

const nomes = (secoes: ReadonlyArray<{ nome: string }>) => secoes.map((secao) => secao.nome);

describe("seções do cardápio", () => {
  it("a seção de MONTAGEM vem primeiro; depois a ordem da empresa e, no fim, Outros", () => {
    const secoes = montarSecoes([bebidas, salgados, monte, vazia], [guarana, coxinha, brinde, pastel, montar]);
    assert.deepEqual(nomes(secoes), ["Monte seu prato", "Salgados", "Bebidas", NOME_SECAO_SEM_CATEGORIA]);
    // Categoria sem produto não aparece.
    assert.ok(!nomes(secoes).includes("Sem nada aqui"));
  });

  it("não existe seção agregando tudo: cada seção tem só os produtos da própria categoria", () => {
    const secoes = montarSecoes([salgados, bebidas], [coxinha, pastel, guarana]);
    assert.deepEqual(
      secoes.map((secao) => [secao.nome, secao.produtos.map((item) => item.nome)]),
      [
        ["Salgados", ["Coxinha", "Pastel de queijo"]],
        ["Bebidas", ["Guaraná"]],
      ],
    );
  });

  it("sem categoria de montagem, a ordem é só a da empresa", () => {
    assert.deepEqual(nomes(montarSecoes([bebidas, salgados], [guarana, coxinha])), ["Salgados", "Bebidas"]);
  });

  it("produto cuja categoria não veio na lista continua visível, em Outros", () => {
    const orfao = produto("p6666666-0000-4000-8000-000000000000", "Órfão", "c9999999-0000-4000-8000-000000000000");
    const secoes = montarSecoes([salgados], [coxinha, orfao]);
    assert.deepEqual(nomes(secoes), ["Salgados", NOME_SECAO_SEM_CATEGORIA]);
    assert.equal(secoes[1]?.id, ID_SECAO_SEM_CATEGORIA, "Outros tem id próprio, nunca nulo");
    assert.equal(secoes[1]?.categoriaId, null);
  });

  it("Outros nunca é montador, mesmo com um único produto personalizável sem categoria", () => {
    const soltoPersonalizavel = produto("p7777777-0000-4000-8000-000000000000", "Monte avulso", null, null, true);
    const secoes = montarSecoes([], [soltoPersonalizavel]);
    assert.equal(secoes[0]?.montagem, false);
    assert.equal(produtoParaMontarNaSecao(secoes[0] ?? null), null);
  });
});

describe("seção que abre selecionada", () => {
  it("é a de montagem quando existe", () => {
    const secoes = montarSecoes([salgados, bebidas, monte], [coxinha, guarana, montar]);
    assert.equal(secaoInicial(secoes)?.nome, "Monte seu prato");
    assert.equal(produtoParaMontarNaSecao(secaoInicial(secoes))?.nome, "Monte seu prato");
  });

  it("sem montagem, é a primeira categoria disponível", () => {
    const secoes = montarSecoes([bebidas, salgados], [guarana, coxinha]);
    assert.equal(secaoInicial(secoes)?.nome, "Salgados");
  });

  it("cardápio vazio não tem seção inicial", () => {
    assert.equal(secaoInicial(montarSecoes([salgados], [])), null);
  });

  it("escolha inexistente (categoria apagada) cai na seção inicial, nunca em tela vazia", () => {
    const secoes = montarSecoes([salgados, bebidas, monte], [coxinha, guarana, montar]);
    assert.equal(secaoAtiva(secoes, "categoria-que-nao-existe")?.nome, "Monte seu prato");
    assert.equal(secaoAtiva(secoes, null)?.nome, "Monte seu prato");
    // Escolha válida é respeitada.
    assert.equal(secaoAtiva(secoes, bebidas.id)?.nome, "Bebidas");
  });
});

describe("busca dentro da seção", () => {
  it("ignora acento e caixa e também olha a descrição", () => {
    const produtos = [coxinha, pastel, guarana, brinde];
    assert.deepEqual(filtrarProdutos(produtos, "guarana").map((item) => item.nome), ["Guaraná"]);
    assert.deepEqual(filtrarProdutos(produtos, "QUEIJO").map((item) => item.nome), ["Pastel de queijo"]);
    assert.deepEqual(filtrarProdutos(produtos, "sem lactose").map((item) => item.nome), ["Guaraná"], "achou pela descrição");
    assert.deepEqual(filtrarProdutos(produtos, "  ").map((item) => item.nome), produtos.map((item) => item.nome), "busca vazia não filtra");
    assert.deepEqual(filtrarProdutos(produtos, "sushi"), []);
  });

  it("filtra só os produtos da seção aberta, sem trazer os de outra categoria", () => {
    const secoes = montarSecoes([salgados, bebidas], [coxinha, pastel, guarana]);
    const aberta = secaoAtiva(secoes, bebidas.id);
    assert.deepEqual(filtrarProdutos(aberta?.produtos ?? [], "coxinha"), [], "coxinha é de Salgados");
    assert.deepEqual(filtrarProdutos(aberta?.produtos ?? [], "guarana").map((item) => item.nome), ["Guaraná"]);
  });
});
