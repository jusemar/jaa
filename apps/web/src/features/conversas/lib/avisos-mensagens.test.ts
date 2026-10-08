import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AREAS_PESSOAIS } from "@/components/navegacao/areas.ts";
import { NavegacaoApp } from "@/components/navegacao/navegacao-app.tsx";
import { aplicarNaoLidas, combinarResumo, rotuloTotalNaoLidas, totalNaoLidas } from "./nao-lidas-globais.ts";
import { criarTocadorSomMensagem, type ContextoAudioMinimo } from "./som-mensagem.ts";

const C1 = "0199aaaa-0000-7000-8000-00000000c001";
const C2 = "0199aaaa-0000-7000-8000-00000000c002";

describe("não lidas globais (indicador de Conversas)", () => {
  it("total = soma das conversas; 2 numa e 1 noutra = 3", () => {
    let mapa = aplicarNaoLidas(new Map(), { conversaId: C1, naoLidas: 2 });
    mapa = aplicarNaoLidas(mapa, { conversaId: C2, naoLidas: 1 });
    assert.equal(totalNaoLidas(mapa), 3);
  });

  it("evento é valor ABSOLUTO: repetido não duplica; 0 remove só aquela conversa", () => {
    let mapa = aplicarNaoLidas(new Map(), { conversaId: C1, naoLidas: 2 });
    const repetido = aplicarNaoLidas(mapa, { conversaId: C1, naoLidas: 2 });
    assert.equal(repetido, mapa);
    mapa = aplicarNaoLidas(aplicarNaoLidas(mapa, { conversaId: C2, naoLidas: 1 }), { conversaId: C1, naoLidas: 0 });
    assert.deepEqual([...mapa], [[C2, 1]]);
  });

  it("resumo relido na reconexão substitui tudo, mas não desfaz evento mais novo que ele", () => {
    const atual = new Map([[C1, 5]]);
    // C1 foi lida (evento 0 → removida) enquanto o resumo, mais velho, dizia 5.
    const lidaDuranteBusca = aplicarNaoLidas(atual, { conversaId: C1, naoLidas: 0 });
    const combinado = combinarResumo(lidaDuranteBusca, { conversas: [{ conversaId: C1, naoLidas: 5 }, { conversaId: C2, naoLidas: 1 }] }, new Set([C1]));
    assert.deepEqual([...combinado], [[C2, 1]]);
    // Sem eventos no meio, o resumo manda (inclusive zerando o que o servidor não lista mais).
    assert.deepEqual([...combinarResumo(new Map([[C1, 9]]), { conversas: [] }, new Set())], []);
  });

  it("rótulo 99+ a partir de 100", () => {
    assert.equal(rotuloTotalNaoLidas(7), "7");
    assert.equal(rotuloTotalNaoLidas(100), "99+");
  });

  it("navegação: badge com número e nome acessível no item Conversas; sem não lidas, nada", () => {
    const com = renderToStaticMarkup(createElement(NavegacaoApp, { areas: AREAS_PESSOAIS, areaAtiva: "perfil", aoAbrir: () => {}, naoLidasConversas: 3 }));
    assert.match(com, /data-area="conversas"[^>]*aria-label="Conversas, 3 mensagens não lidas"/);
    assert.ok(com.includes('data-nao-lidas-area="3"'));
    const sem = renderToStaticMarkup(createElement(NavegacaoApp, { areas: AREAS_PESSOAIS, areaAtiva: "perfil", aoAbrir: () => {} }));
    assert.ok(!sem.includes("data-nao-lidas-area"));
  });
});

