import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EmpresaPublica, EnderecoCliente } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Carrinho } from "../lib/carrinho.ts";
import { PainelCarrinho, PainelPedidoVazio } from "./painel-carrinho.tsx";

const texto = (html: string) => html.replace(/<[^>]+>/g, "").replace(/ /g, " ");
const empresa: EmpresaPublica = {
  identidadeId: "bbbbbbbb-0000-4000-8000-000000000000",
  nome: "Pizzaria BH",
  nomeUsuario: "pizzariabh",
  slug: "pizzaria-bh",
};
const carrinho: Carrinho = {
  empresa,
  itens: [
    {
      linhaId: "aaaaaaaa-0000-4000-8000-000000000000",
      produtoId: "aaaaaaaa-0000-4000-8000-000000000000",
      nome: "Pizza Calabresa",
      precoUnitarioCentavos: 3990,
      quantidade: 2,
      imagemUrl: null,
      escolhas: [], observacao: null,
    },
    {
      linhaId: "cccccccc-0000-4000-8000-000000000000",
      produtoId: "cccccccc-0000-4000-8000-000000000000",
      nome: "Refrigerante 2L",
      precoUnitarioCentavos: 1200,
      quantidade: 1,
      imagemUrl: null,
      escolhas: [], observacao: null,
    },
  ],
};

/* Item MONTADO: o mesmo produto poderia estar aqui duas vezes, então a linha é que identifica. */
const carrinhoMontado: Carrinho = {
  empresa,
  itens: [
    {
      linhaId: "11111111-0000-4000-8000-000000000000|aaaa2222-0000-4000-8000-000000000000",
      produtoId: "11111111-0000-4000-8000-000000000000",
      nome: "Monte seu prato",
      precoUnitarioCentavos: 2990,
      quantidade: 1,
      imagemUrl: null,
      escolhas: [
        { opcaoId: "aaaa2222-0000-4000-8000-000000000000", grupoNome: "Tamanho", opcaoNome: "Grande", precoAdicionalCentavos: 500 },
        { opcaoId: "bbbb1111-0000-4000-8000-000000000000", grupoNome: "Acompanhamentos", opcaoNome: "Arroz", precoAdicionalCentavos: 0 },
      ],
      observacao: null,
    },
  ],
};

// Destino já escolhido e com ponto confirmado (a etapa de endereço tem testes próprios).
const endereco: EnderecoCliente = {
  id: "dddddddd-0000-4000-8000-000000000000",
  apelido: "Casa",
  cep: "30123000",
  logradouro: "Rua das Flores",
  numero: "150",
  complemento: "Apto 302",
  bairro: "Centro",
  cidade: "Belo Horizonte",
  uf: "MG",
  pontoReferencia: "Portão azul",
  latitude: -19.919125,
  longitude: -43.938602,
  localizacaoConfirmadaEm: "2026-09-16T12:00:00.000Z",
  criadoEm: "2026-09-16T11:00:00.000Z",
  atualizadoEm: "2026-09-16T12:00:00.000Z",
};

const renderizar = (
  atual: Carrinho = carrinho,
  destino: EnderecoCliente | null = endereco,
  coberturaAprovada = true,
) =>
  renderToStaticMarkup(
    createElement(PainelCarrinho, {
      carrinho: atual,
      endereco: destino,
      coberturaAprovada,
      enviando: false,
      erro: null,
      aoAlterarQuantidade: () => {},
      aoRemover: () => {},
      aoTrocarEndereco: () => {},
      aoConfirmar: () => {},
      aoFechar: () => {},
    }),
  );

