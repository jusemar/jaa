import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { CategoriaProduto, Produto } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { executarAcaoDeImagem } from "../lib/acao-imagem.ts";
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
  const lista = (produtos: Produto[], extra: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(ListaProdutos, { produtos, aoEditar: () => {}, aoAlternarDisponibilidade: () => {}, ...extra }));
  const refri: Produto = { ...base, id: "bbbbbbbb-0000-4000-8000-000000000000", nome: "Refrigerante 2L", descricao: null, precoCentavos: 1200, disponibilidade: "indisponivel" };
  const tag = (html: string, atributo: string) => html.match(new RegExp(`<[^>]*${atributo}[^>]*>`))?.[0] ?? "";

  it("mostra nome e preço de cada produto", () => {
    const conteudo = texto(lista([base, refri]));
    for (const esperado of ["Pizza Calabresa", "R$ 39,90", "Refrigerante 2L", "R$ 12,00"]) assert.ok(conteudo.includes(esperado), esperado);
  });

  it("DISPONÍVEL é o normal e não tem selo; só a exceção (indisponível) é indicada, de forma discreta", () => {
    const html = lista([base, refri]);
    assert.ok(!/Dispon[ií]vel(?!\w)/.test(texto(html).replace(/Indisponível/g, "")), "a palavra 'Disponível' não aparece em lugar nenhum");
    assert.equal((html.match(/data-rotulo-disponibilidade/g) ?? []).length, 1, "um selo só: o do produto indisponível");
    const doRefri = html.slice(html.indexOf('data-disponibilidade="indisponivel"'));
    assert.ok(texto(doRefri).includes("Indisponível") && doRefri.includes("bg-aviso/10"));
    // Redução visual: nome e imagem esmaecidos, sem bloco grande.
    assert.ok(tag(doRefri, "data-nome-do-produto").includes("text-conteudo-suave") && tag(doRefri, "data-sem-imagem").includes("opacity-60"));
    assert.ok(!tag(html, "data-nome-do-produto").includes("text-conteudo-suave"), "o disponível fica com a cor normal");
  });

  it("composição do item: imagem, nome em cima, descrição logo abaixo, categoria discreta, preço à direita e ⋮ por último", () => {
    const html = lista([{ ...base, categoriaNome: "Pizzas" }]);
    const posicoes = ["data-sem-imagem", "data-nome-do-produto", "data-descricao", "data-categoria", "data-preco", "data-acoes-do-produto"].map((marca) => html.indexOf(marca));
    assert.ok(posicoes.every((posicao, indice) => posicao > 0 && (indice === 0 || posicao > posicoes[indice - 1]!)), JSON.stringify(posicoes));
  });

  it("o nome pode usar duas linhas e é o texto mais forte; o preço é MENOR, não quebra e fica colado ao menu", () => {
    const html = lista([base]);
    const nome = tag(html, "data-nome-do-produto");
    assert.ok(nome.includes("line-clamp-2") && nome.includes("text-[15px]") && nome.includes("[overflow-wrap:anywhere]") && !nome.includes("truncate"));
    const preco = tag(html, "data-preco");
    assert.ok(preco.includes("text-sm") && preco.includes("font-semibold") && preco.includes("whitespace-nowrap") && preco.includes("shrink-0"));
  });

  it("a descrição vem logo abaixo do nome e pode quebrar em duas linhas; a categoria é uma linha discreta com ícone", () => {
    const html = lista([{ ...base, categoriaNome: "Pizzas" }]);
    const descricao = tag(html, "data-descricao");
    assert.ok(descricao.includes("line-clamp-2") && descricao.includes("text-conteudo-suave") && texto(html).includes("Molho e calabresa"));
    const categoria = html.slice(html.indexOf("data-categoria"), html.indexOf("data-preco"));
    assert.ok(categoria.includes("<svg") && categoria.includes("text-xs") && texto(categoria).includes("Pizzas"));
    assert.ok(!lista([refri]).includes("data-descricao") && !lista([{ ...base, descricao: null }]).includes("data-categoria"), "o que não existe não ocupa linha");
  });

  it("tocar na linha abre a edição; nenhum botão de TEXTO ('Editar', 'Marcar indisponível') fica no cartão", () => {
    const html = lista([base, refri]);
    assert.equal((html.match(/data-abrir-produto/g) ?? []).length, 2);
    assert.ok(tag(html, "data-abrir-produto").includes("flex-1") && tag(html, "data-abrir-produto").includes('type="button"'));
    assert.ok(!/>Editar</.test(html) && !texto(html).includes("Marcar indisponível") && !texto(html).includes("Tornar disponível"));
  });

  it("a única ação do item é o menu de três pontos VERTICAIS, no topo direito — sem lápis nem botão de texto", () => {
    const html = lista([base]);
    assert.equal((html.match(/data-menu-mais/g) ?? []).length, 1);
    assert.ok(html.includes('aria-label="Ações de Pizza Calabresa"') && />⋮</.test(html) && !/>⋯</.test(html));
    assert.ok(!html.includes("data-editar-produto"));
    assert.ok(tag(html, "data-produto-id").includes("items-start"), "o menu fica no topo do item");
    assert.ok(html.indexOf("data-preco") < html.indexOf("data-menu-mais"), "o preço vem antes (à esquerda) dos três pontos");
  });

  it("o menu ⋯ traz Editar e a troca de disponibilidade, com o texto certo para cada situação", () => {
    const codigo = readFileSync(new URL("./lista-produtos.tsx", import.meta.url), "utf8");
    assert.ok(codigo.includes('{ id: "editar", rotulo: "Editar", aoEscolher: () => aoEditar(produto) }'));
    assert.ok(codigo.includes('rotulo: disponivel ? "Marcar indisponível" : "Tornar disponível"') && codigo.includes("aoEscolher: () => aoAlternarDisponibilidade(produto)"));
  });

  it("um cartão por produto, com respiro entre eles; em tela larga, duas colunas", () => {
    const ol = tag(lista([base]), "data-lista-de-produtos");
    assert.ok(ol.includes("flex-col") && ol.includes("gap-2") && ol.includes("lg:grid") && ol.includes("lg:grid-cols-2"));
    assert.ok(tag(lista([base]), "data-produto-id").includes("rounded-jaa border border-borda bg-superficie"));
    assert.ok(!lista([base]).includes(" style="));
  });

  it("cabeçalho só com ícones (Categorias e Novo), filtro 'Todas' compacto e busca automática", () => {
    const area = readFileSync(new URL("./area-produtos.tsx", import.meta.url), "utf8");
    const cabecalho = area.slice(area.indexOf("data-lista-administrativa"), area.indexOf("data-filtros-de-produtos"));
    assert.ok(cabecalho.includes('aria-label="Categorias"') && cabecalho.includes("<IconeGrade") && cabecalho.includes('aria-label="Novo produto"') && cabecalho.includes("<IconeMais"));
    assert.ok(!/>\s*Categorias\s*</.test(cabecalho) && !/>\s*Novo/.test(cabecalho), "sem texto nos botões");
    const filtros = area.slice(area.indexOf("data-filtros-de-produtos"), area.indexOf("</form>"));
    assert.ok(filtros.includes('<option value="">Todas</option>') && filtros.includes("grid-cols-[minmax(0,1fr)_minmax(0,7rem)]") && filtros.includes('aria-label="Filtrar por categoria"'));
    assert.ok(!filtros.includes('type="submit"') && !/>\s*Filtrar\s*</.test(filtros));
    assert.ok(/setTimeout\(\(\) => \{\s*setPagina\(1\);\s*setBuscaAplicada\(termo\);\s*\}, 350\)/.test(area), "a busca se aplica sozinha");
    assert.ok(area.includes('data-lista-administrativa className="-mx-1.5 flex flex-col gap-3 sm:mx-0'), "respiro lateral próprio desta tela");
    assert.ok(!/style=\{/.test(area));
  });

  it("mostra a imagem quando existe; sem imagem, um marcador neutro do mesmo tamanho", () => {
    const comImagem: Produto = { ...base, imagemUrl: "https://arquivos.exemplo.invalid/imagem-produto/a/b.webp" };
    const html = lista([comImagem]);
    assert.ok(html.includes('src="https://arquivos.exemplo.invalid/imagem-produto/a/b.webp"'));
    // alt vazio: o nome do produto está ao lado e o leitor de tela não deve repetir.
    assert.ok(html.includes('alt=""'));
    const semImagem = lista([base]);
    assert.ok(semImagem.includes("data-sem-imagem") && tag(semImagem, "data-sem-imagem").includes("h-16 w-16 min-[380px]:h-[4.5rem]") && tag(html, "alt=").includes("h-16 w-16 min-[380px]:h-[4.5rem]"));
  });

  it("catálogo vazio oferece o próximo passo, em vez de uma tela morta", () => {
    const conteudo = texto(lista([], { aoNovo: () => {} }));
    assert.ok(conteudo.includes("Nenhum produto por aqui"));
    assert.ok(conteudo.includes("Novo produto"));
  });
});