describe("som de mensagem recebida", () => {
  function contextoFalso(estado = "running") {
    const tocados: number[] = [];
    const parametro = () => ({ setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} });
    const ctx = {
      state: estado,
      currentTime: 0,
      destination: {} as AudioNode,
      resume: async () => {
        ctx.state = "running";
      },
      createOscillator: () =>
        ({ type: "sine", frequency: parametro(), connect: () => {}, start: () => tocados.push(1), stop: () => {} }) as unknown as OscillatorNode,
      createGain: () => ({ gain: parametro(), connect: () => {} }) as unknown as GainNode,
    };
    return { ctx: ctx as ContextoAudioMinimo & { state: string }, tocados };
  }

  it("mensagem nova toca uma vez; o MESMO id (evento repetido/reconexão) não toca de novo", () => {
    const { ctx, tocados } = contextoFalso();
    const tocador = criarTocadorSomMensagem(() => ctx);
    tocador.habilitar();
    assert.equal(tocador.tocar("m1"), true);
    const depoisDaPrimeira = tocados.length;
    assert.ok(depoisDaPrimeira > 0);
    assert.equal(tocador.tocar("m1"), false);
    assert.equal(tocados.length, depoisDaPrimeira);
    assert.equal(tocador.tocar("m2"), true);
    assert.ok(tocados.length > depoisDaPrimeira);
  });

  it("antes da primeira interação (autoplay bloqueado) não toca nem dá erro", () => {
    const { ctx, tocados } = contextoFalso("suspended");
    const tocador = criarTocadorSomMensagem(() => ctx);
    assert.doesNotThrow(() => tocador.tocar("m1"));
    assert.equal(tocados.length, 0);
  });

  it("navegador sem Web Audio: segue sem som e sem erro", () => {
    const tocador = criarTocadorSomMensagem(() => null);
    tocador.habilitar();
    assert.equal(tocador.tocar("m1"), true);
  });
});

describe("som da próxima entrega", () => {
  it("é um som PRÓPRIO: mais notas, mais longo e mais alto que o de mensagem", async () => {
    const { PADRAO_SOM_ENTREGA_PROXIMA, PADRAO_SOM_MENSAGEM } = await import("./som-mensagem.ts");
    assert.ok(PADRAO_SOM_ENTREGA_PROXIMA.notas.length > PADRAO_SOM_MENSAGEM.notas.length);
    assert.ok(PADRAO_SOM_ENTREGA_PROXIMA.duracao > PADRAO_SOM_MENSAGEM.duracao);
    assert.ok(PADRAO_SOM_ENTREGA_PROXIMA.volume > PADRAO_SOM_MENSAGEM.volume);
    assert.ok(PADRAO_SOM_ENTREGA_PROXIMA.volume <= 0.2, "destacado, sem virar alarme");
  });

  it("o mesmo aviso (reconexão/evento repetido) toca uma vez só; outro aviso toca de novo", async () => {
    const { PADRAO_SOM_ENTREGA_PROXIMA, criarTocadorSom } = await import("./som-mensagem.ts");
    const notas: number[] = [];
    const parametro = () => ({ setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} });
    const ctx = {
      state: "running",
      currentTime: 0,
      destination: {} as AudioNode,
      resume: async () => {},
      createOscillator: () => ({ type: "sine", frequency: parametro(), connect: () => {}, start: () => notas.push(1), stop: () => {} }) as unknown as OscillatorNode,
      createGain: () => ({ gain: parametro(), connect: () => {} }) as unknown as GainNode,
    };
    const tocador = criarTocadorSom(() => ctx, PADRAO_SOM_ENTREGA_PROXIMA);
    tocador.habilitar();
    assert.equal(tocador.tocar("aviso-1"), true);
    assert.equal(notas.length, 3);
    assert.equal(tocador.tocar("aviso-1"), false);
    assert.equal(notas.length, 3);
    assert.equal(tocador.tocar("aviso-2"), true);
    assert.equal(notas.length, 6);
  });
});

