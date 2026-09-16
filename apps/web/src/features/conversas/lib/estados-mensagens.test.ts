import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EstadoMensagem, Mensagem } from "@jaa/contratos";
import {
  conversaVazia,
  ocultarMensagem,
  receberAtualizacao,
  receberEntrega,
  receberLeitura,
  receberMensagens,
  ultimaMensagemRecebida,
  type ConversaReconciliada,
} from "./estados-mensagens.ts";

// UUIDv7 sintéticos: ordem lexicográfica = ordem cronológica.
const idMensagem = (n: number) => `01a0a394-${String(n).padStart(4, "0")}-7000-8000-000000000000`;
const CONVERSA = "aaaaaaaa-0000-4000-8000-000000000000";
const EU = "eeeeeeee-0000-4000-8000-000000000000";
const OUTRO = "ffffffff-0000-4000-8000-000000000000";

function mensagem(n: number, estado: EstadoMensagem = "enviada", remetente = EU): Mensagem {
  return {
    id: idMensagem(n),
    conversaId: CONVERSA,
    remetenteIdentidadeId: remetente,
    tipo: "texto",
    conteudo: `m${n}`,
    criadoEm: "2026-09-15T12:00:00.000Z",
    estado,
    mensagemRespondida: null,
    editadaEm: null,
    excluidaEm: null,
    pedido: null,
  };
}

const estados = (conversa: ConversaReconciliada) => conversa.mensagens.map((m) => `${m.conteudo}:${m.estado}`).join(" ");
const entregue = (...ns: number[]) => ({ conversaId: CONVERSA, destinatarioIdentidadeId: OUTRO, mensagemIds: ns.map(idMensagem) });
const lida = (n: number, leitor = OUTRO) => ({ conversaId: CONVERSA, leitorIdentidadeId: leitor, ateMensagemId: idMensagem(n) });

describe("receberMensagens", () => {
  it("não duplica, ordena por id e não regride o estado com dado HTTP atrasado", () => {
    let conversa = receberMensagens(conversaVazia, [mensagem(2, "lida"), mensagem(1)]);
    conversa = receberMensagens(conversa, [mensagem(2, "enviada"), mensagem(3)]);
    assert.equal(estados(conversa), "m1:enviada m2:lida m3:enviada");
  });

  it("avança quando o histórico recarregado traz estado mais novo", () => {
    const conversa = receberMensagens(receberMensagens(conversaVazia, [mensagem(1)]), [mensagem(1, "entregue")]);
    assert.equal(estados(conversa), "m1:entregue");
  });
});

describe("receberEntrega e receberLeitura", () => {
  it("entrega marca só as mensagens indicadas; leitura marca todas até o marcador", () => {
    let conversa = receberMensagens(conversaVazia, [mensagem(1), mensagem(2), mensagem(3)]);
    conversa = receberEntrega(conversa, entregue(3));
    assert.equal(estados(conversa), "m1:enviada m2:enviada m3:entregue");
    conversa = receberLeitura(conversa, lida(2));
    assert.equal(estados(conversa), "m1:lida m2:lida m3:entregue");
  });

  it("fora de ordem: entrega depois da leitura e leitura antiga depois da nova não regridem", () => {
    let conversa = receberMensagens(conversaVazia, [mensagem(1), mensagem(2)]);
    conversa = receberLeitura(conversa, lida(2));
    conversa = receberEntrega(conversa, entregue(1, 2));
    conversa = receberLeitura(conversa, lida(1));
    assert.equal(estados(conversa), "m1:lida m2:lida");
  });

  it("evento repetido é idempotente", () => {
    const inicial = receberLeitura(receberMensagens(conversaVazia, [mensagem(1)]), lida(1));
    assert.equal(receberLeitura(inicial, lida(1)), inicial);
    assert.deepEqual(receberEntrega(receberEntrega(inicial, entregue(1)), entregue(1)).mensagens, inicial.mensagens);
  });

  it("fato que chega antes da mensagem (ex.: antes da resposta do envio) é aplicado quando ela aparece", () => {
    let conversa = receberEntrega(conversaVazia, entregue(5));
    conversa = receberLeitura(conversa, lida(4));
    conversa = receberMensagens(conversa, [mensagem(4), mensagem(5)]);
    assert.equal(estados(conversa), "m4:lida m5:entregue");
  });

  it("minha própria leitura não marca como lidas as mensagens que eu enviei", () => {
    const conversa = receberLeitura(receberMensagens(conversaVazia, [mensagem(1), mensagem(2, "enviada", OUTRO)]), lida(2, EU));
    assert.equal(estados(conversa), "m1:enviada m2:lida");
  });
});