describe("carrinho e confirmação do pedido (Web técnica)", () => {
  it('é o painel "Seu pedido": blocos de entrega, itens, pagamento e o fecho da conta', () => {
    const html = renderizar();
    const conteudo = texto(html);
    for (const esperado of [
      "Seu pedido",
      "Entrega",
      "Itens",
      "Pizza Calabresa",
      // O valor exibido é o da LINHA (unitário × quantidade), que é o que soma no total.
      "R$ 79,80",
      "Refrigerante 2L",
      "R$ 12,00",
      "Total",
      "R$ 91,80",
    ]) {
      assert.ok(conteudo.includes(esperado), esperado);
    }
    // Subtotal (itens) e Total são linhas próprias; a taxa de entrega é do domínio de entrega.
    assert.ok(html.includes("data-subtotal-carrinho"));
    assert.ok(html.includes("data-total-carrinho"));
    assert.ok(!conteudo.includes("Taxa de entrega"), "o painel não inventa frete");
  });

  it("linha do item é compacta: sem repetir quantidade × preço e com o seletor junto do excluir", () => {
    const html = renderizar();
    const conteudo = texto(html);

    /*
     * "(2 × R$ 39,90)" saiu: repetia o que o próprio seletor de quantidade já diz e empurrava os
     * controles para uma linha extra. O valor da linha continua visível.
     */
    assert.ok(!conteudo.includes("(2 × R$ 39,90)"), "sem quantidade × preço repetidos");
    assert.ok(!/\(\d+ × R\$/.test(conteudo), "nenhuma linha repete a conta");
    assert.ok(conteudo.includes("R$ 79,80"), "o valor da linha continua visível");

    // Seletor de quantidade e excluir na MESMA faixa: um único contêiner à direita do item.
    const item = html.slice(
      html.indexOf('data-item-carrinho="aaaaaaaa'),
      html.indexOf("</li>", html.indexOf('data-item-carrinho="aaaaaaaa')),
    );
    const diminuir = item.indexOf('aria-label="Diminuir Pizza Calabresa"');
    const aumentar = item.indexOf('aria-label="Aumentar Pizza Calabresa"');
    const remover = item.indexOf('aria-label="Remover Pizza Calabresa"');
    assert.ok(diminuir > 0 && aumentar > diminuir && remover > aumentar, "excluir vem depois do seletor");
    // Nada entre o seletor e o excluir fecha a faixa: é o mesmo bloco de controles.
    assert.ok(!item.slice(aumentar, remover).includes("<div"), "seletor e excluir na mesma faixa");
    // Alvo de toque preservado no celular, mesmo com o seletor menor.
    assert.ok(item.includes("h-9"), "alvo de toque de 36px no celular");

    // "+ Adicionar mais itens" saiu: quem escolhe mais volta pelo cardápio, que já está a um toque.
    assert.ok(!conteudo.includes("Adicionar mais itens"));
  });

  it("a ação principal fica na parte inferior: painel preenche a altura e só o corpo rola", () => {
    const html = renderizar();
    /*
     * Composição, não `position: fixed`: o painel ocupa a altura disponível (`flex-1`), o corpo fica
     * com a sobra e rola (`min-h-0 flex-1 overflow-y-auto`) e o rodapé da ação é `shrink-0`. Assim o
     * CTA fica embaixo com pouco ou com muito conteúdo, na tela única e na coluna do desktop.
     */
    const secao = html.slice(0, html.indexOf(">") + 1);
    // `grow` + `min-h-0`: ocupa a sobra sem ser esmagado quando divide a coluna com outro bloco.
    assert.ok(secao.includes("grow") && secao.includes("flex-col") && secao.includes("min-h-0"), "o painel ocupa a altura");

    const corpo = html.match(/<div class="[^"]*overflow-y-auto[^"]*"/)?.[0] ?? "";
    assert.ok(corpo.includes("min-h-0") && corpo.includes("flex-1"), "só o corpo rola");

    const rodape = html.slice(html.lastIndexOf('<div class="shrink-0 border-t'));
    assert.ok(rodape.includes("data-ir-para-entrega"), "Continuar está no rodapé");
    assert.ok(rodape.includes("data-total-carrinho"), "Confirmar pedido e o total estão no rodapé");
    assert.ok(!html.includes("fixed"), "nada de position fixed sobre a página");
  });

  it("sai do pedido por seta em tela reduzida e por X na coluna do desktop", () => {
    const html = renderizar();
    const cabecalho = html.slice(0, html.indexOf("</header>"));
    const seta = cabecalho.match(/<button[^>]*aria-label="Voltar à conversa"[^>]*>/)?.[0] ?? "";
    const fechar = cabecalho.match(/<button[^>]*aria-label="Fechar seu pedido"[^>]*>/)?.[0] ?? "";
    assert.ok(seta.includes("xl:hidden"), "a seta existe só onde o pedido é uma TELA");
    assert.ok(fechar.includes("xl:grid") && fechar.includes("hidden"), "o X existe só onde ele é painel");
  });

  it('"Limpar" só aparece quando a conversa oferece essa ação', () => {
    assert.ok(!texto(renderizar()).includes("Limpar"));
    const comLimpar = renderToStaticMarkup(
      createElement(PainelCarrinho, {
        carrinho,
        endereco,
        coberturaAprovada: true,
        enviando: false,
        erro: null,
        aoAlterarQuantidade: () => {},
        aoRemover: () => {},
        aoTrocarEndereco: () => {},
        aoConfirmar: () => {},
        aoFechar: () => {},
        aoLimpar: () => {},
      }),
    );
    assert.ok(texto(comLimpar).includes("Limpar"));
  });

  it("painel vazio convida a escolher no cardápio, em vez de sumir da tela", () => {
    const html = renderToStaticMarkup(createElement(PainelPedidoVazio, { aoFechar: () => {} }));
    const conteudo = texto(html);
    assert.ok(conteudo.includes("Seu pedido"));
    assert.ok(conteudo.includes("Seu pedido está vazio"));
    assert.ok(conteudo.includes("Escolha os itens no cardápio"));
  });

  it("item personalizado mostra a montagem escolhida e o acréscimo, com o preço já somado", () => {
    const html = renderToStaticMarkup(
      createElement(PainelCarrinho, {
        carrinho: carrinhoMontado,
        endereco,
        coberturaAprovada: true,
        enviando: false,
        erro: null,
        aoAlterarQuantidade: () => {},
        aoRemover: () => {},
        aoTrocarEndereco: () => {},
        aoConfirmar: () => {},
        aoFechar: () => {},
      }),
    );
    const conteudo = texto(html);
    assert.ok(html.includes("data-escolhas-item"));
    for (const esperado of ["Monte seu prato", "Grande", "(+R$ 5,00)", "Arroz", "R$ 29,90"]) {
      assert.ok(conteudo.includes(esperado), esperado);
    }
  });

  it("oferece somente pagamento na entrega: dinheiro ou cartão", () => {
    const html = renderizar();
    const conteudo = texto(html);
    assert.ok(conteudo.includes("Pagamento na entrega"));
    assert.ok(conteudo.includes("Dinheiro na entrega"));
    assert.ok(conteudo.includes("Cartão na entrega"));
    assert.equal((html.match(/name="formaPagamento"/g) ?? []).length, 2);
  });

  it("nunca pede credencial financeira: sem número, validade, CVV, senha ou token do cartão", () => {
    const html = renderizar().toLowerCase();
    for (const proibido of [
      "cvv",
      "validade",
      "número do cartão",
      "numero do cartao",
      "titular",
      "senha",
      "bandeira",
      "parcel",
      'type="password"',
    ] as const) {
      assert.ok(!html.includes(proibido), proibido);
    }
  });

  it("pergunta o troco somente no dinheiro e só depois de o cliente dizer que precisa", () => {
    const html = renderizar();
    // Dinheiro é o padrão: as opções de troco aparecem, mas o campo "Troco para quanto?" ainda não.
    assert.ok(html.includes("data-opcoes-troco"));
    assert.ok(texto(html).includes("Não preciso de troco"));
    assert.ok(texto(html).includes("Preciso de troco"));
    assert.ok(!html.includes('name="trocoPara"'));
    assert.ok(!texto(html).includes("Troco para quanto?"));
  });

  it("desabilita Confirmar pedido sem endereço, sem ponto confirmado ou sem cobertura", () => {
    const botaoConfirmar = (html: string) =>
      html.match(/<button[^>]*>Confirmar pedido[\s\S]*?<\/button>/)?.[0] ?? "";
    const estaDesabilitado = (html: string) =>
      botaoConfirmar(html).includes(' disabled=""');

    assert.ok(estaDesabilitado(renderizar(carrinho, null)));
    assert.ok(
      estaDesabilitado(
        renderizar(carrinho, {
          ...endereco,
          latitude: null,
          longitude: null,
          localizacaoConfirmadaEm: null,
        }),
      ),
    );
    assert.ok(estaDesabilitado(renderizar(carrinho, endereco, false)));
    assert.equal(estaDesabilitado(renderizar()), false);
  });

  it("tem DUAS áreas — Itens e Entrega e pagamento — e abre em Itens", () => {
    const html = renderizar();
    const abas = html.match(/data-aba-pedido="[^"]+"/g) ?? [];
    assert.deepEqual(abas, ['data-aba-pedido="itens"', 'data-aba-pedido="entrega-pagamento"'], "duas áreas, nessa ordem");
    assert.ok(texto(html).includes("Entrega e pagamento"));

    // Abre em "Itens": é a aba marcada, e o fecho dela leva para a entrega.
    const aberta = html.match(/data-aba-pedido="([^"]+)"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-aba-pedido="([^"]+)"/);
    assert.ok(html.includes("data-ir-para-entrega"), "de Itens se avança para entrega e pagamento");
    /*
     * Rodapé curto na aba de itens ("Continuar") e explícito na de pagamento ("Confirmar pedido"):
     * o texto longo anterior quebrava em duas linhas na largura do celular.
     */
    const rodapeItens = html.match(/<button[^>]*data-ir-para-entrega[\s\S]*?<\/button>/)?.[0] ?? "";
    assert.equal(texto(rodapeItens).trim(), "Continuar");
    assert.ok(texto(html).includes("Confirmar pedido"));
    assert.ok(aberta !== null || html.includes('aria-selected="true"'), "a aba aberta é marcada");
  });

  it("trocar de aba não desmonta nada: itens, endereço e pagamento seguem no mesmo estado", () => {
    const html = renderizar();
    // Tudo continua no documento (só uma das áreas fica escondida), então nada é remontado nem perdido.
    assert.ok(html.includes("data-item-carrinho"), "itens seguem montados");
    assert.ok(html.includes("data-endereco-selecionado"), "endereço segue montado");
    assert.ok(html.includes('name="formaPagamento"'), "pagamento segue montado");
    assert.ok(html.includes("data-total-carrinho"), "total segue montado");
  });

  it("endereço longo quebra linha e nunca alarga a coluna nem esconde texto", () => {
    const longo: EnderecoCliente = {
      ...endereco,
      apelido: "Casa da vovó no interior",
      logradouro: "Avenida Presidente Juscelino Kubitschek de Oliveira Superquadra Norte",
      complemento: "Bloco C, apartamento 1204, fundos",
      bairro: "Jardim das Acácias Residencial Segunda Etapa",
      cidade: "São José do Rio Preto do Oeste",
    };
    const html = renderToStaticMarkup(
      createElement(PainelCarrinho, {
        carrinho,
        endereco: longo,
        coberturaAprovada: true,
        enviando: false,
        erro: null,
        aoAlterarQuantidade: () => {},
        aoRemover: () => {},
        aoTrocarEndereco: () => {},
        aoConfirmar: () => {},
        aoFechar: () => {},
      }),
    );

    const bloco = html.slice(html.indexOf("data-endereco-selecionado"), html.indexOf("</section>", html.indexOf("data-endereco-selecionado")));
    // O texto quebra em qualquer ponto (nome de rua longo sem espaço não empurra a coluna)…
    assert.ok(bloco.includes("[overflow-wrap:anywhere]"), "endereço quebra linha");
    // …o contêiner do texto pode encolher (sem min-w-0 o flex não deixaria)…
    assert.ok(bloco.includes("min-w-0"), "contêiner do texto pode encolher");
    // …e nada é cortado com truncate: o endereço da entrega precisa ser lido inteiro.
    assert.ok(!bloco.includes("truncate"), "endereço não é escondido");
    // O conteúdo completo está presente.
    const conteudo = texto(bloco);
    assert.ok(conteudo.includes("Jardim das Acácias Residencial Segunda Etapa"));
    assert.ok(conteudo.includes("São José do Rio Preto do Oeste"));
    // O botão de trocar continua utilizável ao lado.
    assert.ok(bloco.includes("data-escolher-endereco"));
  });
});