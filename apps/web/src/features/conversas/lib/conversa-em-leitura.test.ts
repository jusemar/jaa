import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deveTocarSomDeMensagem } from "@jaa/contratos";
import { conversaVisivelAgora, definirConversaAberta } from "./conversa-em-leitura.ts";
import { criarTocadorSomMensagem, type ContextoAudioMinimo } from "./som-mensagem.ts";

const pagina = (visibilityState: Document["visibilityState"], emFoco: boolean) => ({ visibilityState, hasFocus: () => emFoco });

describe("conversa efetivamente visível (Web)", () => {
  it("aberta + página visível e em foco = é a conversa que a pessoa está vendo", () => {
    definirConversaAberta("A");
    assert.equal(conversaVisivelAgora(pagina("visible", true)), "A");
  });

  it("conversa selecionada com a aba escondida ou a janela sem foco NÃO conta como vista", () => {
    definirConversaAberta("A");
    assert.equal(conversaVisivelAgora(pagina("hidden", true)), null);
    assert.equal(conversaVisivelAgora(pagina("visible", false)), null);
  });

  it("sem conversa aberta (outra área do Jaa) nada está à vista", () => {
    definirConversaAberta(null);
    assert.equal(conversaVisivelAgora(pagina("visible", true)), null);
  });
});

describe("som no Web: regra + tocador", () => {
  function tocadorComContador() {
    let bipes = 0;
    const contexto = {
      state: "running",
      currentTime: 0,
      destination: {},
      resume: async () => {},
      createOscillator: () => ({ type: "sine", frequency: { setValueAtTime() {} }, connect() {}, start: () => bipes++, stop() {} }),
      createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }),
    } as unknown as ContextoAudioMinimo;
    const tocador = criarTocadorSomMensagem(() => contexto);
    tocador.habilitar();
    return { tocador, bipes: () => bipes };
  }
  // O mesmo caminho do `useAvisosMensagens`.
  function receber(t: ReturnType<typeof tocadorComContador>["tocador"], evento: { mensagemId: string; conversaId: string; remetente: string }, visivel: string | null) {
    const tocar = deveTocarSomDeMensagem({ remetenteIdentidadeId: evento.remetente, conversaId: evento.conversaId, identidadeAtivaId: "eu", conversaVisivelId: visivel });
    if (tocar) t.tocar(evento.mensagemId);
    else t.silenciar(evento.mensagemId);
  }

  it("A visível: mensagem de A em silêncio, mensagem de B toca", () => {
    const { tocador, bipes } = tocadorComContador();
    receber(tocador, { mensagemId: "m1", conversaId: "A", remetente: "ana" }, "A");
    assert.equal(bipes(), 0);
    receber(tocador, { mensagemId: "m2", conversaId: "B", remetente: "bia" }, "A");
    assert.ok(bipes() > 0);
  });

  it("mensagem repetida não toca duas vezes; a silenciada não toca numa reentrega (reconexão)", () => {
    const { tocador, bipes } = tocadorComContador();
    receber(tocador, { mensagemId: "m1", conversaId: "B", remetente: "bia" }, null);
    const depoisDaPrimeira = bipes();
    receber(tocador, { mensagemId: "m1", conversaId: "B", remetente: "bia" }, null);
    assert.equal(bipes(), depoisDaPrimeira);

    receber(tocador, { mensagemId: "m9", conversaId: "A", remetente: "ana" }, "A");
    receber(tocador, { mensagemId: "m9", conversaId: "A", remetente: "ana" }, null);
    assert.equal(bipes(), depoisDaPrimeira);
  });

  it("a própria mensagem nunca toca", () => {
    const { tocador, bipes } = tocadorComContador();
    receber(tocador, { mensagemId: "m1", conversaId: "A", remetente: "eu" }, null);
    assert.equal(bipes(), 0);
  });
});
