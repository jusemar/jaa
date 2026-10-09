import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { criarBiometria } from "./biometria.ts";
import { CHAVES_ANTIGAS, CHAVE_CONTA_ATIVA, chavesDaConta, criarCofre, type ArmazenamentoSeguro } from "./cofre-dispositivo.ts";

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");

// Ids de identidade pessoal (é o que nomeia as chaves de cada conta no aparelho).
const A = "0199b000-0000-7000-8000-00000000000a";
const B = "0199b000-0000-7000-8000-00000000000b";

/** Aparelho FALSO: um armazenamento seguro em memória, com biometria do sistema que sempre aceita. */
function aparelho() {
  const guardado = new Map<string, { valor: string; protegido: boolean }>();
  const armazenamento: ArmazenamentoSeguro = {
    podeUsarBiometria: () => true,
    ler: async (chave, protegido) => {
      const item = guardado.get(chave);
      return item && item.protegido === Boolean(protegido) ? item.valor : null;
    },
    gravar: async (chave, valor, protegido) => void guardado.set(chave, { valor, protegido: Boolean(protegido) }),
    apagar: async (chave) => void guardado.delete(chave),
  };
  return { guardado, armazenamento, cofre: criarCofre(armazenamento) };
}

/**
 * Servidor FALSO com a regra real: cada credencial pertence a UMA conta, o segredo da biometria vale
 * só junto com a credencial do mesmo dispositivo, e revogar uma autorização não toca nas outras.
 */
function servidor() {
  const autorizacoes = new Map<string, { conta: string; segredo: string | null; revogada: boolean }>();
  let serie = 0;
  return {
    autorizacoes,
    criarPin(conta: string, anterior: string | null): string {
      const antiga = anterior ? autorizacoes.get(anterior) : undefined;
      // Só revoga a anterior se for DA MESMA conta (regra do servidor).
      if (antiga && antiga.conta === conta) antiga.revogada = true;
      const credencial = `credencial-${conta.slice(-1)}-${++serie}-${"x".repeat(30)}`;
      autorizacoes.set(credencial, { conta, segredo: null, revogada: false });
      return credencial;
    },
    quemEntra(credencial: string | null): string | null {
      const autorizacao = credencial ? autorizacoes.get(credencial) : undefined;
      return autorizacao && !autorizacao.revogada ? autorizacao.conta : null;
    },
    biometria: {
      async ativar(credencial: string) {
        const autorizacao = autorizacoes.get(credencial);
        if (!autorizacao || autorizacao.revogada) return { ok: false as const, semConexao: false };
        autorizacao.segredo = `segredo-${autorizacao.conta.slice(-1)}-${++serie}-${"y".repeat(30)}`;
        return { ok: true as const, segredo: autorizacao.segredo };
      },
      async entrar(credencial: string, segredo: string) {
        const autorizacao = autorizacoes.get(credencial);
        return autorizacao && !autorizacao.revogada && autorizacao.segredo === segredo ? ("ok" as const) : ("recusada" as const);
      },
      async desativar(credencial: string) {
        const autorizacao = autorizacoes.get(credencial);
        if (autorizacao) autorizacao.segredo = null;
      },
    },
    revogar(credencial: string) {
      const autorizacao = autorizacoes.get(credencial);
      if (autorizacao) autorizacao.revogada = true;
    },
  };
}

describe("chaves por conta", () => {
  it("cada conta tem as próprias chaves, e nenhuma coincide com as de outra", () => {
    const [deA, deB] = [chavesDaConta(A), chavesDaConta(B)];
    assert.ok(deA && deB);
    assert.deepEqual(deA, {
      credencial: `jaa.pin.credencial.${A}`,
      segredoBiometria: `jaa.biometria.segredo.${A}`,
      biometriaAtiva: `jaa.biometria.ativa.${A}`,
      ofertaRecusada: `jaa.biometria.oferta-recusada.${A}`,
    });
    assert.equal(new Set([...Object.values(deA), ...Object.values(deB), CHAVE_CONTA_ATIVA]).size, 9);
    // Só o alfabeto que o armazenamento seguro aceita em nome de chave.
    for (const chave of Object.values(deA)) assert.match(chave, /^[A-Za-z0-9._-]+$/);
  });

  it("id que não serve para nomear chave não cria, não lê e não vira conta ativa", async () => {
    const { cofre, guardado } = aparelho();
    for (const ruim of ["", "a", "../x", "id com espaco", "a".repeat(80), "x/y/z/w/k/q"]) {
      assert.equal(chavesDaConta(ruim), null, ruim);
      assert.equal(await cofre.usarConta(ruim), false);
      assert.equal(await cofre.guardarCredencial(ruim, "c".repeat(43)), false);
    }
    assert.equal(guardado.size, 0);
    assert.equal(await cofre.contaAtiva(), null);
  });
});

