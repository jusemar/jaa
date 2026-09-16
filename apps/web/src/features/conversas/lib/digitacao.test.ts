import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { criarControleDigitacao, criarIndicadorDigitando } from "./digitacao.ts";

beforeEach(() => mock.timers.enable({ apis: ["setTimeout", "Date"] }));
afterEach(() => mock.timers.reset());

describe("controle de digitação (quem digita)", () => {
  function criar() {
    const avisos: boolean[] = [];
    const controle = criarControleDigitacao({ emitir: (d) => avisos.push(d), intervaloRenovacaoMs: 2500, pausaMs: 3000 });
    return { avisos, controle };
  }

  it("dezenas de teclas não geram dezenas de avisos: começa, renova pelo intervalo e para na pausa", () => {
    const { avisos, controle } = criar();
    for (let i = 0; i < 50; i++) {
      controle.aoAlterarTexto("a".repeat(i + 1));
      mock.timers.tick(100); // 10 teclas/s durante 5 s
    }
    assert.deepEqual(avisos, [true, true], "um início + uma renovação em 5 s");
    // A última tecla foi há 100 ms (último tick do laço): a pausa de 3 s termina em mais 2,9 s.
    mock.timers.tick(2899);
    assert.equal(avisos.length, 2);
    mock.timers.tick(1);
    assert.deepEqual(avisos, [true, true, false]);
  });

  it("enviar, apagar o texto ou sair param imediatamente; parar sem digitar não avisa", () => {
    const { avisos, controle } = criar();
    controle.parar();
    assert.deepEqual(avisos, []);
    controle.aoAlterarTexto("oi");
    controle.parar(); // envio
    controle.aoAlterarTexto("de novo");
    controle.aoAlterarTexto("");
    assert.deepEqual(avisos, [true, false, true, false]);
    mock.timers.tick(10_000);
    assert.equal(avisos.length, 4, "pausa cancelada não gera aviso extra");
  });

  it("conexão caiu: redefinir esquece o estado e a próxima tecla avisa de novo", () => {
    const { avisos, controle } = criar();
    controle.aoAlterarTexto("oi");
    controle.redefinir();
    mock.timers.tick(5000);
    controle.aoAlterarTexto("oi!");
    assert.deepEqual(avisos, [true, true]);
  });
});

describe("indicador de digitando (quem recebe)", () => {
  it("aparece, renova, some com o aviso final e some sozinho após a validade (nunca preso)", () => {
    const estados: boolean[] = [];
    const indicador = criarIndicadorDigitando({ validadeMs: 8000, aoMudar: (d) => estados.push(d) });
    indicador.receber(true);
    mock.timers.tick(6000);
    indicador.receber(true);
    mock.timers.tick(6000);
    assert.deepEqual(estados, [true]);
    indicador.receber(false);
    assert.deepEqual(estados, [true, false]);

    indicador.receber(true);
    mock.timers.tick(7999);
    assert.deepEqual(estados, [true, false, true]);
    mock.timers.tick(1);
    assert.deepEqual(estados, [true, false, true, false]);
    indicador.limpar();
    indicador.receber(false);
    assert.equal(estados.length, 4, "sem mudanças repetidas");
  });
});