describe("ControlePaginacao", () => {
  const paginas = (pagina: number, total: number, totalPaginas: number) => renderToStaticMarkup(createElement(ControlePaginacao, { paginacao: { pagina, limite: 20, total, totalPaginas }, aoTrocar: () => {} }));
  const tag = (html: string, atributo: string) => html.match(new RegExp(`<[^>]*${atributo}[^>]*>`))?.[0] ?? "";

  it("compacta: ‹ 1 / 3 › com setas de ícone e nome acessível — sem 'Anterior', 'Página 1 de 3' e 'Próxima' por extenso", () => {
    const primeira = paginas(1, 45, 3);
    assert.ok(texto(primeira).includes("1–20 de 45 produtos"));
    assert.ok(/1\s*\/ 3/.test(texto(primeira)) && !/>Anterior<|>Próxima</.test(primeira) && !texto(primeira).includes("Página 1 de 3"));
    assert.ok(tag(primeira, "data-pagina-anterior").includes('aria-label="Página anterior"') && tag(primeira, "data-pagina-proxima").includes('aria-label="Próxima página"'));
    assert.ok(tag(primeira, "data-pagina-atual").includes('aria-label="Página 1 de 3"'), "o leitor de tela continua ouvindo por extenso");
  });

  it("desativa o que não existe: sem anterior na primeira, sem próxima na última", () => {
    const primeira = paginas(1, 45, 3);
    assert.ok(tag(primeira, "data-pagina-anterior").includes('disabled=""') && !tag(primeira, "data-pagina-proxima").includes('disabled=""'));
    const ultima = paginas(3, 45, 3);
    assert.ok(texto(ultima).includes("41–45 de 45 produtos"), "a última página não promete mais do que tem");
    assert.ok(tag(ultima, "data-pagina-proxima").includes('disabled=""') && !tag(ultima, "data-pagina-anterior").includes('disabled=""'));
  });

  it("com uma página só não há para onde ir: sobra a contagem, sem botões", () => {
    const unica = paginas(1, 7, 1);
    assert.ok(texto(unica).includes("7 produtos") && !unica.includes("data-paginas") && !unica.includes("<button"));
    assert.ok(texto(paginas(1, 1, 1)).includes("1 produto"));
  });

  it("sem produtos não há paginação nenhuma na tela", () => {
    assert.equal(paginas(1, 0, 1), "");
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
    assert.ok(texto(html).includes("A foto é adicionada logo depois de criar o produto"));
    assert.ok(!html.includes('type="file"'), "sem produto não existe destino para o arquivo");
  });

  it("em edição, preço aparece em reais e a imagem pode ser enviada de verdade", () => {
    const html = renderToStaticMarkup(
      createElement(FormularioProduto, { produto: base, categorias, enviando: false, aoSalvar: () => {}, aoCancelar: () => {}, aoEnviarImagem: async () => {} }),
    );
    assert.ok(html.includes('value="39,90"'));
    assert.ok(html.includes("Salvar produto"));
    assert.ok(/type="submit"[^>]*form="formulario-produto"|form="formulario-produto"[^>]*type="submit"/.test(html), "o botão da barra de ações envia o formulário");
    assert.ok(html.includes('type="file"') && html.includes('accept="image/jpeg,image/png,image/webp"'));
    assert.ok(texto(html).includes("Adicionar imagem"));
  });
});

