import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ItemListaConversas, Mensagem } from "@jaa/contratos";
import { aplicarMensagemNaLista, mesclarConversas } from "./lista-conversas.ts";

// UUIDv7 sintéticos: ordem lexicográfica = ordem cronológica.
const idMensagem = (n: number) => `01a0a394-${String(n).padStart(4, "0")}-7000-8000-000000000000`;
const idConversa = (letra: string) => `${letra.repeat(8)}-0000-4000-8000-000000000000`;

function mensagem(conversa: string, n: number, conteudo = `m${n}`): Mensagem {
  return {
    id: idMensagem(n),
    conversaId: idConversa(conversa),
    remetenteIdentidadeId: idConversa("f"),
    tipo: "texto",
    conteudo,
    criadoEm: "2026-09-15T12:00:00.000Z",
  };
}

function item(conversa: string, n: number): ItemListaConversas {
  return {
    id: idConversa(conversa),
    tipo: "direta",
    outraIdentidade: { identidadeId: idConversa("e"), nomeExibicao: conversa, nomeUsuario: conversa },
    ultimaMensagem: mensagem(conversa, n),
  };
}

const ids = (lista: ItemListaConversas[]) => lista.map((i) => i.outraIdentidade.nomeUsuario).join("");

describe("mesclarConversas", () => {
  it("ordena pela última mensagem e não duplica conversas vindas de páginas sobrepostas", () => {
    const lista = mesclarConversas([item("a", 3), item("b", 2)], [item("b", 2), item("c", 1)]);
    assert.equal(ids(lista), "abc");
  });

  it("nunca regride para uma última mensagem mais antiga", () => {
    const lista = mesclarConversas([item("a", 9)], [item("a", 1)]);
    assert.equal(lista[0]?.ultimaMensagem.id, idMensagem(9));
  });
});

describe("aplicarMensagemNaLista", () => {
  it("leva a conversa ao topo e atualiza prévia e horário, sem duplicar", () => {
    const inicial = [item("a", 3), item("b", 2), item("c", 1)];
    const { lista, conhecida } = aplicarMensagemNaLista(inicial, { ...mensagem("c", 4, "nova"), criadoEm: "2026-09-15T13:00:00.000Z" });
    assert.equal(conhecida, true);
    assert.equal(ids(lista), "cab");
    assert.equal(lista[0]?.ultimaMensagem.conteudo, "nova");
    assert.equal(lista[0]?.ultimaMensagem.criadoEm, "2026-09-15T13:00:00.000Z");
    assert.equal(lista.length, 3);
  });

  it("mesmo evento aplicado duas vezes (realtime + resposta HTTP) mantém um único item", () => {
    const evento = mensagem("b", 5);
    const primeira = aplicarMensagemNaLista([item("a", 3), item("b", 2)], evento).lista;
    const segunda = aplicarMensagemNaLista(primeira, evento).lista;
    assert.deepEqual(segunda, primeira);
  });

  it("evento atrasado (mais antigo que a última conhecida) não altera a lista", () => {
    const inicial = [item("a", 7), item("b", 6)];
    assert.deepEqual(aplicarMensagemNaLista(inicial, mensagem("b", 1)).lista, inicial);
  });

  it("conversa desconhecida não é inventada: sinaliza para recarregar", () => {
    const inicial = [item("a", 3)];
    const resultado = aplicarMensagemNaLista(inicial, mensagem("z", 9));
    assert.equal(resultado.conhecida, false);
    assert.equal(resultado.lista, inicial);
  });
});
