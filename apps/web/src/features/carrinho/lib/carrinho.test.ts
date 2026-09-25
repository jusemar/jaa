import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAXIMO_ITENS_POR_PEDIDO, QUANTIDADE_MAXIMA_POR_ITEM, type EmpresaPublica, type GrupoOpcoesPublico, type ProdutoPublico } from "@jaa/contratos";
import {
  adicionarAoCarrinho,
  alterarQuantidade,
  escolhasDaMontagem,
  itensParaPedido,
  linhaDoItem,
  quantidadeTotal,
  removerDoCarrinho,
  resumirEscolhas,
  totalCentavos,
  type Carrinho,
} from "./carrinho.ts";

const pizzaria: EmpresaPublica = { identidadeId: "bbbbbbbb-0000-4000-8000-000000000000", nome: "Pizzaria BH", nomeUsuario: "pizzariabh", slug: "pizzaria-bh" };
const farmacia: EmpresaPublica = { identidadeId: "dddddddd-0000-4000-8000-000000000000", nome: "Farmácia Central", nomeUsuario: "farmacia", slug: "farmacia-central" };
const pizza: ProdutoPublico = { id: "aaaaaaaa-0000-4000-8000-000000000000", nome: "Pizza Calabresa", descricao: null, precoCentavos: 3990, disponibilidade: "disponivel", categoriaId: null, imagemUrl: null, personalizavel: false };
const refri: ProdutoPublico = { id: "cccccccc-0000-4000-8000-000000000000", nome: "Refrigerante 2L", descricao: null, precoCentavos: 1200, disponibilidade: "disponivel", categoriaId: null, imagemUrl: null, personalizavel: false };
const dipirona: ProdutoPublico = { id: "eeeeeeee-0000-4000-8000-000000000000", nome: "Dipirona", descricao: null, precoCentavos: 890, disponibilidade: "disponivel", categoriaId: null, imagemUrl: null, personalizavel: false };

/* Produto com montagem: um grupo de escolha única (tamanho, com acréscimo) e um de múltipla escolha. */
const prato: ProdutoPublico = {
  id: "11111111-0000-4000-8000-000000000000",
  nome: "Monte seu prato",
  descricao: null,
  precoCentavos: 2490,
  disponibilidade: "disponivel",
  categoriaId: null,
  imagemUrl: null,
  personalizavel: true,
};

const tamanho: GrupoOpcoesPublico = {
  id: "22222222-0000-4000-8000-000000000000",
  nome: "Tamanho",
  instrucao: null,
  minimoEscolhas: 1,
  maximoEscolhas: 1,
  opcoes: [
    { id: "aaaa1111-0000-4000-8000-000000000000", nome: "Pequeno", precoAdicionalCentavos: 0 },
    { id: "aaaa2222-0000-4000-8000-000000000000", nome: "Grande", precoAdicionalCentavos: 500 },
  ],
};

const acompanhamentos: GrupoOpcoesPublico = {
  id: "33333333-0000-4000-8000-000000000000",
  nome: "Acompanhamentos",
  instrucao: null,
  minimoEscolhas: 0,
  maximoEscolhas: 2,
  opcoes: [
    { id: "bbbb1111-0000-4000-8000-000000000000", nome: "Arroz", precoAdicionalCentavos: 0 },
    { id: "bbbb2222-0000-4000-8000-000000000000", nome: "Feijão", precoAdicionalCentavos: 0 },
  ],
};

const grupos = [tamanho, acompanhamentos];

function carrinhoCom(...adicoes: Array<[ProdutoPublico, number]>): Carrinho {
  let carrinho: Carrinho | null = null;
  for (const [produto, quantidade] of adicoes) {
    const resultado = adicionarAoCarrinho(carrinho, pizzaria, produto, quantidade);
    assert.equal(resultado.tipo, "adicionado");
    if (resultado.tipo === "adicionado") carrinho = resultado.carrinho;
  }
  assert.ok(carrinho);
  return carrinho;
}