describe("duas contas no mesmo aparelho", () => {
  /** Monta o cenário pedido: A cria PIN e biometria, sai; B entra por código e cria os seus. */
  async function cenario() {
    const { cofre, guardado, armazenamento } = aparelho();
    const api = servidor();
    const biometria = criarBiometria({ android: true, armazenamento, servidor: api.biometria, lerCredencial: () => cofre.lerCredencial(), chaves: () => cofre.chavesAtivas() });

    // O que o app faz ao criar o PIN de uma conta (pin-dispositivo.ts → criarPin).
    async function criarPin(conta: string) {
      const credencial = api.criarPin(conta, await cofre.lerCredencialDe(conta));
      await cofre.guardarCredencial(conta, credencial);
      await cofre.esquecerBiometriaDe(conta);
      await cofre.usarConta(conta);
      return credencial;
    }

    await cofre.usarConta(A); // A entrou por código
    const credencialA = await criarPin(A);
    assert.equal(await biometria.ativar(), "ok");
    const segredoA = api.autorizacoes.get(credencialA)!.segredo!;

    await cofre.usarConta(B); // A saiu; B escolheu "Usar SMS ou e-mail" e entrou
    return { cofre, guardado, api, biometria, criarPin, credencialA, segredoA };
  }

  it("B entrar por código não apaga, não troca e não revoga nada de A", async () => {
    const { cofre, guardado, api, biometria, credencialA, segredoA } = await cenario();
    // Com B ativa e ainda sem PIN, o aparelho não oferece PIN nem biometria (de ninguém).
    assert.equal(await cofre.contaAtiva(), B);
    assert.equal(await cofre.lerCredencial(), null);
    assert.equal(await biometria.ativaNoAparelho(), false);
    // O que é de A continua guardado e válido.
    assert.equal(await cofre.lerCredencialDe(A), credencialA);
    assert.deepEqual(guardado.get(chavesDaConta(A)!.segredoBiometria), { valor: segredoA, protegido: true });
    assert.equal(api.quemEntra(credencialA), A);
    // B, autenticada, não consegue ativar biometria em cima do dispositivo de A: nem credencial ela tem.
    assert.equal(await biometria.ativar(), "indisponivel");
    assert.equal(api.autorizacoes.get(credencialA)!.segredo, segredoA);
  });

  it("B cria o próprio PIN e a própria biometria: credenciais independentes das de A", async () => {
    const { cofre, guardado, api, biometria, criarPin, credencialA, segredoA } = await cenario();
    const credencialB = await criarPin(B);
    assert.equal(await biometria.ativar(), "ok");
    const segredoB = api.autorizacoes.get(credencialB)!.segredo!;

    assert.notEqual(credencialB, credencialA);
    assert.notEqual(segredoB, segredoA);
    // Nada de A foi sobrescrito nem revogado.
    assert.equal(await cofre.lerCredencialDe(A), credencialA);
    assert.equal(guardado.get(chavesDaConta(A)!.segredoBiometria)?.valor, segredoA);
    assert.equal(api.autorizacoes.get(credencialA)!.revogada, false);
    // Cada credencial entra só na própria conta; trocadas, não entram em lugar nenhum.
    assert.equal(api.quemEntra(credencialA), A);
    assert.equal(api.quemEntra(credencialB), B);
    assert.equal(await api.biometria.entrar(credencialB, segredoA), "recusada");
    assert.equal(await api.biometria.entrar(credencialA, segredoB), "recusada");
    // Com B ativa, PIN e biometria oferecidos são os de B.
    assert.equal(await cofre.lerCredencial(), credencialB);
    assert.equal(await biometria.entrar(), "ok");
  });

  it("voltar a A por código recupera a autorização de A, intacta", async () => {
    const { cofre, api, biometria, criarPin, credencialA } = await cenario();
    await criarPin(B);
    await cofre.usarConta(A); // B saiu; A entrou de novo por código
    assert.equal(await cofre.lerCredencial(), credencialA);
    assert.equal(api.quemEntra(await cofre.lerCredencial()), A);
    assert.equal(await biometria.ativaNoAparelho(), true);
    assert.equal(await biometria.entrar(), "ok");
  });

  it("revogar A não revoga B, e revogar B não revoga A (no servidor e no aparelho)", async () => {
    for (const [revogada, preservada] of [[A, B], [B, A]] as const) {
      const { cofre, guardado, api, biometria, criarPin } = await cenario();
      await criarPin(B);
      assert.equal(await biometria.ativar(), "ok");
      const [credencialRevogada, credencialPreservada] = [(await cofre.lerCredencialDe(revogada))!, (await cofre.lerCredencialDe(preservada))!];

      // "Não usar mais PIN neste aparelho", com a conta `revogada` ativa.
      await cofre.usarConta(revogada);
      api.revogar(credencialRevogada);
      await cofre.esquecerConta(revogada);

      assert.equal(api.quemEntra(credencialRevogada), null);
      assert.equal(await cofre.lerCredencialDe(revogada), null);
      assert.ok(![...guardado.keys()].some((chave) => chave.endsWith(revogada) && chave !== CHAVE_CONTA_ATIVA));
      // A outra conta segue inteira.
      assert.equal(api.quemEntra(credencialPreservada), preservada);
      assert.equal(await cofre.lerCredencialDe(preservada), credencialPreservada);
      assert.ok(guardado.has(chavesDaConta(preservada)!.segredoBiometria));
      await cofre.usarConta(preservada);
      assert.equal(await biometria.entrar(), "ok");
    }
  });

  it("recriar o PIN de uma conta troca só a credencial dela e desliga só a biometria dela", async () => {
    const { cofre, guardado, api, criarPin, credencialA, segredoA } = await cenario();
    const credencialB1 = await criarPin(B);
    const credencialB2 = await criarPin(B);
    assert.notEqual(credencialB2, credencialB1);
    assert.equal(api.autorizacoes.get(credencialB1)!.revogada, true);
    assert.equal(await cofre.lerCredencialDe(B), credencialB2);
    assert.equal(api.autorizacoes.get(credencialA)!.revogada, false);
    assert.equal(guardado.get(chavesDaConta(A)!.segredoBiometria)?.valor, segredoA);
  });
});

