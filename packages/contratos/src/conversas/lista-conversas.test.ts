import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eventoConversaNaoLidasSchema } from "../realtime/eventos.ts";
import {
  LIMITE_CONTAGEM_NAO_LIDAS,
  LIMITE_PAGINA_CONVERSAS_MAXIMO,
  contagemNaoLidasSchema,
  LIMITE_PAGINA_CONVERSAS_PADRAO,
  itemListaConversasSchema,
  listarConversasConsultaSchema,
} from "./lista-conversas.ts";

const uuid = "01a0a394-6225-75f2-b809-b2690993c512";

describe("listarConversasConsultaSchema", () => {
  it("usa limite padrão e converte limite vindo da query string", () => {
    assert.deepEqual(listarConversasConsultaSchema.parse({}), { limite: LIMITE_PAGINA_CONVERSAS_PADRAO });
    assert.equal(listarConversasConsultaSchema.parse({ limite: String(LIMITE_PAGINA_CONVERSAS_MAXIMO) }).limite, 50);
    assert.equal(listarConversasConsultaSchema.parse({ antesDe: uuid }).antesDe, uuid);
  });

  it("recusa limite fora da faixa ou não inteiro e cursor inválido", () => {
    for (const consulta of [{ limite: "0" }, { limite: "51" }, { limite: "2.5" }, { limite: "abc" }, { antesDe: "abc" }, { antesDe: "" }]) {
      assert.equal(listarConversasConsultaSchema.safeParse(consulta).success, false, JSON.stringify(consulta));
    }
  });

  it("não aceita escolher de quem é a lista: campos extras são descartados", () => {
    const resultado = listarConversasConsultaSchema.parse({ identidadeId: uuid, usuarioId: "x" });
    assert.deepEqual(resultado, { limite: LIMITE_PAGINA_CONVERSAS_PADRAO });
  });
});

describe("itemListaConversasSchema", () => {
  const item = {
    id: uuid,
    tipo: "direta",
    outraIdentidade: { identidadeId: uuid, tipo: "pessoal", nomeExibicao: "Bia", nomeUsuario: "bia" },
    ultimaMensagem: {
      id: uuid,
      conversaId: uuid,
      remetenteIdentidadeId: uuid,
      tipo: "texto",
      conteudo: "oi",
      criadoEm: "2026-09-15T12:00:00.000Z",
      estado: "enviada",
      pedido: null,
      mensagemRespondida: null,
      editadaEm: null,
      excluidaEm: null,
    },
    naoLidas: 0,
  };

  it("aceita item válido e remove dados que não pertencem ao contrato", () => {
    const resultado = itemListaConversasSchema.parse({
      ...item,
      outraIdentidade: { ...item.outraIdentidade, telefone: "+5531987654321", usuarioId: "u1" },
    });
    assert.deepEqual(Object.keys(resultado.outraIdentidade).sort(), ["identidadeId", "nomeExibicao", "nomeUsuario", "tipo"]);
  });

  it("exige última mensagem", () => {
    assert.equal(itemListaConversasSchema.safeParse({ ...item, ultimaMensagem: null }).success, false);
  });
});

describe("naoLidas", () => {
  it("inteiro de 0 ao limite; negativo, fracionário ou acima do limite é inválido", () => {
    for (const valido of [0, 1, LIMITE_CONTAGEM_NAO_LIDAS]) assert.equal(contagemNaoLidasSchema.safeParse(valido).success, true);
    for (const invalido of [-1, 1.5, LIMITE_CONTAGEM_NAO_LIDAS + 1, "3", null]) assert.equal(contagemNaoLidasSchema.safeParse(invalido).success, false);
    assert.equal(eventoConversaNaoLidasSchema.safeParse({ conversaId: uuid, naoLidas: 3, identidadeId: uuid }).success, true);
    assert.deepEqual(Object.keys(eventoConversaNaoLidasSchema.parse({ conversaId: uuid, naoLidas: 3, identidadeId: uuid })).sort(), ["conversaId", "naoLidas"]);
  });
});
