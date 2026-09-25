import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CategoriaProduto, Produto } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormularioProduto } from "./formulario-produto.tsx";
import { GerenciadorCategorias } from "./gerenciador-categorias.tsx";
import { ControlePaginacao, ListaProdutos } from "./lista-produtos.tsx";

const texto = (html: string) => html.replace(/<[^>]+>/g, "").replace(/ /g, " ");
const base: Produto = {
  id: "aaaaaaaa-0000-4000-8000-000000000000",
  empresaId: "cccccccc-0000-4000-8000-000000000000",
  nome: "Pizza Calabresa",
  descricao: "Molho e calabresa",
  precoCentavos: 3990,
  disponibilidade: "disponivel",
  categoriaId: null,
  categoriaNome: null,
  imagemUrl: null,
  criadoEm: "2026-09-15T12:00:00.000Z",
  atualizadoEm: "2026-09-15T12:00:00.000Z",
};

const categorias: CategoriaProduto[] = [
  { id: "dddddddd-0000-4000-8000-000000000000", nome: "Pizzas", posicao: 0, produtos: 3 },
  { id: "eeeeeeee-0000-4000-8000-000000000000", nome: "Bebidas", posicao: 1, produtos: 1 },
];

describe("ListaProdutos", () => {
  it("mostra nome, preço formatado, disponibilidade, Editar e ação de disponibilidade", () => {
    const refri: Produto = { ...base, id: "bbbbbbbb-0000-4000-8000-000000000000", nome: "Refrigerante 2L", descricao: null, precoCentavos: 1200, disponibilidade: "indisponivel" };
    const html = renderToStaticMarkup(createElement(ListaProdutos, { produtos: [base, refri], aoEditar: () => {}, aoAlternarDisponibilidade: () => {} }));
    const conteudo = texto(html);
    for (const esperado of ["Pizza Calabresa", "R$ 39,90", "Disponível", "Refrigerante 2L", "R$ 12,00", "Indisponível", "Marcar indisponível", "Marcar disponível"]) {
      assert.ok(conteudo.includes(esperado), esperado);
    }
    assert.equal((html.match(/>Editar</g) ?? []).length, 2);
    assert.ok(html.includes('data-disponibilidade="indisponivel"'));
  });

  it("mostra a categoria e a imagem quando existem; sem imagem não fica buraco na lista", () => {
    const comImagem: Produto = { ...base, categoriaNome: "Pizzas", imagemUrl: "https://arquivos.exemplo.invalid/imagem-produto/a/b.webp" };
    const html = renderToStaticMarkup(createElement(ListaProdutos, { produtos: [comImagem], aoEditar: () => {}, aoAlternarDisponibilidade: () => {} }));
    assert.ok(texto(html).includes("Pizzas"));
    assert.ok(html.includes('src="https://arquivos.exemplo.invalid/imagem-produto/a/b.webp"'));
    // alt vazio: o nome do produto está ao lado e o leitor de tela não deve repetir.
    assert.ok(html.includes('alt=""'));

    const semImagem = renderToStaticMarkup(createElement(ListaProdutos, { produtos: [base], aoEditar: () => {}, aoAlternarDisponibilidade: () => {} }));
    assert.ok(semImagem.includes("data-sem-imagem"));
  });

  it("catálogo vazio oferece o próximo passo, em vez de uma tela morta", () => {
    const html = renderToStaticMarkup(createElement(ListaProdutos, { produtos: [], aoEditar: () => {}, aoAlternarDisponibilidade: () => {}, aoNovo: () => {} }));
    const conteudo = texto(html);
    assert.ok(conteudo.includes("Nenhum produto por aqui"));
    assert.ok(conteudo.includes("Novo produto"));
  });
});

describe("ControlePaginacao", () => {
  it("diz onde a pessoa está e desativa o que não existe", () => {
    const primeira = renderToStaticMarkup(createElement(ControlePaginacao, { paginacao: { pagina: 1, limite: 20, total: 45, totalPaginas: 3 }, aoTrocar: () => {} }));
    assert.ok(texto(primeira).includes("1–20 de 45 produtos"));
    assert.ok(/disabled/.test(primeira.slice(primeira.indexOf("data-pagina-anterior"), primeira.indexOf("Anterior"))), "na primeira página não há anterior");

    const ultima = renderToStaticMarkup(createElement(ControlePaginacao, { paginacao: { pagina: 3, limite: 20, total: 45, totalPaginas: 3 }, aoTrocar: () => {} }));
    assert.ok(texto(ultima).includes("41–45 de 45 produtos"), "a última página não promete mais do que tem");
    assert.ok(/disabled/.test(ultima.slice(ultima.indexOf("data-pagina-proxima"))));
  });

  it("sem produtos não há paginação nenhuma na tela", () => {
    assert.equal(renderToStaticMarkup(createElement(ControlePaginacao, { paginacao: { pagina: 1, limite: 20, total: 0, totalPaginas: 1 }, aoTrocar: () => {} })), "");
  });
});