describe("ultimaMensagemRecebida", () => {
  it("ignora mensagens próprias", () => {
    const lista = [mensagem(1, "enviada", OUTRO), mensagem(2, "enviada", OUTRO), mensagem(3)];
    assert.equal(ultimaMensagemRecebida(lista, EU)?.id, idMensagem(2));
    assert.equal(ultimaMensagemRecebida([mensagem(3)], EU), undefined);
  });
});

describe("edição (receberAtualizacao)", () => {
  const editada = (n: number, conteudo: string, editadaEm: string, estado: EstadoMensagem = "enviada"): Mensagem => ({ ...mensagem(n, estado), conteudo, editadaEm });

  it("substitui pelo id sem reordenar nem inserir mensagem desconhecida; estado não regride", () => {
    let conversa = receberMensagens(conversaVazia, [mensagem(1, "lida"), mensagem(2)]);
    conversa = receberAtualizacao(conversa, editada(1, "novo texto", "2026-09-15T12:05:00.000Z", "enviada"));
    assert.equal(estados(conversa), "novo texto:lida m2:enviada");
    assert.equal(conversa.mensagens[0]?.editadaEm, "2026-09-15T12:05:00.000Z");
    assert.equal(receberAtualizacao(conversa, editada(9, "fora", "2026-09-15T12:06:00.000Z")).mensagens.length, 2);
  });

  it("histórico atrasado (versão antiga) não desfaz a edição; edição mais nova vence", () => {
    let conversa = receberAtualizacao(receberMensagens(conversaVazia, [mensagem(1)]), editada(1, "v2", "2026-09-15T12:05:00.000Z"));
    conversa = receberMensagens(conversa, [mensagem(1)]);
    assert.equal(conversa.mensagens[0]?.conteudo, "v2");
    conversa = receberAtualizacao(conversa, editada(1, "v1-atrasada", "2026-09-15T12:01:00.000Z"));
    assert.equal(conversa.mensagens[0]?.conteudo, "v2");
    conversa = receberMensagens(conversa, [editada(1, "v3", "2026-09-15T12:09:00.000Z")]);
    assert.equal(conversa.mensagens[0]?.conteudo, "v3");
  });

  it("respostas carregadas que citam a mensagem editada passam a mostrar o conteúdo atual", () => {
    const resposta: Mensagem = {
      ...mensagem(2, "enviada", OUTRO),
      mensagemRespondida: { id: idMensagem(1), remetente: { identidadeId: EU, nomeExibicao: "Eu" }, tipo: "texto", previaConteudo: "m1", conteudoTruncado: false, excluida: false },
    };
    const conversa = receberAtualizacao(receberMensagens(conversaVazia, [mensagem(1), resposta]), editada(1, "corrigido", "2026-09-15T12:05:00.000Z"));
    assert.equal(conversa.mensagens[1]?.mensagemRespondida?.previaConteudo, "corrigido");
  });
});

describe("exclusão (tombstone e para mim)", () => {
  it("tombstone vence qualquer versão; respostas carregadas passam a citar 'excluída' sem conteúdo", () => {
    const resposta: Mensagem = {
      ...mensagem(2, "enviada", OUTRO),
      mensagemRespondida: { id: idMensagem(1), remetente: { identidadeId: EU, nomeExibicao: "Eu" }, tipo: "texto", previaConteudo: "m1", conteudoTruncado: false, excluida: false },
    };
    const tombstone: Mensagem = { ...mensagem(1, "entregue"), conteudo: "", excluidaEm: "2026-09-15T12:20:00.000Z" };
    let conversa = receberAtualizacao(receberMensagens(conversaVazia, [mensagem(1), resposta]), tombstone);
    conversa = receberMensagens(conversa, [{ ...mensagem(1), editadaEm: "2026-09-15T12:30:00.000Z", conteudo: "página atrasada" }]);
    assert.equal(conversa.mensagens[0]?.conteudo, "");
    assert.ok(conversa.mensagens[0]?.excluidaEm);
    assert.deepEqual(conversa.mensagens[1]?.mensagemRespondida, { ...resposta.mensagemRespondida, previaConteudo: "", excluida: true });
  });

  it("excluída para mim some e não volta com página HTTP atrasada", () => {
    let conversa = ocultarMensagem(receberMensagens(conversaVazia, [mensagem(1), mensagem(2)]), idMensagem(1));
    conversa = receberMensagens(conversa, [mensagem(1), mensagem(2), mensagem(3)]);
    assert.equal(estados(conversa), "m2:enviada m3:enviada");
  });
});
