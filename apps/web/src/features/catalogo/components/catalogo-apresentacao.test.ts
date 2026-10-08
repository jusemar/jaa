import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { OBSERVACAO_ITEM_TAMANHO_MAXIMO, type CategoriaPublica, type EmpresaPublica, type GrupoOpcoesPublico, type ProdutoPublico } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ID_SECAO_SEM_CATEGORIA, montarSecoes } from "../lib/cardapio.ts";
import { Cardapio, DetalheProdutoCatalogo } from "./catalogo-apresentacao.tsx";

const texto = (html: string) => html.replace(/<[^>]+>/g, "").replace(/ /g, " ");
const empresa: EmpresaPublica = { identidadeId: "bbbbbbbb-0000-4000-8000-000000000000", nome: "Pizzaria BH", nomeUsuario: "pizzariabh", slug: "pizzaria-bh" };

// Categorias e produtos são os que a EMPRESA cadastrou — nada de categoria fixa no componente.
const pizzas: CategoriaPublica = { id: "c1111111-0000-4000-8000-000000000000", nome: "Pizzas", posicao: 0 };
const bebidas: CategoriaPublica = { id: "c2222222-0000-4000-8000-000000000000", nome: "Bebidas", posicao: 1 };

const calabresa: ProdutoPublico = {
  id: "aaaaaaaa-0000-4000-8000-000000000000",
  nome: "Pizza Calabresa",
  descricao: "Molho e calabresa",
  precoCentavos: 3990,
  disponibilidade: "disponivel",
  categoriaId: pizzas.id,
  imagemUrl: null,
  personalizavel: false,
};
const refrigerante: ProdutoPublico = { ...calabresa, id: "cccccccc-0000-4000-8000-000000000000", nome: "Refrigerante 2L", descricao: null, precoCentavos: 1200, categoriaId: bebidas.id };
const monteSeuPrato: ProdutoPublico = {
  ...calabresa,
  id: "11111111-0000-4000-8000-000000000000",
  nome: "Monte seu prato",
  descricao: null,
  precoCentavos: 2490,
  categoriaId: null,
  personalizavel: true,
};

const tamanho: GrupoOpcoesPublico = {
  id: "22222222-0000-4000-8000-000000000000",
  nome: "Tamanho do prato",
  instrucao: "O tamanho vale para as duas opções.",
  minimoEscolhas: 1,
  maximoEscolhas: 1,
  opcoes: [
    { id: "aaaa1111-0000-4000-8000-000000000000", nome: "Pequeno", precoAdicionalCentavos: 0 },
    { id: "aaaa2222-0000-4000-8000-000000000000", nome: "Grande", precoAdicionalCentavos: 500 },
  ],
};
/*
 * Segundo grupo de escolha única do produto: NÃO é a variação base (que é o primeiro, "Tamanho"),
 * então cada opção mostra apenas o acréscimo — e nada quando ele é zero.
 */
const carne: GrupoOpcoesPublico = {
  id: "44444444-0000-4000-8000-000000000000",
  nome: "Carne",
  instrucao: "Escolha a carne.",
  minimoEscolhas: 1,
  maximoEscolhas: 1,
  opcoes: [
    { id: "cccc1111-0000-4000-8000-000000000000", nome: "Bife bovino", precoAdicionalCentavos: 0 },
    { id: "cccc2222-0000-4000-8000-000000000000", nome: "Peixe", precoAdicionalCentavos: 300 },
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
    { id: "bbbb3333-0000-4000-8000-000000000000", nome: "Batata frita", precoAdicionalCentavos: 300 },
  ],
};

const secoesDoCardapio = montarSecoes([pizzas, bebidas], [calabresa, refrigerante, monteSeuPrato]);

const cardapio = (aoAdicionar?: () => void, secaoEscolhidaId: string | null = null) =>
  renderToStaticMarkup(
    createElement(Cardapio, {
      empresa,
      secoes: secoesDoCardapio,
      secaoEscolhidaId,
      aoEscolherSecao: () => {},
      aoVer: () => {},
      ...(aoAdicionar ? { aoAdicionar } : {}),
    }),
  );