describe("Editar produto: composição da tela", () => {
  const tela = (produto: Produto | null, extra: Record<string, unknown> = {}) =>
    renderToStaticMarkup(createElement(FormularioProduto, { produto, categorias, enviando: false, aoSalvar: () => {}, aoCancelar: () => {}, ...extra }));

  it("trilha, título e as ações Prévia (só com produto salvo) e Catálogo", () => {
    const html = tela(base, { empresaId: base.empresaId });
    assert.ok(/Cardápio\s*›\s*Produtos\s*›\s*Editar produto/.test(texto(html)) && html.includes("<h1"));
    assert.ok(html.includes("data-abrir-previa") && html.includes("data-voltar-catalogo"));
    const novo = tela(null, { empresaId: base.empresaId });
    assert.ok(texto(novo).includes("Novo produto") && !novo.includes("data-abrir-previa") && texto(novo).includes("Criar produto"));
    assert.ok(texto(novo).includes("Os grupos de opções (tamanho, acompanhamentos…) são adicionados logo depois de criar o produto."));
  });

  it("'No cardápio do cliente' mostra nome, descrição, preço e disponibilidade do que está na tela", () => {
    const html = tela({ ...base, disponibilidade: "indisponivel" }, { empresaId: base.empresaId });
    const cartao = html.slice(html.indexOf("data-cartao-da-previa"));
    assert.ok(texto(cartao).includes("Indisponível") && texto(cartao).includes("Pizza Calabresa") && texto(cartao).includes("Molho e calabresa") && texto(cartao).includes("R$ 39,90"));
    assert.ok(cartao.includes("data-ver-como-cliente") && texto(cartao).includes("Um produto, diferentes dias"));
  });

  it("duas composições: uma coluna no celular (campos sem cartão em volta) e duas colunas a partir de lg", () => {
    const html = tela(base, { empresaId: base.empresaId });
    assert.ok(html.includes("lg:grid-cols-[minmax(0,1fr)_17.5rem]"));
    assert.ok(html.includes("sm:rounded-jaa sm:border sm:border-borda sm:bg-superficie sm:p-6"), "o cartão do formulário só existe a partir de sm");
    assert.ok(html.includes("min-[360px]:grid-cols-2"), "preço e disponibilidade lado a lado, menos em tela muito estreita");
    assert.ok(html.includes("sm:max-lg:grid-cols-2"), "no tablet o cartão do cliente fica lado a lado");
  });

  it("barra de ações: estado do produto, Cancelar e Salvar — presa acima da navegação no celular", () => {
    const html = tela(base);
    const barra = html.slice(html.indexOf("data-barra-de-acoes"));
    assert.ok(barra.includes('data-estado-do-produto="salvo"') && texto(barra).includes("Todas as alterações salvas") && texto(barra).includes("Cancelar"));
    assert.ok(html.includes("sticky bottom-[calc(env(safe-area-inset-bottom)-2rem)]") && html.includes("md:static"));
    assert.ok(tela(null).includes('data-estado-do-produto="nao-salvo"'));
  });

  it("sem estilo inline na tela", () => {
    assert.ok(!tela(base, { empresaId: base.empresaId }).includes(" style="));
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

describe("imagem principal do produto na administração", () => {
  const URL_A = "https://pub-exemplo.r2.dev/imagem-produto/aaaaaaaa-0000-4000-8000-000000000000/a.webp";
  const URL_B = "https://pub-exemplo.r2.dev/imagem-produto/aaaaaaaa-0000-4000-8000-000000000000/b.webp";
  const formulario = (produto: Produto) =>
    renderToStaticMarkup(
      createElement(FormularioProduto, { produto, categorias, enviando: false, aoSalvar: () => {}, aoCancelar: () => {}, aoEnviarImagem: async () => {}, aoRemoverImagem: async () => {} }),
    );

  it("com imagem: mostra a atual e oferece Alterar e Remover", () => {
    const html = formulario({ ...base, imagemUrl: URL_A });
    assert.ok(html.includes(`src="${URL_A}"`));
    assert.ok(texto(html).includes("Alterar imagem") && texto(html).includes("Remover"));
  });

  it("sem imagem: marcador neutro e Adicionar imagem, sem Remover", () => {
    const html = formulario(base);
    assert.ok(html.includes("data-imagem-do-produto") && !html.includes("<img"));
    assert.ok(texto(html).includes("Adicionar imagem") && !texto(html).includes("Remover"));
  });

  it("a tela é função do produto relido: A → B (troca) → null (remoção)", () => {
    assert.ok(formulario({ ...base, imagemUrl: URL_A }).includes(`src="${URL_A}"`));
    const trocada = formulario({ ...base, imagemUrl: URL_B });
    assert.ok(trocada.includes(`src="${URL_B}"`) && !trocada.includes(URL_A));
    assert.ok(!formulario({ ...base, imagemUrl: null }).includes("<img"));
  });
});

describe("executarAcaoDeImagem", () => {
  it("sucesso: relê o produto (a tela passa a mostrar a imagem nova)", async () => {
    let releu = 0;
    await executarAcaoDeImagem(async () => ({ ok: true }), async () => {
      releu += 1;
    });
    assert.equal(releu, 1);
  });

  it("falha: lança a mensagem REAL da API e não relê nada — a imagem anterior continua na tela", async () => {
    let releu = 0;
    await assert.rejects(
      executarAcaoDeImagem(async () => ({ ok: false, mensagem: "A imagem deve ter no máximo 8 MB." }), async () => {
        releu += 1;
      }),
      { message: "A imagem deve ter no máximo 8 MB." },
    );
    assert.equal(releu, 0);
  });
});