describe("FormularioProduto", () => {
  it("tem Nome, Descrição, Preço, Disponibilidade e Categoria", () => {
    const html = renderToStaticMarkup(createElement(FormularioProduto, { produto: null, categorias, enviando: false, aoSalvar: () => {}, aoCancelar: () => {} }));
    for (const campo of ['name="nomeProduto"', 'name="descricaoProduto"', 'name="precoProduto"', 'name="disponibilidadeProduto"', 'name="categoriaProduto"']) {
      assert.ok(html.includes(campo), campo);
    }
    const conteudo = texto(html);
    assert.ok(conteudo.includes("Sem categoria") && conteudo.includes("Pizzas") && conteudo.includes("Bebidas"));
  });

  it("produto novo explica por que a imagem ainda não pode ser enviada", () => {
    const html = renderToStaticMarkup(createElement(FormularioProduto, { produto: null, categorias, enviando: false, aoSalvar: () => {}, aoCancelar: () => {} }));
    assert.ok(texto(html).includes("Crie o produto primeiro"));
    assert.ok(!html.includes('type="file"'), "sem produto não existe destino para o arquivo");
  });

  it("em edição, preço aparece em reais e a imagem pode ser enviada de verdade", () => {
    const html = renderToStaticMarkup(
      createElement(FormularioProduto, { produto: base, categorias, enviando: false, aoSalvar: () => {}, aoCancelar: () => {}, aoEnviarImagem: async () => {} }),
    );
    assert.ok(html.includes('value="39,90"'));
    assert.ok(html.includes("Salvar produto"));
    assert.ok(html.includes('type="file"') && html.includes('accept="image/jpeg,image/png,image/webp"'));
    assert.ok(texto(html).includes("Adicionar imagem"));
  });
});

describe("GerenciadorCategorias", () => {
  const categorias = [{ id: "cccccccc-0000-4000-8000-000000000000", nome: "Bebidas", posicao: 0, produtos: 2 }];
  const marcacao = () =>
    renderToStaticMarkup(
      createElement(GerenciadorCategorias, { empresaId: "aaaaaaaa-0000-4000-8000-000000000000", categorias, aoMudar: () => {} }),
    );

  it("adicionar categoria é um envio de formulário de verdade, não um clique solto", () => {
    const marcado = marcacao();
    // O botão precisa ser `submit` DENTRO do form: é o que faz Enter no campo também funcionar.
    const formulario = marcado.slice(marcado.indexOf("<form"), marcado.indexOf("</form>"));
    assert.ok(formulario.includes('name="nomeCategoria"'), "o campo tem nome, que é como o valor é lido");
    assert.ok(formulario.includes('type="submit"'), "o botão envia o formulário");
    assert.ok(texto(formulario).includes("Adicionar categoria"));
  });

  /*
   * REGRESSÃO: o formulário aceitava envio com o nome vazio e retornava em silêncio — para quem usa,
   * "cliquei em adicionar e não aconteceu nada". O campo passou a ser obrigatório, então o próprio
   * navegador barra e aponta o campo antes mesmo de chegar ao código.
   */
  it("o campo da nova categoria é obrigatório: clicar com ele vazio nunca é um clique mudo", () => {
    const marcado = marcacao();
    const campo = marcado.match(/<input[^>]*name="nomeCategoria"[^>]*>/)?.[0] ?? "";
    assert.ok(campo !== "", "campo da nova categoria existe");
    assert.ok(campo.includes("required"), "campo obrigatório");
  });

  it("apagar categoria avisa que os produtos dela continuam existindo", () => {
    const marcado = marcacao();
    assert.ok(marcado.includes(`data-remover-categoria="${categorias[0]!.id}"`));
    assert.ok(texto(marcado).includes("2 produtos"));
  });
});