/*
 * Recorte do bloco de um grupo: da TAG de abertura do card (para os atributos que vêm antes do
 * marcador entrarem no recorte) até o início do próximo grupo (ou o resumo).
 */
const blocoDoGrupo = (html: string, grupoId: string) => {
  const marcador = html.indexOf(`data-grupo-opcoes="${grupoId}"`);
  const inicio = html.lastIndexOf("<", marcador);
  const proximo = html.indexOf("data-grupo-opcoes=", marcador + 1);
  return html.slice(inicio, proximo === -1 ? html.indexOf("data-montagem-resumo") : html.lastIndexOf("<", proximo));
};

const montador = () =>
  renderToStaticMarkup(
    createElement(DetalheProdutoCatalogo, {
      empresa,
      produto: monteSeuPrato,
      grupos: [tamanho, acompanhamentos],
      aoVoltar: () => {},
      aoAdicionar: () => {},
    }),
  );

describe("cardápio do cliente (Web)", () => {
  it("mostra busca e as categorias REAIS da empresa como abas, SEM a opção “Todos”", () => {
    const html = cardapio();
    const conteudo = texto(html);
    for (const esperado of ["Pizzas", "Bebidas", "Outros"]) {
      assert.ok(conteudo.includes(esperado), esperado);
    }
    // A faixa "Cardápio de <empresa>" saiu da tela (redundante); o nome fica só no rótulo acessível.
    assert.ok(!conteudo.includes("Cardápio de Pizzaria BH") && html.includes('aria-label="Cardápio de Pizzaria BH"'));
    assert.ok(html.includes('name="buscaCardapio"'), "campo de busca do cardápio");
    assert.ok(html.includes('role="tablist"'));

    // "Todos" não existe mais: o cardápio trabalha por categoria.
    const abas = html.match(/role="tab"/g) ?? [];
    assert.equal(abas.length, 3, "uma aba por seção com produto, e nada além disso");
    assert.ok(!/>\s*Todos\s*</.test(html), "nenhuma aba chamada Todos");
  });

  it("mostra UMA categoria por vez: a primeira abre selecionada e as outras ficam fora da lista", () => {
    // Sem categoria de montagem, a inicial é a primeira da empresa (Pizzas).
    const inicial = texto(cardapio());
    assert.ok(inicial.includes("Pizza Calabresa"), "produto da categoria aberta");
    assert.ok(inicial.includes("R$ 39,90"));
    assert.ok(!inicial.includes("Refrigerante 2L"), "produto de outra categoria não aparece junto");

    // Escolher Bebidas troca o conteúdo inteiro.
    const emBebidas = texto(cardapio(undefined, bebidas.id));
    assert.ok(emBebidas.includes("Refrigerante 2L"));
    assert.ok(emBebidas.includes("R$ 12,00"));
    assert.ok(!emBebidas.includes("Pizza Calabresa"));
  });

  it("a aba selecionada é marcada para leitor de tela, não só pela cor", () => {
    const html = cardapio(undefined, bebidas.id);
    const selecionadas = html.match(/aria-selected="true"/g) ?? [];
    assert.equal(selecionadas.length, 1, "exatamente uma aba selecionada");
  });

  it("não inventa categoria nem produto: só aparece o que a empresa cadastrou", () => {
    const conteudo = texto(cardapio());
    for (const proibido of ["Refrigerantes", "Sobremesas", "Porções", "Pratos prontos"]) {
      assert.ok(!conteudo.includes(proibido), proibido);
    }
  });

  it("sem categoria cadastrada, não mostra chips nem título de seção", () => {
    const html = renderToStaticMarkup(
      createElement(Cardapio, {
        empresa,
        secoes: montarSecoes([], [calabresa, refrigerante]),
        secaoEscolhidaId: null,
        aoEscolherSecao: () => {},
        aoVer: () => {},
      }),
    );
    assert.ok(!html.includes('role="tablist"'), "uma seção só não precisa de filtro");
    assert.ok(texto(html).includes("Pizza Calabresa"));
  });

  it("produto que precisa ser montado oferece Montar, não Adicionar direto", () => {
    // "Monte seu prato" está sem categoria neste cenário, então cai em "Outros" (que nunca é montador).
    const html = cardapio(() => {}, ID_SECAO_SEM_CATEGORIA);
    assert.ok(html.includes("data-montar-produto") && html.includes('aria-label="Montar Monte seu prato"'), "produto personalizável abre a montagem");
    assert.ok(!html.includes('aria-label="Adicionar Monte seu prato"'), "montagem não é adicionada às cegas");

    // O produto comum, na categoria dele, ganha a ação rápida de adicionar.
    assert.ok(cardapio(() => {}).includes('aria-label="Adicionar Pizza Calabresa"'));
  });

  it("sem permissão de compra (a própria empresa olhando), não há ação de adicionar", () => {
    const html = cardapio();
    for (const proibido of ["data-montar-produto", 'aria-label="Adicionar Pizza Calabresa"']) {
      assert.ok(!html.includes(proibido), proibido);
    }
    for (const proibido of ["Editar", "Marcar", "Preço (R$)", "<form"]) assert.ok(!html.includes(proibido), proibido);
  });

  it("detalhe do produto comum: nome, descrição, preço e quantidade — sem 'Disponível' nem o nome da empresa repetido", () => {
    const html = renderToStaticMarkup(
      createElement(DetalheProdutoCatalogo, { empresa, produto: calabresa, grupos: [], aoVoltar: () => {}, aoAdicionar: () => {} }),
    );
    const conteudo = texto(html);
    for (const esperado of ["Pizza Calabresa", "Molho e calabresa", "R$ 39,90", "Adicionar ao pedido"]) {
      assert.ok(conteudo.includes(esperado), esperado);
    }
    // Produto indisponível nem chega ao cliente: escrever "Disponível" era ruído.
    assert.ok(!conteudo.includes("Disponível") && !html.includes("data-disponibilidade"));
    assert.ok(/<span class="sr-only">, de Pizzaria BH<\/span>/.test(html), "a empresa fica só para leitor de tela");
    assert.ok(html.includes("data-voltar-ao-cardapio") && html.includes('aria-label="Voltar ao cardápio"'));
    // Produto sem grupos não mostra montagem.
    assert.ok(!html.includes("data-grupo-opcoes"));
  });

  it("detalhe do produto personalizável monta os grupos da empresa, com a regra de cada um", () => {
    const html = renderToStaticMarkup(
      createElement(DetalheProdutoCatalogo, {
        empresa,
        produto: monteSeuPrato,
        grupos: [tamanho, acompanhamentos],
        aoVoltar: () => {},
        aoAdicionar: () => {},
      }),
    );
    const conteudo = texto(html);
    assert.ok(html.includes(`data-grupo-opcoes="${tamanho.id}"`));
    assert.ok(html.includes(`data-grupo-opcoes="${acompanhamentos.id}"`));
    for (const esperado of [
      "1. Tamanho do prato",
      "(escolha 1)",
      "O tamanho vale para as duas opções.",
      "2. Acompanhamentos",
      "(até 2, opcional)",
      "Batata frita",
      "+R$ 3,00",
    ]) {
      assert.ok(conteudo.includes(esperado), esperado);
    }
    // Escolha única usa rádio; múltipla usa caixa — e o grupo obrigatório já vem com a 1ª marcada.
    assert.equal((html.match(new RegExp(`name="grupo-${tamanho.id}"[^>]*type="radio"|type="radio"[^>]*name="grupo-${tamanho.id}"`, "g")) ?? []).length, 2);
    assert.ok(html.includes('type="checkbox"'));
    // Preço já somado com a opção pré-selecionada (Pequeno, +0) = preço base.
    assert.ok(html.includes("data-preco-montagem"));
    assert.ok(conteudo.includes("R$ 24,90"));
    assert.ok(html.includes("data-adicionar-montagem"));
  });

  it("categoria que É uma montagem mostra o montador no lugar da lista, com os chips ainda visíveis", () => {
    const html = renderToStaticMarkup(
      createElement(Cardapio, {
        empresa,
        secoes: secoesDoCardapio,
        secaoEscolhidaId: null,
        aoEscolherSecao: () => {},
        montagem: { produto: monteSeuPrato, grupos: [tamanho, acompanhamentos], chave: 0 },
        aoVer: () => {},
        aoAdicionar: () => {},
      }),
    );
    // Montador presente…
    assert.ok(html.includes(`data-grupo-opcoes="${tamanho.id}"`));
    assert.ok(html.includes("data-adicionar-montagem"));
    // …a lista de produtos NÃO…
    assert.ok(!html.includes(`data-produto-catalogo-id="${calabresa.id}"`));
    // …e os chips continuam lá, para voltar aos produtos normais.
    assert.ok(html.includes('role="tablist"'));
    // Sem lista, a busca sai do caminho.
    assert.ok(!html.includes('name="buscaCardapio"'));
  });

  it("sem montagem, a lista de produtos aparece e o montador não", () => {
    const html = cardapio(() => {});
    assert.ok(html.includes(`data-produto-catalogo-id="${calabresa.id}"`));
    assert.ok(!html.includes("data-grupo-opcoes"));
    assert.ok(html.includes('name="buscaCardapio"'));
  });

  it("montador: escolha única em UMA linha, guarnições em DUAS colunas; variação base com preço final e demais grupos só com acréscimo", () => {
    const html = renderToStaticMarkup(
      createElement(DetalheProdutoCatalogo, {
        empresa,
        produto: monteSeuPrato,
        grupos: [tamanho, carne, acompanhamentos],
        aoVoltar: () => {},
        aoAdicionar: () => {},
      }),
    );
    const bloco = (grupoId: string) => blocoDoGrupo(html, grupoId);

    // Escolha ÚNICA: linha horizontal rolável, nunca duas colunas.
    const blocoTamanho = bloco(tamanho.id);
    assert.ok(blocoTamanho.includes("overflow-x-auto"), "tamanho rola na horizontal");
    assert.ok(!blocoTamanho.includes("grid-cols-2"), "tamanho não quebra em colunas");
    /*
     * VARIAÇÃO BASE (primeiro grupo de escolha única): cada alternativa mostra o PREÇO FINAL daquela
     * versão do item — 24,90 com Pequeno (+0) e 29,90 com Grande (+5,00) —, porque é esse valor que a
     * pessoa compara e é o que o resumo exibe. Nunca "+R$ 5,00" solto aqui.
     */
    const conteudoTamanho = texto(blocoTamanho);
    assert.ok(conteudoTamanho.includes("R$ 24,90"), "preço final com o pequeno");
    assert.ok(conteudoTamanho.includes("R$ 29,90"), "preço final com o grande");
    assert.ok(!conteudoTamanho.includes("+R$"), "a variação base não mostra acréscimo solto");
    assert.ok(!conteudoTamanho.includes("R$ 0,00"), "nenhuma opção exibe preço zero");

    /*
     * DEMAIS grupos de escolha única (a carne): só o acréscimo, e apenas quando existe. Bife (+0)
     * fica sem valor nenhum; Peixe mostra "+R$ 3,00" — nunca o preço do prato repetido.
     */
    const conteudoCarne = texto(bloco(carne.id));
    assert.ok(conteudoCarne.includes("+R$ 3,00"), "acréscimo do peixe");
    assert.ok(!conteudoCarne.includes("R$ 0,00"), "bife sem preço zero");
    assert.ok(!conteudoCarne.includes("R$ 24,90") && !conteudoCarne.includes("R$ 29,90"), "carne não repete o preço do prato");
    const trechoBife = conteudoCarne.slice(conteudoCarne.indexOf("Bife bovino"), conteudoCarne.indexOf("Peixe"));
    assert.ok(!trechoBife.includes("R$"), "Bife bovino aparece sem valor");

    // MÚLTIPLA escolha: duas colunas, com acréscimo e contador.
    const blocoAcompanhamentos = bloco(acompanhamentos.id);
    assert.ok(blocoAcompanhamentos.includes("grid-cols-2"), "guarnições em duas colunas");
    assert.ok(blocoAcompanhamentos.includes("data-contador-grupo"));
    assert.ok(texto(blocoAcompanhamentos).includes("0/2 selecionadas"));
    assert.ok(texto(blocoAcompanhamentos).includes("+R$ 3,00"), "acréscimo da opção paga");
  });

  it("montador: passo da observação existe, é opcional e limitado", () => {
    const html = renderToStaticMarkup(
      createElement(DetalheProdutoCatalogo, {
        empresa,
        produto: monteSeuPrato,
        grupos: [tamanho, acompanhamentos],
        aoVoltar: () => {},
        aoAdicionar: () => {},
      }),
    );
    const conteudo = texto(html);
    // Numerado DEPOIS dos grupos: 2 grupos → "3. Observação".
    assert.ok(conteudo.includes("3. Observação"), "observação é o passo seguinte aos grupos");
    assert.ok(conteudo.includes("(opcional)"));
    assert.ok(conteudo.includes("Vale só para este item"), "não é recado do pedido inteiro");
    assert.ok(html.includes('name="observacaoItem"'));
    assert.ok(html.includes(`maxLength="${OBSERVACAO_ITEM_TAMANHO_MAXIMO}"`));
  });

  it("montador: grupo obrigatório de escolha única já vem marcado e o botão nasce habilitado", () => {
    const html = renderToStaticMarkup(
      createElement(DetalheProdutoCatalogo, {
        empresa,
        produto: monteSeuPrato,
        grupos: [tamanho, acompanhamentos],
        aoVoltar: () => {},
        aoAdicionar: () => {},
      }),
    );
    const botao = html.match(/<button[^>]*data-adicionar-montagem[^>]*>/)?.[0] ?? "";
    assert.ok(botao !== "", "botão de adicionar existe");
    assert.ok(!botao.includes('disabled=""'), "tamanho pré-selecionado deixa a montagem válida");
    // Resumo traz a variação entre parênteses, como pedido: "Monte seu prato (Pequeno)".
    assert.ok(texto(html).includes("Monte seu prato (Pequeno)"));
  });

  it("montador: sem escolha obrigatória feita, o botão fica desabilitado e diz o que falta", () => {
    // Grupo obrigatório de MÚLTIPLA escolha não vem pré-marcado: nada a adivinhar pelo cliente.
    const obrigatorioMultiplo = { ...acompanhamentos, minimoEscolhas: 2 };
    const html = renderToStaticMarkup(
      createElement(DetalheProdutoCatalogo, {
        empresa,
        produto: monteSeuPrato,
        grupos: [obrigatorioMultiplo],
        aoVoltar: () => {},
        aoAdicionar: () => {},
      }),
    );
    const botao = html.match(/<button[^>]*data-adicionar-montagem[^>]*>/)?.[0] ?? "";
    assert.ok(botao.includes('disabled=""'));
    assert.ok(texto(html).includes("Acompanhamentos"), "a recusa nomeia o grupo que falta");
  });

  /*
   * REGRESSÃO: os grupos eram `fieldset` + `legend`, e o navegador desenha o `legend` NA BORDA do
   * fieldset — o título aparecia por cima do contorno, "fora" do card. Agora é `role="group"` com
   * `aria-labelledby`: mesma semântica de agrupamento, título dentro da caixa de padding.
   */
  it("o título de cada etapa fica DENTRO do card, sem legend/fieldset", () => {
    const html = montador();
    assert.ok(!html.includes("<fieldset"), "nenhum fieldset no montador");
    assert.ok(!html.includes("<legend"), "nenhum legend no montador");

    for (const grupo of [tamanho, acompanhamentos]) {
      const bloco = blocoDoGrupo(html, grupo.id);
      assert.ok(bloco.includes('role="group"'), `${grupo.nome}: agrupamento preservado`);
      assert.ok(bloco.includes(`aria-labelledby="grupo-${grupo.id}-titulo"`), `${grupo.nome}: rotulado`);
      // O elemento do título está DENTRO do mesmo bloco que as opções.
      assert.ok(bloco.includes(`id="grupo-${grupo.id}-titulo"`), `${grupo.nome}: título no card`);
      assert.ok(bloco.includes("data-opcao="), `${grupo.nome}: opções no mesmo card`);
    }
  });

  it("escolha única fica em UMA linha rolável; múltipla em duas colunas", () => {
    const html = montador();

    const linha = blocoDoGrupo(html, tamanho.id);
    assert.ok(linha.includes("flex-nowrap"), "não quebra para a segunda linha");
    assert.ok(linha.includes("overflow-x-auto"), "rola dentro da própria faixa");
    assert.ok(linha.includes("min-w-0"), "a faixa pode encolher até a largura do card");
    assert.ok(!linha.includes("grid-cols-2"), "escolha única nunca vira duas colunas");

    const colunas = blocoDoGrupo(html, acompanhamentos.id);
    assert.ok(colunas.includes("grid-cols-2"), "guarnições em duas colunas");
    assert.ok(!colunas.includes("flex-nowrap"));
  });

  it("o card do grupo pode encolher com a coluna, em vez de vazar para fora dela", () => {
    // `min-w-0` no card: sem ele, o conteúdo mínimo das opções empurraria a largura do card.
    assert.ok(blocoDoGrupo(montador(), tamanho.id).includes("min-w-0"));
  });
});
describe("cardápio do cliente: redesenho mobile-first", () => {
  const tag = (html: string, atributo: string) => html.match(new RegExp(`<[^>]*${atributo}[^>]*>`))?.[0] ?? "";

  it("o topo é UM bloco só (barra do cardápio): busca e categorias juntas, sem faixa de título", () => {
    const html = cardapio();
    assert.equal((html.match(/data-barra-do-cardapio/g) ?? []).length, 1);
    const barra = html.slice(html.indexOf("data-barra-do-cardapio"), html.indexOf("data-produtos-do-cardapio"));
    assert.ok(barra.includes('name="buscaCardapio"') && barra.includes('role="tablist"') && !barra.includes("<h3"));
  });

  it("fechar continua existindo, como um X discreto com nome acessível; sem `aoFechar` (link público) não aparece", () => {
    assert.ok(!cardapio().includes("data-fechar-cardapio"));
    const comFechar = renderToStaticMarkup(createElement(Cardapio, { empresa, secoes: secoesDoCardapio, secaoEscolhidaId: null, aoEscolherSecao: () => {}, aoVer: () => {}, aoFechar: () => {} }));
    assert.equal((comFechar.match(/data-fechar-cardapio/g) ?? []).length, 1);
    assert.ok(tag(comFechar, "data-fechar-cardapio").includes('aria-label="Fechar cardápio"') && !texto(comFechar).includes("Fechar"));
  });

  it("categorias: a selecionada é cheia na cor da marca, as outras numa superfície suave; sem contador pendurado", () => {
    const html = cardapio();
    const abas = [...html.matchAll(/<button[^>]*role="tab"[^>]*>([^<]*)<\/button>/g)];
    assert.equal(abas.length, 3);
    assert.ok(abas[0]![0].includes('aria-selected="true"') && abas[0]![0].includes("bg-marca text-marca-conteudo"));
    assert.ok(abas[1]![0].includes('aria-selected="false"') && abas[1]![0].includes("bg-superficie-suave"));
    assert.ok(abas.every((aba) => /^[^\d]+$/.test(aba[1]!.trim())), "o chip mostra só o nome da categoria");
    assert.ok(abas[0]![0].includes("min-h-10") && abas[0]![0].includes("whitespace-nowrap") && abas[0]![0].includes("shrink-0"));
  });

  it("produtos numa superfície só, com divisórias — não um cartão por produto", () => {
    const lista = tag(cardapio(), "data-produtos-do-cardapio");
    assert.ok(lista.includes("divide-y") && lista.includes("rounded-jaa") && lista.includes("border-borda"));
    assert.ok(!tag(cardapio(), "data-produto-catalogo-id").includes("shadow-cartao"));
  });

  it("produto: nome em até 2 linhas, descrição secundária, preço em destaque e nenhum selo 'Disponível'", () => {
    const html = cardapio();
    const nome = tag(html, "data-nome-do-produto");
    assert.ok(nome.includes("line-clamp-2") && nome.includes("font-semibold") && !nome.includes("truncate"));
    assert.ok(tag(html, "data-preco").includes("font-bold") && tag(html, "data-preco").includes("text-marca"));
    assert.ok(!texto(html).includes("Disponível") && !html.includes("data-disponibilidade"));
    const posicoes = ["data-sem-imagem", "data-nome-do-produto", "data-preco"].map((marca) => html.indexOf(marca, html.indexOf("data-produto-catalogo-id")));
    assert.ok(posicoes[0]! < posicoes[1]! && posicoes[1]! < posicoes[2]!, "imagem → nome → preço");
  });

  it("no celular o cardápio usa quase toda a largura (1 px de folga, com área segura) — só nesta área", () => {
    const codigo = readFileSync(new URL("./catalogo-da-empresa.tsx", import.meta.url), "utf8");
    assert.ok(codigo.includes("pl-[max(1px,env(safe-area-inset-left))]") && codigo.includes("pr-[max(1px,env(safe-area-inset-right))]") && codigo.includes("@container") && codigo.includes("@lg:pl-5 @lg:pr-5"));
    for (const arquivo of ["./catalogo-da-empresa.tsx", "./catalogo-apresentacao.tsx", "./funcionamento-da-empresa.tsx", "./montagem-produto.tsx"]) {
      assert.ok(!/style=\{/.test(readFileSync(new URL(arquivo, import.meta.url), "utf8")), `${arquivo}: sem style inline`);
    }
  });
});

describe("imagem do produto no catálogo do cliente", () => {
  const URL = "https://pub-exemplo.r2.dev/imagem-produto/aaaaaaaa-0000-4000-8000-000000000000/a.webp";
  const comImagem: ProdutoPublico = { ...calabresa, imagemUrl: URL };
  const cardapioCom = (produto: ProdutoPublico) =>
    renderToStaticMarkup(
      createElement(Cardapio, {
        empresa,
        secoes: montarSecoes([pizzas], [produto]),
        secaoEscolhidaId: null,
        aoEscolherSecao: () => {},
        aoVer: () => {},
      }),
    );
  const detalhe = (produto: ProdutoPublico) =>
    renderToStaticMarkup(createElement(DetalheProdutoCatalogo, { empresa, produto, grupos: [], aoVoltar: () => {}, aoAdicionar: () => {} }));

  it("card do cardápio e detalhe mostram a imagem real quando há imagemUrl", () => {
    assert.ok(cardapioCom(comImagem).includes(`src="${URL}"`));
    assert.ok(detalhe(comImagem).includes(`src="${URL}"`));
  });

  it("sem imagem: o marcador neutro existente (data-sem-imagem), nunca <img> quebrado", () => {
    for (const html of [cardapioCom(calabresa), detalhe(calabresa)]) {
      assert.ok(html.includes("data-sem-imagem"));
      assert.ok(!html.includes("<img"));
    }
  });
});
