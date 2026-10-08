import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AcompanhamentoPedido } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AvisoDaEntrega, EntregadorDaEntrega, ResumoAcompanhamento } from "./acompanhamento-cliente.tsx";
import { linhaDoTrecho, pontosParaEnquadrar } from "./mapa-entrega-cliente.tsx";

const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/ /g, " ").replace(/\s+/g, " ");
const uuid = (n: number) => `${String(n).repeat(8)}-0000-4000-8000-000000000000`;
const agora = new Date("2026-09-16T12:00:30.000Z");

const acompanhamento = (dados: Partial<AcompanhamentoPedido> = {}): AcompanhamentoPedido => ({
  fila: { pedidoId: uuid(1), situacao: "indo_ate_voce", entregasAntes: 0 },
  entregador: null,
  posicaoEntregador: { latitude: -19.92, longitude: -43.94, capturadaEm: "2026-09-16T12:00:00.000Z" },
  rota: null,
  ...dados,
});

const render = (dados: Partial<AcompanhamentoPedido> = {}) =>
  renderToStaticMarkup(createElement(ResumoAcompanhamento, { acompanhamento: acompanhamento(dados), agora }));

describe("acompanhamento do cliente", () => {
  it("na fila, mostra só a POSIÇÃO dele (derivada) — nunca onde estão as outras entregas", () => {
    const html = render({ fila: { pedidoId: uuid(1), situacao: "na_fila", entregasAntes: 3 }, posicaoEntregador: null });
    const conteudo = texto(html);
    assert.ok(conteudo.includes("Você é o 4º na fila de entregas."));
    assert.equal(html.includes("data-posicao-entregador"), false, "sem mapa e sem posição antes da vez dele");
    for (const proibido of ["Rua", "latitude", "-19.9", "Cliente"]) assert.equal(conteudo.includes(proibido), false, proibido);
  });

  it("quando é a vez dele: 'Sua entrega é a próxima', a orientação da calçada e a idade da posição", () => {
    const conteudo = texto(render());
    assert.ok(conteudo.includes("🔔 Sua entrega é a próxima"));
    assert.ok(conteudo.includes("Por favor, aguarde na calçada."));
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

  it("o contrato que chega ao cliente tem só fila, um ponto e a identidade PÚBLICA do entregador", () => {
    assert.deepEqual(Object.keys(acompanhamento()).sort(), ["entregador", "fila", "posicaoEntregador", "rota"]);
    const entregador = { identidadeId: uuid(7), tipo: "pessoal" as const, nomeExibicao: "João", nomeUsuario: "joao", fotoUrl: null };
    assert.deepEqual(Object.keys(acompanhamento({ entregador }).entregador ?? {}).sort(), ["fotoUrl", "identidadeId", "nomeExibicao", "nomeUsuario", "tipo"]);
    assert.deepEqual(Object.keys(acompanhamento().posicaoEntregador ?? {}).sort(), ["capturadaEm", "latitude", "longitude"]);
  });
});

describe("entregador da entrega (cliente)", () => {
  const joao = { identidadeId: uuid(7), tipo: "pessoal" as const, nomeExibicao: "João Entregador", nomeUsuario: "joao_moto", fotoUrl: null };

  it("mostra a identidade pública de quem está com a entrega e o atalho para a conversa de sempre", () => {
    const html = renderToStaticMarkup(createElement(EntregadorDaEntrega, { acompanhamento: acompanhamento({ entregador: joao }), aoConversarCom: () => {} }));
    assert.ok(texto(html).includes("João Entregador"));
    assert.ok(texto(html).includes("@joao_moto"));
    assert.ok(html.includes('data-conversar-entregador="joao_moto"'));
  });

  it("sem entregador (ou entrega encerrada) não mostra nada", () => {
    assert.equal(renderToStaticMarkup(createElement(EntregadorDaEntrega, { acompanhamento: acompanhamento({ entregador: null }) })), "");
    const encerrada = acompanhamento({ entregador: joao, fila: { pedidoId: uuid(1), situacao: "encerrado", entregasAntes: null } });
    assert.equal(renderToStaticMarkup(createElement(EntregadorDaEntrega, { acompanhamento: encerrada })), "");
  });
});

describe("entregador em destaque e mapa da entrega (pedido na conversa do cliente)", () => {
  const joao = { identidadeId: uuid(7), tipo: "pessoal" as const, nomeExibicao: "João Entregador", nomeUsuario: "joao_moto", fotoUrl: null as string | null };
  const emDestaque = (fotoUrl: string | null) =>
    renderToStaticMarkup(createElement(EntregadorDaEntrega, { acompanhamento: acompanhamento({ fila: { pedidoId: uuid(1), situacao: "na_fila", entregasAntes: 1 }, posicaoEntregador: null, entregador: { ...joao, fotoUrl } }), emDestaque: true }));

  it("FOTO do entregador quando o servidor a envia; sem foto, as iniciais do padrão do Jaaa", () => {
    const comFoto = emDestaque("https://arquivos.exemplo/foto-perfil/joao.webp");
    assert.ok(/<img[^>]*src="https:\/\/arquivos\.exemplo\/foto-perfil\/joao\.webp"/.test(comFoto));
    const semFoto = emDestaque(null);
    assert.equal(semFoto.includes("<img"), false);
    assert.ok(/data-avatar="pessoal"[^>]*>JE</.test(semFoto));
    for (const html of [comFoto, semFoto]) assert.ok(html.includes("João Entregador") && html.includes("@joao_moto"));
  });

  it("no lugar do mapa: frase curta enquanto não é a vez dele ou não há posição; nada sem entrega", async () => {
    const { TEXTO_MAPA_DA_ENTREGA, avisoNoLugarDoMapa } = await import("@jaa/contratos");
    const fila = (situacao: string) => ({ pedidoId: uuid(1), situacao, entregasAntes: 0 }) as Parameters<typeof avisoNoLugarDoMapa>[0]["fila"];
    const posicao = { latitude: -19.9, longitude: -43.9, capturadaEm: new Date().toISOString() };
    assert.equal(avisoNoLugarDoMapa({ fila: fila("sem_saida"), posicaoEntregador: null }), null);
    assert.equal(avisoNoLugarDoMapa({ fila: fila("encerrado"), posicaoEntregador: null }), null);
    assert.equal(avisoNoLugarDoMapa({ fila: fila("na_fila"), posicaoEntregador: null }), TEXTO_MAPA_DA_ENTREGA.aguardandoVez);
    assert.equal(avisoNoLugarDoMapa({ fila: fila("indo_ate_voce"), posicaoEntregador: null }), TEXTO_MAPA_DA_ENTREGA.semPosicao);
    assert.equal(avisoNoLugarDoMapa({ fila: fila("indo_ate_voce"), posicaoEntregador: posicao }), null, "com posição real há mapa");
  });
});

describe("mapa e aviso da entrega para o cliente (Mapbox, trecho real, previsão)", () => {
  const trecho = { geometria: [{ latitude: -19.92, longitude: -43.94 }, { latitude: -19.921, longitude: -43.939 }, { latitude: -19.923, longitude: -43.938 }], distanciaMetros: 4200, duracaoSegundos: 1080 };
  const aviso = (dados: Partial<AcompanhamentoPedido>) => renderToStaticMarkup(createElement(AvisoDaEntrega, { acompanhamento: acompanhamento(dados), agora }));

  it("o acompanhamento do cliente não usa mais Leaflet/OpenStreetMap: é Mapbox, com a geometria que veio do servidor", async () => {
    const { readFileSync } = await import("node:fs");
    const ler = (arquivo: string) => readFileSync(new URL(arquivo, import.meta.url), "utf8");
    const container = ler("./acompanhamento-cliente.tsx");
    for (const antigo of ["leaflet", "URL_TILES_MAPA", "ATRIBUICAO_TILES"]) assert.equal(container.includes(antigo), false, antigo);
    assert.ok(container.includes("<MapaDaEntregaDoCliente") && container.includes("geometria={acompanhamento.rota?.geometria ?? null}"));
    const mapa = ler("./mapa-entrega-cliente.tsx");
    assert.ok(mapa.includes('import("mapbox-gl")') && mapa.includes("TOKEN_PUBLICO_MAPBOX"));
    assert.equal(/directions|optimized-trips|fetch\(/i.test(mapa), false, "o navegador não calcula rota");
    // O mapa de CONFIRMAÇÃO DE ENDEREÇO continua com a implementação que já tinha.
    assert.ok(ler("../../enderecos/mapa/configuracao-mapa.ts").length > 0);
  });

  it("a linha é a geometria recebida, ponto a ponto — sem trecho não há linha (nada de reta inventada)", () => {
    assert.deepEqual(linhaDoTrecho(trecho.geometria).geometry.coordinates, [[-43.94, -19.92], [-43.939, -19.921], [-43.938, -19.923]]);
    assert.deepEqual(linhaDoTrecho(null).geometry.coordinates, []);
    const posicao = { latitude: -19.92, longitude: -43.94 };
    const destino = { latitude: -19.923, longitude: -43.938 };
    assert.equal(pontosParaEnquadrar(posicao, destino, null).length, 2, "só entregador e destino");
    assert.equal(pontosParaEnquadrar(posicao, destino, trecho.geometria).length, 5);
  });

  it("na vez do cliente: aviso SÓLIDO e legível, com 'Previsão' e 'Distância' só quando o servidor manda o trecho", () => {
    const com = aviso({ rota: trecho });
    assert.ok(/data-aviso-da-entrega[^>]*class="[^"]*bg-marca-suave /.test(com), "fundo sólido do tema");
    assert.equal(/bg-marca-suave\/\d+|opacity-/.test(com), false, "nada translúcido nem com cara de desabilitado");
    assert.ok(texto(com).includes("Sua entrega é a próxima") && texto(com).includes("O entregador está a caminho do seu endereço."));
    assert.ok(texto(com).includes("Previsão: 18 min") && texto(com).includes("Distância: 4,2 km"));
    assert.ok(texto(com).includes("Última atualização"));

    const sem = aviso({ rota: null });
    assert.equal(sem.includes("data-previsao-da-entrega"), false);
    assert.equal(/Previsão|Distância/.test(texto(sem)), false, "sem dado real, sem número");
  });

  it("sem posição: mensagem de espera; fora da vez dele: só a posição na fila, sem previsão nem mapa", () => {
    assert.ok(texto(aviso({ posicaoEntregador: null })).includes("Aguardando a localização do entregador"));
    const naFila = aviso({ fila: { pedidoId: uuid(1), situacao: "na_fila", entregasAntes: 2 }, posicaoEntregador: null, rota: trecho });
    assert.ok(texto(naFila).includes("Você é o 3º na fila de entregas."));
    assert.equal(/Previsão|Distância/.test(texto(naFila)), false);
  });
});