describe("chaves únicas da primeira versão", () => {
  it("são retiradas do aparelho, devolvendo a credencial antiga para o servidor revogar", async () => {
    const { cofre, guardado, armazenamento } = aparelho();
    await armazenamento.gravar(CHAVES_ANTIGAS.credencial, "credencial-antiga");
    for (const chave of CHAVES_ANTIGAS.outras) await armazenamento.gravar(chave, "1");
    await cofre.usarConta(A);
    await cofre.guardarCredencial(A, "credencial-nova-de-a");

    assert.equal(await cofre.retirarChavesAntigas(), "credencial-antiga");
    assert.deepEqual([...guardado.keys()].sort(), [CHAVE_CONTA_ATIVA, chavesDaConta(A)!.credencial].sort());
    assert.equal(await cofre.retirarChavesAntigas(), null);
  });
});

describe("o que fica guardado, e onde", () => {
  const fontes = ["./cofre-dispositivo.ts", "./armazenamento-seguro.ts", "./pin-dispositivo.ts", "./biometria.ts", "./biometria-dispositivo.ts"].map(ler).join("\n");
  const codigo = fontes.replace(/\/\*[\s\S]*?\*\//g, "");

  it("tudo no armazenamento seguro do sistema; nada em AsyncStorage, arquivo ou log", () => {
    assert.ok(ler("./armazenamento-seguro.ts").includes('from "expo-secure-store"'));
    for (const proibido of ["async-storage", "AsyncStorage", "FileSystem", "console.", "localStorage"]) assert.ok(!codigo.includes(proibido), proibido);
  });

  it("a conta nunca é escolhida pelo aparelho: o id local só nomeia chaves e não vai nas chamadas", () => {
    const chamadas = [...codigo.matchAll(/chamar\("([^"]+)", (\{[^}]*\})/g)].map((achado) => `${achado[1]} ${achado[2]}`);
    assert.ok(chamadas.length >= 6, String(chamadas.length));
    for (const chamada of chamadas) for (const proibido of ["contaId", "usuarioId", "userId", "email", "phoneNumber"]) assert.ok(!chamada.includes(proibido), chamada);
  });

  it("a tela passa a conta que entrou para o cofre e cria o PIN nas chaves dela", () => {
    const tela = ler("../components/fluxo-login.tsx");
    assert.ok(tela.includes("await usarContaNoAparelho(conta.identidadePessoal?.id);") && tela.includes("criarPin(contaId, pin, confirmacaoPin)"));
    // O app só abre por um caminho, depois de registrar a conta ativa.
    assert.equal((tela.match(/aoEntrar\(/g) ?? []).length, 1);
  });
});
