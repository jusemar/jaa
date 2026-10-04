import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { CABECALHO_IDENTIDADE_ATUANTE, ORDEM_CAMPOS_ENVIO_IMAGEM, mensagemSchema } from "@jaa/contratos";
import { enviarMensagemImagem } from "../features/conversas/lib/api-conversas.ts";
import { enviarArquivo, enviarMultipart } from "./api.ts";
import { definirIdentidadeAtuante } from "./identidade-atuante.ts";

/*
 * ENVIO MULTIPART do Web, com `fetch` falso (sem rede): ordem das partes, arquivo por último, nenhum
 * Content-Type manual, sessão por cookie e identidade atuante.
 */

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  definirIdentidadeAtuante(null);
});

type Chamada = { url: string; init: RequestInit };

function falsificarFetch(respostas: { status: number; corpo: unknown }[] | "sem-rede"): Chamada[] {
  const chamadas: Chamada[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    chamadas.push({ url, init });
    if (respostas === "sem-rede") throw new TypeError("Failed to fetch");
    const resposta = respostas[Math.min(chamadas.length - 1, respostas.length - 1)]!;
    return new Response(JSON.stringify(resposta.corpo), { status: resposta.status });
  }) as typeof fetch;
  return chamadas;
}

const partes = (chamada: Chamada) => [...(chamada.init.body as FormData).entries()].map(([nome, valor]) => [nome, typeof valor === "string" ? valor : `<arquivo:${valor.name}>`]);

const CONVERSA = "aaaaaaaa-0000-4000-8000-000000000000";
const ID_CLIENTE = "11111111-1111-4111-8111-111111111111";
const RESPONDIDA = "01a0a394-0001-7000-8000-000000000000";
const foto = () => new File([new Uint8Array([1, 2, 3])], "ferias.jpg", { type: "image/jpeg" });
const mensagemImagem = {
  id: "01a0a394-0009-7000-8000-000000000000",
  conversaId: CONVERSA,
  remetenteIdentidadeId: "eeeeeeee-0000-4000-8000-000000000000",
  tipo: "imagem",
  conteudo: "Pizza",
  criadoEm: "2026-10-03T12:00:00.000Z",
  estado: "enviada",
  mensagemRespondida: null,
  editadaEm: null,
  excluidaEm: null,
  pedido: null,
  anexo: { id: "01a0a394-0010-7000-8000-000000000000", tipo: "imagem", largura: 1600, altura: 1067 },
};

describe("enviarMultipart", () => {
  it("campos na ordem dada, arquivo POR ÚLTIMO, sem Content-Type manual e com o cookie da sessão", async () => {
    const chamadas = falsificarFetch([{ status: 201, corpo: { ok: true } }]);
    await enviarMultipart("/x", { parse: (valor) => valor }, { campos: [["b", "2"], ["a", "1"]], arquivo: foto(), headers: { "x-teste": "1" } });
    const [chamada] = chamadas;
    assert.ok(chamada);
    assert.deepEqual(partes(chamada), [["b", "2"], ["a", "1"], ["arquivo", "<arquivo:ferias.jpg>"]]);
    assert.equal(chamada.init.method, "POST");
    assert.equal(chamada.init.credentials, "include");
    assert.ok(chamada.init.body instanceof FormData);
    const cabecalhos = Object.keys(chamada.init.headers as Record<string, string>).map((nome) => nome.toLowerCase());
    assert.ok(!cabecalhos.includes("content-type"), "o navegador escreve o boundary");
  });

  it("erro da API chega com código e mensagem; sem rede vira status 0", async () => {
    falsificarFetch([{ status: 429, corpo: { codigo: "LIMITE_DE_ENVIOS_ATINGIDO", mensagem: "Muitos envios." } }]);
    assert.deepEqual(await enviarMultipart("/x", { parse: (valor) => valor }, { arquivo: foto() }), { ok: false, status: 429, codigo: "LIMITE_DE_ENVIOS_ATINGIDO", mensagem: "Muitos envios." });
    falsificarFetch("sem-rede");
    assert.deepEqual(await enviarMultipart("/x", { parse: (valor) => valor }, { arquivo: foto() }), { ok: false, status: 0, codigo: null, mensagem: "Sem conexão com o servidor." });
  });

  it("avatar e produto continuam enviando só o campo `arquivo`", async () => {
    const chamadas = falsificarFetch([{ status: 200, corpo: { chave: "avatar/a/b.webp", url: "https://pub-exemplo.r2.dev/avatar/a/b.webp" } }]);
    const resposta = await enviarArquivo("/perfil/foto", foto());
    assert.equal(resposta.ok, true);
    assert.deepEqual(partes(chamadas[0]!), [["arquivo", "<arquivo:ferias.jpg>"]]);
  });
});

describe("enviarMensagemImagem", () => {
  it("multipart na ordem do contrato: idCliente, legenda, mensagemRespondidaId e o arquivo por último", async () => {
    const chamadas = falsificarFetch([{ status: 201, corpo: mensagemImagem }]);
    definirIdentidadeAtuante("bbbbbbbb-0000-4000-8000-000000000000");
    const resposta = await enviarMensagemImagem(CONVERSA, { idCliente: ID_CLIENTE, legenda: "Pizza", mensagemRespondidaId: RESPONDIDA, arquivo: foto() });
    assert.deepEqual(resposta.ok && resposta.dados.anexo, mensagemImagem.anexo);
    const [chamada] = chamadas;
    assert.ok(chamada);
    assert.ok(chamada.url.endsWith(`/conversas/${CONVERSA}/mensagens/imagem`));
    assert.deepEqual(partes(chamada), [["idCliente", ID_CLIENTE], ["legenda", "Pizza"], ["mensagemRespondidaId", RESPONDIDA], ["arquivo", "<arquivo:ferias.jpg>"]]);
    assert.deepEqual(partes(chamada).map(([nome]) => nome), [...ORDEM_CAMPOS_ENVIO_IMAGEM]);
    assert.equal((chamada.init.headers as Record<string, string>)[CABECALHO_IDENTIDADE_ATUANTE], "bbbbbbbb-0000-4000-8000-000000000000");
  });

  it("sem legenda e sem resposta: só idCliente e o arquivo", async () => {
    const chamadas = falsificarFetch([{ status: 201, corpo: { ...mensagemImagem, conteudo: "" } }]);
    await enviarMensagemImagem(CONVERSA, { idCliente: ID_CLIENTE, legenda: "", arquivo: foto() });
    assert.deepEqual(partes(chamadas[0]!).map(([nome]) => nome), ["idCliente", "arquivo"]);
  });

  it("retry: a MESMA tentativa reenvia o mesmo idCliente, legenda e arquivo; 201 e 200 reconciliam igual", async () => {
    const chamadas = falsificarFetch([{ status: 500, corpo: null }, { status: 200, corpo: mensagemImagem }]);
    const tentativa = { idCliente: ID_CLIENTE, legenda: "Pizza", arquivo: foto() };
    const primeira = await enviarMensagemImagem(CONVERSA, tentativa);
    assert.deepEqual([primeira.ok, primeira.status], [false, 500]);
    const retry = await enviarMensagemImagem(CONVERSA, tentativa);
    assert.deepEqual(partes(chamadas[0]!), partes(chamadas[1]!));
    assert.equal(retry.ok, true);
    // 200 (idempotente) devolve a mesma mensagem oficial que o 201 devolveria.
    assert.deepEqual(retry.ok && retry.dados, mensagemSchema.parse(mensagemImagem));
  });
});