describe("carrinho", () => {
  it("adiciona, soma quantidade do mesmo produto e calcula total (2×39,90 + 1×12,00 = R$ 91,80)", () => {
    const carrinho = carrinhoCom([pizza, 1], [pizza, 1], [refri, 1]);
    assert.deepEqual(carrinho.itens.map((item) => [item.nome, item.quantidade]), [["Pizza Calabresa", 2], ["Refrigerante 2L", 1]]);
    assert.equal(totalCentavos(carrinho), 9180);
    assert.equal(quantidadeTotal(carrinho), 3);
    assert.deepEqual(itensParaPedido(carrinho), [{ produtoId: pizza.id, quantidade: 2 }, { produtoId: refri.id, quantidade: 1 }]);
  });

  it("altera quantidade, remove e zera o total", () => {
    const linhaPizza = linhaDoItem(pizza.id, []);
    const linhaRefri = linhaDoItem(refri.id, []);
    let carrinho = carrinhoCom([pizza, 2], [refri, 1]);
    carrinho = alterarQuantidade(carrinho, linhaPizza, 3);
    assert.equal(totalCentavos(carrinho), 3 * 3990 + 1200);
    carrinho = alterarQuantidade(carrinho, linhaPizza, 0);
    assert.deepEqual(carrinho.itens.map((item) => item.produtoId), [refri.id]);
    carrinho = removerDoCarrinho(carrinho, linhaRefri);
    assert.deepEqual(carrinho.itens, []);
    assert.equal(totalCentavos(carrinho), 0);
  });

  it("quantidade fica entre 1 e o limite, sem fração", () => {
    const linhaPizza = linhaDoItem(pizza.id, []);
    const carrinho = alterarQuantidade(carrinhoCom([pizza, 1]), linhaPizza, QUANTIDADE_MAXIMA_POR_ITEM + 10);
    assert.equal(carrinho.itens[0]?.quantidade, QUANTIDADE_MAXIMA_POR_ITEM);
    assert.equal(alterarQuantidade(carrinho, linhaPizza, 2.7).itens[0]?.quantidade, 2);
    const muitos = adicionarAoCarrinho(carrinhoCom([pizza, 1]), pizzaria, pizza, QUANTIDADE_MAXIMA_POR_ITEM);
    assert.equal(muitos.tipo === "adicionado" && muitos.carrinho.itens[0]?.quantidade, QUANTIDADE_MAXIMA_POR_ITEM);
  });

  it("carrinho é de UMA empresa: produto de outra avisa em vez de trocar em silêncio", () => {
    const carrinho = carrinhoCom([pizza, 1]);
    const resultado = adicionarAoCarrinho(carrinho, farmacia, dipirona);
    assert.equal(resultado.tipo, "outra-empresa");
    assert.equal(resultado.tipo === "outra-empresa" && resultado.empresaAtual.nome, "Pizzaria BH");
    assert.deepEqual(carrinho.itens.map((item) => item.produtoId), [pizza.id], "carrinho atual intacto");
    // Só após esvaziar/substituir explicitamente é que a outra empresa entra.
    const novo = adicionarAoCarrinho(null, farmacia, dipirona);
    assert.equal(novo.tipo === "adicionado" && novo.carrinho.empresa.identidadeId, farmacia.identidadeId);
  });

  it("respeita o teto de itens distintos do pedido", () => {
    let carrinho: Carrinho | null = null;
    for (let i = 0; i < MAXIMO_ITENS_POR_PEDIDO; i++) {
      const produto = { ...pizza, id: `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, "0")}` };
      const resultado = adicionarAoCarrinho(carrinho, pizzaria, produto);
      assert.equal(resultado.tipo, "adicionado");
      if (resultado.tipo === "adicionado") carrinho = resultado.carrinho;
    }
    assert.equal(adicionarAoCarrinho(carrinho, pizzaria, refri).tipo, "limite-de-itens");
  });

  it("produto personalizado: preço unitário soma os acréscimos e a montagem fica no item", () => {
    const escolhas = escolhasDaMontagem(grupos, ["aaaa2222-0000-4000-8000-000000000000", "bbbb1111-0000-4000-8000-000000000000"]);
    const resultado = adicionarAoCarrinho(null, pizzaria, prato, 1, escolhas);
    assert.equal(resultado.tipo, "adicionado");
    if (resultado.tipo !== "adicionado") return;

    const item = resultado.carrinho.itens[0];
    // 24,90 (base) + 5,00 (Grande) + 0 (Arroz) = 29,90 — igual ao que o servidor recalcula.
    assert.equal(item?.precoUnitarioCentavos, 2990);
    // Na ordem em que os grupos foram apresentados, não na ordem em que a pessoa clicou.
    assert.deepEqual(item?.escolhas.map((escolha) => escolha.opcaoNome), ["Grande", "Arroz"]);
    assert.equal(resumirEscolhas(item?.escolhas ?? []), "Grande · Arroz");
    assert.deepEqual(itensParaPedido(resultado.carrinho), [
      { produtoId: prato.id, quantidade: 1, opcaoIds: ["aaaa2222-0000-4000-8000-000000000000", "bbbb1111-0000-4000-8000-000000000000"] },
    ]);
  });

  it("montagens DIFERENTES do mesmo produto são duas linhas; a mesma montagem soma quantidade", () => {
    const grande = escolhasDaMontagem(grupos, ["aaaa2222-0000-4000-8000-000000000000"]);
    const pequeno = escolhasDaMontagem(grupos, ["aaaa1111-0000-4000-8000-000000000000"]);

    const primeiro = adicionarAoCarrinho(null, pizzaria, prato, 1, grande);
    assert.equal(primeiro.tipo, "adicionado");
    if (primeiro.tipo !== "adicionado") return;

    const segundo = adicionarAoCarrinho(primeiro.carrinho, pizzaria, prato, 1, pequeno);
    assert.equal(segundo.tipo, "adicionado");
    if (segundo.tipo !== "adicionado") return;
    assert.equal(segundo.carrinho.itens.length, 2, "grande e pequeno são itens distintos");
    assert.deepEqual(segundo.carrinho.itens.map((item) => item.precoUnitarioCentavos), [2990, 2490]);

    // Repetir a MESMA montagem não cria terceira linha: soma quantidade.
    const terceiro = adicionarAoCarrinho(segundo.carrinho, pizzaria, prato, 2, grande);
    assert.equal(terceiro.tipo, "adicionado");
    if (terceiro.tipo !== "adicionado") return;
    assert.equal(terceiro.carrinho.itens.length, 2);
    assert.equal(terceiro.carrinho.itens[0]?.quantidade, 3);
  });

  it("quantidade e remoção agem sobre a LINHA, não sobre o produto", () => {
    const grande = escolhasDaMontagem(grupos, ["aaaa2222-0000-4000-8000-000000000000"]);
    const pequeno = escolhasDaMontagem(grupos, ["aaaa1111-0000-4000-8000-000000000000"]);
    const primeiro = adicionarAoCarrinho(null, pizzaria, prato, 1, grande);
    assert.equal(primeiro.tipo, "adicionado");
    if (primeiro.tipo !== "adicionado") return;
    const segundo = adicionarAoCarrinho(primeiro.carrinho, pizzaria, prato, 1, pequeno);
    assert.equal(segundo.tipo, "adicionado");
    if (segundo.tipo !== "adicionado") return;

    const linhaGrande = linhaDoItem(prato.id, ["aaaa2222-0000-4000-8000-000000000000"]);
    const comMaisGrande = alterarQuantidade(segundo.carrinho, linhaGrande, 4);
    assert.deepEqual(comMaisGrande.itens.map((item) => item.quantidade), [4, 1], "só a linha grande mudou");

    const semGrande = removerDoCarrinho(comMaisGrande, linhaGrande);
    assert.equal(semGrande.itens.length, 1);
    assert.equal(semGrande.itens[0]?.precoUnitarioCentavos, 2490, "o pequeno continua no carrinho");
  });

  it("a chave da linha é derivada de produto + opções + observação, e é estável", () => {
    // Mesma entrada, mesma chave (a ordem das opções não importa).
    assert.equal(linhaDoItem(pizza.id, ["b", "a"]), linhaDoItem(pizza.id, ["a", "b"]));
    // Observação diferente = LINHA diferente: "sem cebola" é outro pedido para quem prepara.
    assert.notEqual(linhaDoItem(pizza.id, [], "sem cebola"), linhaDoItem(pizza.id, []));
    assert.notEqual(linhaDoItem(pizza.id, []), linhaDoItem(refri.id, []));
  });

  it("observação separa linhas do mesmo produto e vai para a API", () => {
    const primeiro = adicionarAoCarrinho(null, pizzaria, pizza, 1, [], "sem cebola");
    assert.equal(primeiro.tipo, "adicionado");
    if (primeiro.tipo !== "adicionado") return;

    const segundo = adicionarAoCarrinho(primeiro.carrinho, pizzaria, pizza, 1, [], null);
    assert.equal(segundo.tipo, "adicionado");
    if (segundo.tipo !== "adicionado") return;
    assert.equal(segundo.carrinho.itens.length, 2, "com e sem observação são linhas distintas");

    // Repetir a MESMA observação soma quantidade em vez de criar terceira linha.
    const terceiro = adicionarAoCarrinho(segundo.carrinho, pizzaria, pizza, 2, [], "sem cebola");
    assert.equal(terceiro.tipo, "adicionado");
    if (terceiro.tipo !== "adicionado") return;
    assert.equal(terceiro.carrinho.itens.length, 2);
    assert.equal(terceiro.carrinho.itens[0]?.quantidade, 3);

    assert.deepEqual(itensParaPedido(terceiro.carrinho), [
      { produtoId: pizza.id, quantidade: 3, observacao: "sem cebola" },
      // Sem observação, o campo simplesmente não é enviado.
      { produtoId: pizza.id, quantidade: 1 },
    ]);
  });
});