describe("som de novo pedido (empresa)", () => {
  const parametro = () => ({ setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} });
  function contexto() {
    const notas: number[] = [];
    const ctx = {
      state: "running",
      currentTime: 0,
      destination: {} as AudioNode,
      resume: async () => {},
      createOscillator: () => ({ type: "sine", frequency: parametro(), connect: () => {}, start: () => notas.push(1), stop: () => {} }) as unknown as OscillatorNode,
      createGain: () => ({ gain: parametro(), connect: () => {} }) as unknown as GainNode,
    };
    return { ctx: ctx as ContextoAudioMinimo, notas };
  }

  it("é um som PRÓPRIO, diferente do de mensagem e do de entrega próxima", async () => {
    const { PADRAO_SOM_ENTREGA_PROXIMA, PADRAO_SOM_MENSAGEM, PADRAO_SOM_NOVO_PEDIDO } = await import("./som-mensagem.ts");
    const frequencias = (padrao: { notas: ReadonlyArray<{ frequencia: number }> }) => padrao.notas.map((nota) => nota.frequencia).join(",");
    assert.notEqual(frequencias(PADRAO_SOM_NOVO_PEDIDO), frequencias(PADRAO_SOM_MENSAGEM));
    assert.notEqual(frequencias(PADRAO_SOM_NOVO_PEDIDO), frequencias(PADRAO_SOM_ENTREGA_PROXIMA));
    assert.ok(PADRAO_SOM_NOVO_PEDIDO.volume > PADRAO_SOM_MENSAGEM.volume);
  });

  it("um pedido, UM som: reentrega do mesmo pedido (reconexão, evento repetido) não toca de novo", async () => {
    const { PADRAO_SOM_NOVO_PEDIDO, criarTocadorSom } = await import("./som-mensagem.ts");
    const { ctx, notas } = contexto();
    const pedido = criarTocadorSom(() => ctx, PADRAO_SOM_NOVO_PEDIDO);
    pedido.habilitar();
    assert.equal(pedido.tocar("pedido-1"), true);
    assert.equal(pedido.tocar("pedido-1"), false);
    assert.equal(notas.length, PADRAO_SOM_NOVO_PEDIDO.notas.length);
    assert.equal(pedido.tocar("pedido-2"), true);
    assert.equal(notas.length, PADRAO_SOM_NOVO_PEDIDO.notas.length * 2);
  });

  it("o gatilho é `pedido:novo` — pedido não é mensagem para a empresa", async () => {
    const { readFileSync } = await import("node:fs");
    const hook = readFileSync(new URL("../hooks/use-avisos-mensagens.ts", import.meta.url), "utf8");
    assert.ok(hook.includes("socket.on(EVENTO_PEDIDO_NOVO, aoChegarPedido)"));
    assert.equal(hook.includes("EVENTO_MENSAGEM_NOVA"), false);
  });
});

describe("indicador de Pedidos (empresa)", () => {
  it("pedido aguardando marca o item PEDIDOS — nunca o de Conversas", async () => {
    const { AREAS_EMPRESARIAIS } = await import("@/components/navegacao/areas.ts");
    const html = renderToStaticMarkup(createElement(NavegacaoApp, { areas: AREAS_EMPRESARIAIS, areaAtiva: "conversas", aoAbrir: () => {}, pedidosAguardando: 2 }));
    assert.ok(/data-area="pedidos"[^>]*aria-label="Pedidos, 2 pedidos aguardando"/.test(html));
    assert.ok(html.includes('data-pedidos-aguardando="2"'));
    assert.equal(html.includes("data-nao-lidas-area"), false, "Conversas não ganha indicador por causa de pedido");
    const sem = renderToStaticMarkup(createElement(NavegacaoApp, { areas: AREAS_EMPRESARIAIS, areaAtiva: "conversas", aoAbrir: () => {} }));
    assert.equal(sem.includes("data-pedidos-aguardando"), false);
  });
});

describe("aviso flutuante 'Sua entrega é a próxima' (Web)", () => {
  it("tem fundo SÓLIDO do tema (o tipo sem classe ficava transparente) e é disparado uma vez por aviso", async () => {
    const { readFileSync } = await import("node:fs");
    const avisos = readFileSync(new URL("../../../components/ui/avisos.tsx", import.meta.url), "utf8");
    const classe = /default: "([^"]+)"/.exec(avisos)?.[1] ?? "";
    assert.ok(classe.includes("bg-marca-suave") && classe.includes("text-marca-suave-conteudo"), classe);
    assert.equal(/bg-[a-z-]+\/\d+|opacity-|backdrop-/.test(classe), false, "nada translúcido");
    // Um contêiner de avisos no app e um único disparo, protegido pelo id do aviso.
    const hook = readFileSync(new URL("../hooks/use-avisos-mensagens.ts", import.meta.url), "utf8");
    assert.equal((hook.match(/avisarEmDestaque\(/g) ?? []).length, 1);
    assert.ok(hook.includes("!obterTocadorEntrega().tocar(aviso.data.avisoId)"));
    const app = readFileSync(new URL("../../../components/navegacao/app-jaa.tsx", import.meta.url), "utf8");
    assert.equal((app.match(/<AvisosDeAcao \/>/g) ?? []).length, 1);
  });
});

