import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ItemListaConversas, Mensagem } from "@jaa/contratos";
import {
  aplicarAtualizacaoNaLista,
  aplicarExclusaoParaMimNaLista,
  aplicarMensagemNaLista,
  aplicarNaoLidasNaLista,
  mesclarConversas,
  rotuloNaoLidas,
} from "./lista-conversas.ts";

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
    estado: "enviada",
    mensagemRespondida: null,
    editadaEm: null,
    excluidaEm: null,
  };
}

function item(conversa: string, n: number): ItemListaConversas {
  return {
    id: idConversa(conversa),
    tipo: "direta",
    outraIdentidade: { identidadeId: idConversa("e"), tipo: "pessoal", nomeExibicao: conversa, nomeUsuario: conversa },
    ultimaMensagem: mensagem(conversa, n),
    naoLidas: 0,
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

describe("aplicarAtualizacaoNaLista e página com a mesma última mensagem", () => {
  it("edição da última mensagem troca só a prévia, sem reordenar; edição de outra mensagem não muda nada", () => {
    const inicial = [item("a", 3), item("b", 2)];
    const editada = { ...mensagem("b", 2, "b editada"), editadaEm: "2026-09-15T12:10:00.000Z" };
    const lista = aplicarAtualizacaoNaLista(inicial, editada);
    assert.equal(ids(lista), "ab");
    assert.equal(lista[1]?.ultimaMensagem.conteudo, "b editada");
    assert.deepEqual(aplicarAtualizacaoNaLista(inicial, { ...mensagem("b", 1, "antiga"), editadaEm: "2026-09-15T12:10:00.000Z" }), inicial);
  });

  it("recarga com a mesma última mensagem não desfaz edição já aplicada", () => {
    const editada = { ...mensagem("a", 3, "editada"), editadaEm: "2026-09-15T12:10:00.000Z" };
    const lista = mesclarConversas(aplicarAtualizacaoNaLista([item("a", 3)], editada), [item("a", 3)]);
    assert.equal(lista[0]?.ultimaMensagem.conteudo, "editada");
  });
});

describe("aplicarExclusaoParaMimNaLista", () => {
  it("se a excluída era a última, usa a nova última visível e reposiciona; senão não muda nada", () => {
    const inicial = [item("a", 9), item("b", 5)];
    const lista = aplicarExclusaoParaMimNaLista(inicial, { conversaId: idConversa("a"), mensagemId: idMensagem(9), ultimaMensagem: mensagem("a", 2) });
    assert.equal(ids(lista), "ba");
    assert.equal(lista[1]?.ultimaMensagem.id, idMensagem(2));
    assert.equal(aplicarExclusaoParaMimNaLista(inicial, { conversaId: idConversa("a"), mensagemId: idMensagem(1), ultimaMensagem: mensagem("a", 0) }), inicial);
  });

  it("sem mensagem visível restante, a conversa sai da lista", () => {
    const lista = aplicarExclusaoParaMimNaLista([item("a", 9), item("b", 5)], { conversaId: idConversa("b"), mensagemId: idMensagem(5), ultimaMensagem: null });
    assert.equal(ids(lista), "a");
  });
});

describe("não lidas na lista", () => {
  it("contagem do servidor substitui (não soma), não reordena e ignora conversa não carregada", () => {
    const inicial = [item("a", 3), item("b", 2)];
    const lista = aplicarNaoLidasNaLista(inicial, { conversaId: idConversa("b"), naoLidas: 4 });
    assert.equal(ids(lista), "ab");
    assert.equal(lista[1]?.naoLidas, 4);
    assert.equal(aplicarNaoLidasNaLista(lista, { conversaId: idConversa("b"), naoLidas: 0 })[1]?.naoLidas, 0);
    assert.deepEqual(aplicarNaoLidasNaLista(inicial, { conversaId: idConversa("z"), naoLidas: 9 }), inicial);
  });

  it("recarga da página traz a contagem atual; nova mensagem não inventa contagem no cliente", () => {
    const comContagem = mesclarConversas([item("a", 3)], [{ ...item("a", 3), naoLidas: 2 }]);
    assert.equal(comContagem[0]?.naoLidas, 2);
    assert.equal(aplicarMensagemNaLista(comContagem, mensagem("a", 4)).lista[0]?.naoLidas, 2);
  });

  it("rótulo 99+ a partir de 100", () => {
    assert.deepEqual([1, 99, 100].map(rotuloNaoLidas), ["1", "99", "99+"]);
  });
});
