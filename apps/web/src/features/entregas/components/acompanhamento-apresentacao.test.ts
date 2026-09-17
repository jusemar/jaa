import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AcompanhamentoPedido } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ResumoAcompanhamento } from "./acompanhamento-cliente.tsx";

const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/ /g, " ").replace(/\s+/g, " ");
const uuid = (n: number) => `${String(n).repeat(8)}-0000-4000-8000-000000000000`;
const agora = new Date("2026-09-16T12:00:30.000Z");

const acompanhamento = (dados: Partial<AcompanhamentoPedido> = {}): AcompanhamentoPedido => ({
  fila: { pedidoId: uuid(1), situacao: "indo_ate_voce", entregasAntes: 0 },
  posicaoEntregador: { latitude: -19.92, longitude: -43.94, capturadaEm: "2026-09-16T12:00:00.000Z" },
  ...dados,
});

const render = (dados: Partial<AcompanhamentoPedido> = {}) =>
  renderToStaticMarkup(createElement(ResumoAcompanhamento, { acompanhamento: acompanhamento(dados), agora }));

describe("acompanhamento do cliente", () => {
  it("na fila, mostra só quantas entregas faltam — nunca onde elas estão", () => {
    const html = render({ fila: { pedidoId: uuid(1), situacao: "na_fila", entregasAntes: 3 }, posicaoEntregador: null });
    const conteudo = texto(html);
    assert.ok(conteudo.includes("3 entregas antes da sua"));
    assert.equal(html.includes("data-posicao-entregador"), false, "sem mapa e sem posição antes da vez dele");
    for (const proibido of ["Rua", "latitude", "-19.9", "Cliente"]) assert.equal(conteudo.includes(proibido), false, proibido);
  });

  it("quando é a vez dele, mostra 'Indo até você' e a idade da última posição", () => {
    const conteudo = texto(render());
    assert.ok(conteudo.includes("Indo até você"));
    assert.ok(conteudo.includes("Última atualização há 30 s"));
  });

  it("sem posição recente, avisa em vez de mostrar coordenada velha como atual", () => {
    const html = render({ posicaoEntregador: null });
    assert.ok(html.includes('data-posicao-entregador="indisponivel"'));
    assert.ok(texto(html).includes("Localização temporariamente indisponível"));
  });

  it("pedido sem saída ou encerrado não mostra acompanhamento nenhum", () => {
    assert.equal(render({ fila: { pedidoId: uuid(1), situacao: "sem_saida", entregasAntes: null }, posicaoEntregador: null }), "");
    assert.equal(render({ fila: { pedidoId: uuid(1), situacao: "encerrado", entregasAntes: null }, posicaoEntregador: null }), "");
  });

  it("o contrato que chega ao cliente tem só fila e um ponto", () => {
    assert.deepEqual(Object.keys(acompanhamento()).sort(), ["fila", "posicaoEntregador"]);
    assert.deepEqual(Object.keys(acompanhamento().posicaoEntregador ?? {}).sort(), ["capturadaEm", "latitude", "longitude"]);
  });
});
