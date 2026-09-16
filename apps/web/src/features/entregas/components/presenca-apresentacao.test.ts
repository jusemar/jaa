import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EntregadorOperacional, PainelOperacional, SituacaoOperacional } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QuadroDaFila } from "./fila-apresentacao.tsx";
import { AvisoLocalizacao, MinhaSituacaoNaBase } from "./presenca-na-base.tsx";

const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/ /g, " ").replace(/\s+/g, " ");
const uuid = (n: number) => `${String(n).repeat(8)}-0000-4000-8000-000000000000`;

const operacional = (n: number, dados: Partial<EntregadorOperacional> = {}): EntregadorOperacional => ({
  id: uuid(n),
  pessoa: { identidadeId: uuid(n + 1), tipo: "pessoal", nomeExibicao: `Entregador ${n}`, nomeUsuario: `entregador${n}` },
  status: "ativo",
  disponivel: true,
  naBase: true,
  aptoParaSaida: true,
  estado: "disponivel_na_base",
  posicaoFila: null,
  filaEntrouEm: "2026-09-16T12:00:00.000Z",
  ...dados,
});

const situacao = (dados: Partial<SituacaoOperacional> = {}): SituacaoOperacional => ({
  entregadorId: uuid(1),
  empresa: { identidadeId: uuid(2), nome: "Pizzaria BH" },
  status: "ativo",
  disponivel: true,
  naBase: true,
  aptoParaSaida: true,
  estado: "disponivel_na_base",
  posicaoFila: 1,
  totalNaFila: 3,
  baseConfigurada: true,
  ...dados,
});

describe("quadro da fila (visão da empresa)", () => {
  const render = (painel: PainelOperacional) => renderToStaticMarkup(createElement(QuadroDaFila, { painel }));

  const painelCompleto: PainelOperacional = {
    fila: [operacional(1, { posicaoFila: 1 }), operacional(2, { posicaoFila: 2 })],
    foraDaBase: [operacional(3, { naBase: false, estado: "disponivel_fora_base", filaEntrouEm: null })],
    indisponiveis: [operacional(4, { disponivel: false, naBase: false, estado: "indisponivel", filaEntrouEm: null })],
    baseConfigurada: true,
  };

  it("separa fila da base, disponíveis fora da base e indisponíveis", () => {
    const html = render(painelCompleto);
    const conteudo = texto(html);
    assert.ok(conteudo.includes("Na base — fila"));
    assert.ok(conteudo.includes("Fora da base"));
    assert.ok(conteudo.includes("Indisponíveis"));
    assert.ok(conteudo.includes("1. Entregador 1"));
    assert.ok(conteudo.includes("2. Entregador 2"));
    assert.ok(conteudo.includes("Disponível na base"));
    assert.ok(conteudo.includes("Disponível fora da base"));
    assert.ok(conteudo.includes("Não aceitando entregas"));
  });

  it("a ordem é do servidor: nada de arrastar, mover ou confirmar chegada", () => {
    const html = render(painelCompleto);
    for (const proibido of ["draggable", "data-subir", "data-descer", "Confirmar chegada", "Mover"]) {
      assert.equal(html.includes(proibido), false, proibido);
    }
  });

  it("a empresa vê estado, nunca localização", () => {
    const html = render(painelCompleto);
    for (const proibido of ["latitude", "longitude", "metros", "mapa", "precis"]) {
      assert.equal(html.toLowerCase().includes(proibido), false, proibido);
    }
  });

  it("sem ponto da base confirmado, avisa que a presença não é detectada", () => {
    const html = render({ fila: [], foraDaBase: [], indisponiveis: [], baseConfigurada: false });
    assert.ok(texto(html).includes("Confirme o ponto da base"));
    assert.ok(texto(html).includes("Ninguém na base agora."));
  });
});

describe("situação do entregador", () => {
  const render = (situacoes: SituacaoOperacional[], permissao: "ausente" | "ativa" | "negada" | "indisponivel" = "ativa") =>
    renderToStaticMarkup(createElement(MinhaSituacaoNaBase, { situacoes, permissao, aoPermitir: () => {} }));

  it("mostra aceitando, presença, estado e posição na fila", () => {
    const conteudo = texto(render([situacao()]));
    assert.ok(conteudo.includes("Pizzaria BH"));
    assert.ok(conteudo.includes("Disponível na base"));
    assert.ok(conteudo.includes("Na base"));
    assert.ok(conteudo.includes("Você é o 1º da fila da base"));
    assert.ok(conteudo.includes("3 na fila"));
  });

  it("disponível fora da base não tem posição na fila", () => {
    const html = render([situacao({ naBase: false, estado: "disponivel_fora_base", posicaoFila: null, totalNaFila: 2 })]);
    assert.ok(texto(html).includes("Fora da base"));
    assert.ok(texto(html).includes("Disponível para chamados, mas fora da fila da base"));
    assert.equal(html.includes("data-posicao-fila"), false);
  });

  it("empresa sem ponto da base confirmado é avisada ao entregador", () => {
    assert.ok(texto(render([situacao({ baseConfigurada: false })])).includes("ainda não confirmou o ponto da base"));
  });

  it("sem vínculo operacional a área não aparece", () => {
    assert.equal(render([]), "");
  });
});

describe("aviso de localização", () => {
  const render = (permissao: "ausente" | "ativa" | "negada" | "indisponivel") => renderToStaticMarkup(createElement(AvisoLocalizacao, { permissao }));

  it("explica para que a localização serve antes de pedi-la", () => {
    assert.ok(texto(render("ausente")).includes("Localização necessária para entrar automaticamente na fila da base."));
  });

  it("permissão negada explica o efeito, sem bloquear o resto", () => {
    assert.ok(texto(render("negada")).includes("Permissão de localização negada"));
    assert.ok(texto(render("indisponivel")).includes("não informa localização"));
  });

  it("com a localização ativa, não fica avisando nada", () => {
    assert.equal(render("ativa"), "");
  });
});
