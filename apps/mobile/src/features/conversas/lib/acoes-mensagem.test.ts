import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { ROTULO_ACAO_MENSAGEM, acoesDisponiveisDaMensagem, conteudoParaPrevia } from "./acoes-mensagem.ts";

const EU = "eeeeeeee-0000-4000-8000-000000000000";
const OUTRA = "ffffffff-0000-4000-8000-000000000000";
const pedido = { id: "p" } as never;
const m = (extra: Partial<Parameters<typeof acoesDisponiveisDaMensagem>[0]> = {}) => ({ remetenteIdentidadeId: EU, excluidaEm: null, tipo: "texto" as const, pedido: null, ...extra });
const fonte = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");

describe("ações da mensagem (mesmas regras do menu da Web)", () => {
  it("texto próprio: as quatro, na ordem da Web", () => {
    assert.deepEqual(acoesDisponiveisDaMensagem(m(), EU), ["responder", "editar", "apagar-para-mim", "apagar-para-todos"]);
  });

  it("recebida: responder e apagar para mim — nunca editar nem apagar para todos", () => {
    assert.deepEqual(acoesDisponiveisDaMensagem(m({ remetenteIdentidadeId: OUTRA }), EU), ["responder", "apagar-para-mim"]);
  });

  it("imagem própria: responde e apaga, mas não edita", () => {
    assert.deepEqual(acoesDisponiveisDaMensagem(m({ tipo: "imagem" }), EU), ["responder", "apagar-para-mim", "apagar-para-todos"]);
  });

  it("pedido: não responde nem edita", () => {
    assert.deepEqual(acoesDisponiveisDaMensagem(m({ tipo: "pedido", pedido }), EU), ["apagar-para-mim", "apagar-para-todos"]);
    assert.deepEqual(acoesDisponiveisDaMensagem(m({ tipo: "pedido", pedido, remetenteIdentidadeId: OUTRA }), EU), ["apagar-para-mim"]);
  });

  it("excluída (tombstone): só esconder para mim", () => {
    assert.deepEqual(acoesDisponiveisDaMensagem(m({ excluidaEm: "2026-10-03T12:00:00.000Z" }), EU), ["apagar-para-mim"]);
  });

  it("rótulos iguais aos da Web", () => {
    assert.deepEqual(Object.values(ROTULO_ACAO_MENSAGEM), ["Responder", "Editar", "Apagar para mim", "Apagar para todos"]);
    const web = fonte("../../../../../web/src/features/conversas/components/balao-mensagem.tsx");
    for (const rotulo of Object.values(ROTULO_ACAO_MENSAGEM)) assert.ok(web.includes(`rotulo: "${rotulo}"`), rotulo);
  });

  it("prévia: imagem sem legenda vira \"Foto\"; com legenda, a legenda", () => {
    assert.equal(conteudoParaPrevia({ tipo: "imagem", conteudo: "" }), "Foto");
    assert.equal(conteudoParaPrevia({ tipo: "imagem", conteudo: "Pizza" }), "Pizza");
    assert.equal(conteudoParaPrevia({ tipo: "texto", conteudo: "oi" }), "oi");
  });
});

describe("aparência igual à da Web", () => {
  const balao = fonte("../components/balao-mensagem.tsx");
  const tema = fonte("../../../constants/theme.ts");

  it("rodapé neutro; só LIDA fica azul", () => {
    assert.ok(tema.includes('leitura: "#22A3E3"'));
    assert.ok(balao.includes('cor={mensagem.estado === "lida" ? "leitura" : "conteudoSuave"}'));
    const rodape = balao.slice(balao.indexOf("estilos.rodape}"), balao.indexOf("</Pressable>"));
    assert.ok(!rodape.includes('"marca"'), "nada de verde no horário, em 'editada' ou no estado");
  });

  it("resposta citada: texto escuro, fundo sutil e barra lateral — no balão próprio e no recebido", () => {
    const referencia = fonte("../components/referencia-resposta.tsx");
    assert.ok(referencia.includes("borderLeftColor: Cores.marca") && referencia.includes('cor="marca"'));
    assert.ok(referencia.includes('emBalaoProprio ? "mensagemEnviadaConteudo" : "conteudoSuave"'));
    assert.ok(!/marcaConteudo|#FFF/i.test(referencia), "nada branco no bloco citado");
    assert.ok(balao.includes("emBalaoProprio={propria}"));
  });

  it("menu em folha por cima de tudo (Modal), com ícones; compositor sem destaque de foco", () => {
    const menu = fonte("../../../components/ui/menu-acoes.tsx");
    assert.ok(menu.includes("<Modal") && menu.includes("acao.icone"));
    const tela = fonte("../components/tela-conversa.tsx");
    assert.ok(tela.includes("acoesDisponiveisDaMensagem(") && !tela.includes("Excluir para"));
    assert.ok(tela.includes('underlineColorAndroid="transparent"') && !/onFocus|focado/.test(tela));
  });
});
