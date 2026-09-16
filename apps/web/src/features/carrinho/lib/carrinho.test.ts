import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAXIMO_ITENS_POR_PEDIDO, QUANTIDADE_MAXIMA_POR_ITEM, type EmpresaPublica, type ProdutoPublico } from "@jaa/contratos";
import { adicionarAoCarrinho, alterarQuantidade, itensParaPedido, quantidadeTotal, removerDoCarrinho, totalCentavos, type Carrinho } from "./carrinho.ts";

const pizzaria: EmpresaPublica = { identidadeId: "bbbbbbbb-0000-4000-8000-000000000000", nome: "Pizzaria BH", nomeUsuario: "pizzariabh", slug: "pizzaria-bh" };
const farmacia: EmpresaPublica = { identidadeId: "dddddddd-0000-4000-8000-000000000000", nome: "Farmácia Central", nomeUsuario: "farmacia", slug: "farmacia-central" };
const pizza: ProdutoPublico = { id: "aaaaaaaa-0000-4000-8000-000000000000", nome: "Pizza Calabresa", descricao: null, precoCentavos: 3990, disponibilidade: "disponivel" };
const refri: ProdutoPublico = { id: "cccccccc-0000-4000-8000-000000000000", nome: "Refrigerante 2L", descricao: null, precoCentavos: 1200, disponibilidade: "disponivel" };
const dipirona: ProdutoPublico = { id: "eeeeeeee-0000-4000-8000-000000000000", nome: "Dipirona", descricao: null, precoCentavos: 890, disponibilidade: "disponivel" };

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
    let carrinho = carrinhoCom([pizza, 2], [refri, 1]);
    carrinho = alterarQuantidade(carrinho, pizza.id, 3);
    assert.equal(totalCentavos(carrinho), 3 * 3990 + 1200);
    carrinho = alterarQuantidade(carrinho, pizza.id, 0);
    assert.deepEqual(carrinho.itens.map((item) => item.produtoId), [refri.id]);
    carrinho = removerDoCarrinho(carrinho, refri.id);
    assert.deepEqual(carrinho.itens, []);
    assert.equal(totalCentavos(carrinho), 0);
  });

  it("quantidade fica entre 1 e o limite, sem fração", () => {
    const carrinho = alterarQuantidade(carrinhoCom([pizza, 1]), pizza.id, QUANTIDADE_MAXIMA_POR_ITEM + 10);
    assert.equal(carrinho.itens[0]?.quantidade, QUANTIDADE_MAXIMA_POR_ITEM);
    assert.equal(alterarQuantidade(carrinho, pizza.id, 2.7).itens[0]?.quantidade, 2);
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
});
