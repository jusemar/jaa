import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EventoNotificacaoNovaMensagem } from "@jaa/contratos";
import { MAXIMO_AVISOS_VISIVEIS, deveExibirNotificacao, registrarAviso } from "./notificacoes.ts";

const EU = "eeeeeeee-0000-4000-8000-000000000000";
const OUTRA = "ffffffff-0000-4000-8000-000000000000";
const conversa = (letra: string) => `${letra.repeat(8)}-0000-4000-8000-000000000000`;

function notificacao(n: number, conversaLetra = "a", remetente = OUTRA): EventoNotificacaoNovaMensagem {
  return {
    conversaId: conversa(conversaLetra),
    mensagemId: `01a0a394-${String(n).padStart(4, "0")}-7000-8000-000000000000`,
    remetente: { identidadeId: remetente, tipo: "pessoal", nomeExibicao: "Mateus", nomeUsuario: "mateus" },
    previaConteudo: `m${n}`,
    conteudoTruncado: false,
    criadoEm: "2026-09-15T12:00:00.000Z",
  };
}

describe("deveExibirNotificacao", () => {
  const base = { identidadeId: EU, conversaEmLeituraId: null, jaExibidas: new Set<string>() };

  it("nova mensagem recebida em outra conversa (ou fora de qualquer conversa) é exibida", () => {
    assert.equal(deveExibirNotificacao({ ...base, notificacao: notificacao(1) }), true);
    assert.equal(deveExibirNotificacao({ ...base, conversaEmLeituraId: conversa("b"), notificacao: notificacao(1, "a") }), true);
  });

  it("não exibe a própria mensagem, a conversa aberta e visível, nem id repetido", () => {
    assert.equal(deveExibirNotificacao({ ...base, notificacao: notificacao(1, "a", EU) }), false);
    assert.equal(deveExibirNotificacao({ ...base, conversaEmLeituraId: conversa("a"), notificacao: notificacao(1, "a") }), false);
    const jaExibidas = new Set<string>();
    registrarAviso([], jaExibidas, notificacao(7));
    assert.equal(deveExibirNotificacao({ ...base, jaExibidas, notificacao: notificacao(7) }), false);
  });
});

describe("registrarAviso", () => {
  it("um aviso por conversa (o mais recente) e no máximo alguns visíveis", () => {
    const jaExibidas = new Set<string>();
    let avisos = registrarAviso([], jaExibidas, notificacao(1, "a"));
    avisos = registrarAviso(avisos, jaExibidas, notificacao(2, "a"));
    assert.deepEqual(avisos.map((a) => a.mensagemId), [notificacao(2).mensagemId]);
    for (const [i, letra] of ["b", "c", "d", "e"].entries()) avisos = registrarAviso(avisos, jaExibidas, notificacao(10 + i, letra));
    assert.equal(avisos.length, MAXIMO_AVISOS_VISIVEIS);
    assert.deepEqual(avisos.map((a) => a.conversaId), [conversa("c"), conversa("d"), conversa("e")]);
  });
});
