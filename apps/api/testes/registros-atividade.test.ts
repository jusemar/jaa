import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { criarRegistroDigitandoEmMemoria, type MudancaDigitando } from "../src/features/conversas/lib/registro-digitando.js";
import { criarRegistroPresencaEmMemoria } from "../src/features/presenca/lib/registro-presenca.js";

/*
 * Regras puras dos registros efêmeros em memória, com relógio simulado (sem esperas reais).
 */

beforeEach(() => mock.timers.enable({ apis: ["setTimeout", "Date"] }));
afterEach(() => mock.timers.reset());

describe("registro de presença", () => {
  const TOLERANCIA = 5000;

  function criar() {
    const registro = criarRegistroPresencaEmMemoria({ toleranciaOfflineMs: TOLERANCIA });
    const mudancas: string[] = [];
    registro.inscrever(({ identidadeId, online }) => mudancas.push(`${identidadeId}:${online ? "online" : "offline"}`));
    return { registro, mudancas };
  }

  it("pertence à identidade: duas conexões, fecha uma continua online, fecha a última fica offline após a tolerância", () => {
    const { registro, mudancas } = criar();
    registro.conectar("A", "aba1");
    registro.conectar("A", "aba2");
    assert.deepEqual(mudancas, ["A:online"]);

    registro.desconectar("A", "aba1");
    mock.timers.tick(TOLERANCIA * 3);
    assert.equal(registro.estaOnline("A"), true);
    assert.deepEqual(mudancas, ["A:online"]);

    registro.desconectar("A", "aba2");
    assert.equal(registro.estaOnline("A"), true, "ainda dentro da tolerância");
    mock.timers.tick(TOLERANCIA - 1);
    assert.deepEqual(mudancas, ["A:online"]);
    mock.timers.tick(1);
    assert.equal(registro.estaOnline("A"), false);
    assert.deepEqual(mudancas, ["A:online", "A:offline"]);

    registro.conectar("A", "aba3");
    assert.deepEqual(mudancas, ["A:online", "A:offline", "A:online"]);
  });

  it("reload/reconexão dentro da tolerância não gera offline nem online falsos", () => {
    const { registro, mudancas } = criar();
    registro.conectar("A", "s1");
    registro.desconectar("A", "s1");
    mock.timers.tick(1500);
    registro.conectar("A", "s2");
    mock.timers.tick(TOLERANCIA * 2);
    assert.deepEqual(mudancas, ["A:online"]);
    assert.equal(registro.estaOnline("A"), true);
  });

  it("desconexão repetida ou de conexão desconhecida não altera nada; identidades são independentes", () => {
    const { registro, mudancas } = criar();
    registro.conectar("A", "s1");
    registro.conectar("B", "s2");
    registro.desconectar("A", "desconhecida");
    registro.desconectar("B", "s1");
    mock.timers.tick(TOLERANCIA * 2);
    assert.deepEqual(mudancas, ["A:online", "B:online"]);
    registro.desconectar("B", "s2");
    registro.desconectar("B", "s2");
    mock.timers.tick(TOLERANCIA);
    assert.deepEqual(mudancas, ["A:online", "B:online", "B:offline"]);
    assert.equal(registro.estaOnline("A"), true);
  });

  it("encerrar cancela saídas pendentes", () => {
    const { registro, mudancas } = criar();
    registro.conectar("A", "s1");
    registro.desconectar("A", "s1");
    registro.encerrar();
    mock.timers.tick(TOLERANCIA * 2);
    assert.deepEqual(mudancas, ["A:online"]);
  });
});

describe("registro de digitando", () => {
  const VALIDADE = 6000;
  const REPASSE = 2000;

  function criar() {
    const registro = criarRegistroDigitandoEmMemoria({ validadeMs: VALIDADE, intervaloMinimoRepasseMs: REPASSE });
    const mudancas: string[] = [];
    registro.inscrever(({ conversaId, identidadeId, digitando }: MudancaDigitando) =>
      mudancas.push(`${conversaId}/${identidadeId}:${digitando}`),
    );
    const informar = (conexaoId: string, digitando: boolean, conversaId = "AB", identidadeId = "A") =>
      registro.informar({ conversaId, identidadeId, conexaoId, digitando });
    return { registro, mudancas, informar };
  }

  it("começa, absorve renovações frequentes (throttle) e repassa renovação após o intervalo", () => {
    const { mudancas, informar } = criar();
    for (let i = 0; i < 30; i++) {
      informar("s1", true);
      mock.timers.tick(50);
    }
    assert.deepEqual(mudancas, ["AB/A:true"], "30 teclas em 1,5 s → um único evento");
    mock.timers.tick(REPASSE);
    informar("s1", true);
    assert.deepEqual(mudancas, ["AB/A:true", "AB/A:true"]);
  });

  it("parar sem ter começado não gera evento falso", () => {
    const { mudancas, informar } = criar();
    informar("s1", false);
    assert.deepEqual(mudancas, []);
  });

  it("validade: sem renovação nem aviso final, para sozinho (nunca fica preso)", () => {
    const { mudancas, informar } = criar();
    informar("s1", true);
    mock.timers.tick(VALIDADE - 1);
    assert.deepEqual(mudancas, ["AB/A:true"]);
    mock.timers.tick(1);
    assert.deepEqual(mudancas, ["AB/A:true", "AB/A:false"]);
  });

  it("renovação adia a validade", () => {
    const { mudancas, informar } = criar();
    informar("s1", true);
    mock.timers.tick(VALIDADE - 1000);
    informar("s1", true);
    mock.timers.tick(VALIDADE - 1000);
    assert.equal(mudancas.filter((m) => m.endsWith("false")).length, 0);
    mock.timers.tick(1000);
    assert.equal(mudancas.at(-1), "AB/A:false");
  });

  it("várias conexões da mesma identidade: para só quando a última para; queda encerra a conexão", () => {
    const { registro, mudancas, informar } = criar();
    informar("aba1", true);
    informar("aba2", true);
    informar("aba1", false);
    assert.deepEqual(mudancas, ["AB/A:true"]);
    registro.encerrarConexao("aba2");
    assert.deepEqual(mudancas, ["AB/A:true", "AB/A:false"]);
    mock.timers.tick(VALIDADE * 2);
    assert.deepEqual(mudancas, ["AB/A:true", "AB/A:false"], "sem evento extra depois");
  });

  it("envio de mensagem para a identidade em todas as conexões; sair da conversa para só naquela conversa", () => {
    const { registro, mudancas, informar } = criar();
    informar("aba1", true);
    informar("aba2", true);
    informar("aba1", true, "AC");
    registro.pararIdentidade("AB", "A");
    assert.deepEqual(mudancas, ["AB/A:true", "AC/A:true", "AB/A:false"]);
    registro.pararConexaoNaConversa("AC", "aba1");
    assert.deepEqual(mudancas, ["AB/A:true", "AC/A:true", "AB/A:false", "AC/A:false"]);
  });
});
