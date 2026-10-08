import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ARTE_DE_CARREGAMENTO, COR_DE_FUNDO_DO_CARREGAMENTO, ajusteDaArte } from "./tela-carregamento.ts";

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");

describe("tela de carregamento do Jaaa", () => {
  it("celulares (mais altos que a arte): a arte entra INTEIRA — o logo nunca é cortado nas laterais", () => {
    for (const [largura, altura] of [[320, 640], [360, 780], [393, 873], [412, 915], [384, 854], [360, 800], [430, 932]] as const) {
      assert.equal(ajusteDaArte(largura, altura), "conter", `${largura}x${altura}`);
    }
    // Exatamente a proporção da arte: cabe sem sobra, sem corte.
    assert.equal(ajusteDaArte(ARTE_DE_CARREGAMENTO.largura, ARTE_DE_CARREGAMENTO.altura), "conter");
  });

  it("telas mais largas (tablet em pé): cobre, cortando só em cima e embaixo, longe do logo", () => {
    assert.equal(ajusteDaArte(800, 1280), "cobrir");
    assert.equal(ajusteDaArte(768, 1024), "cobrir");
  });

  it("paisagem extrema cortaria o logo: volta a conter (nunca corta nem deforma)", () => {
    assert.equal(ajusteDaArte(1280, 720), "conter");
    assert.equal(ajusteDaArte(0, 0), "conter");
  });

  it("uma identidade só: a mesma arte no carregamento JS e a mesma cor de fundo no splash nativo", () => {
    const tela = ler("../components/ui/tela-carregamento.tsx");
    assert.ok(tela.includes('require("../../../assets/images/jaaa-tela-carregamento.png")'));
    assert.equal(/resizeMode|contentFit="fill"/.test(tela), false, "nada de esticar a arte");
    assert.ok(ler("../features/conta/components/portao-sessao.tsx").includes("<TelaDeCarregamento"));
    const configuracao = ler("../../app.config.ts");
    assert.ok(configuracao.includes(`backgroundColor: "${COR_DE_FUNDO_DO_CARREGAMENTO}"`), "splash nativo com a cor de base da arte");
    // A arte de carregamento não é o ícone do app.
    assert.equal(/icon: "[^"]*jaaa-tela-carregamento/.test(configuracao) || /foregroundImage: "[^"]*jaaa-tela-carregamento/.test(configuracao), false);
  });
});

describe("ícones de logística: base, entregador e cliente", () => {
  it("os três papéis existem no conjunto único de ícones e são os usados nos mapas", () => {
    const icones = ler("../components/ui/icone.tsx");
    for (const papel of ['base: { ios: "storefront.fill", android: "storefront"', 'entregador: { ios: "scooter", android: "two_wheeler"', 'cliente: { ios: "person.fill", android: "person_pin_circle"']) assert.ok(icones.includes(papel), papel);

    const rota = ler("../features/entregas/components/tela-mapa-da-rota.tsx");
    assert.ok(rota.includes('<Icone nome="base" tamanho={18}'), "base da rota");
    assert.ok(rota.includes('<Icone nome="cliente" tamanho={parada.proxima ? 18 : 16}'), "cada parada é um cliente, com o número da ordem");
    assert.ok(rota.includes("{parada.rotulo}"), "a ordem das paradas continua visível");
    assert.ok(rota.includes('<ItemDaLegenda icone="entregador" rotulo="Você" />'));

    const cliente = ler("../features/pedidos/components/acompanhamento-cliente.tsx");
    assert.ok(cliente.includes('<Icone nome="entregador" tamanho={18} cor="marcaConteudo" />'), "entregador no mapa do cliente");
    assert.ok(cliente.includes('<Icone nome="cliente" tamanho={18} cor="conteudo" />'), "destino do cliente");
  });

  it("marcadores pequenos: nenhum passa de 36 px de altura", () => {
    for (const arquivo of ["../features/entregas/components/tela-mapa-da-rota.tsx", "../features/pedidos/components/acompanhamento-cliente.tsx"]) {
      const alturas = [...ler(arquivo).matchAll(/marcador[A-Za-z]*: \{[^}]*height: (\d+)/g)].map((achado) => Number(achado[1]));
      assert.ok(alturas.length > 0 && alturas.every((altura) => altura <= 36), `${arquivo}: ${alturas.join(",")}`);
    }
  });
});
