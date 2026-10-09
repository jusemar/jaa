import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { chavesDaConta } from "./cofre-dispositivo.ts";
import {
  MENSAGENS_BIOMETRIA,
  biometriaBloqueadaPeloSistema,
  criarBiometria,
  entradaInicial,
  type DependenciasBiometria,
} from "./biometria.ts";

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");

const CREDENCIAL = "credencial-do-dispositivo-de-teste-0123456789abcdef";
const SEGREDO = "segredo-da-biometria-de-teste-0123456789abcdefghij";
// A conta ativa do aparelho nestes cenários, e as chaves DELA.
const CONTA = "0199b000-0000-7000-8000-00000000000a";
const CHAVES = chavesDaConta(CONTA)!;
const { segredoBiometria: CHAVE_SEGREDO_BIOMETRIA, biometriaAtiva: CHAVE_BIOMETRIA_ATIVA, ofertaRecusada: CHAVE_OFERTA_RECUSADA } = CHAVES;

/*
 * Aparelho e servidor FALSOS. O "aparelho" imita o expo-secure-store no Android: o valor protegido só
 * é lido/gravado se a biometria do sistema aceitar; cancelar ou bloquear LANÇA; chave invalidada
 * (biometrias do aparelho mudaram) devolve vazio.
 */
function cenario(inicial: { android?: boolean; compativel?: boolean; credencial?: string | null; ativa?: boolean; semConta?: boolean } = {}) {
  const guardado = new Map<string, { valor: string; protegido: boolean }>();
  const chamadas: string[] = [];
  const estado = {
    android: inicial.android ?? true,
    compativel: inicial.compativel ?? true,
    credencial: inicial.credencial === undefined ? CREDENCIAL : inicial.credencial,
    // O que o aviso de biometria do sistema faz na próxima vez que abrir.
    aviso: "aceita" as "aceita" | "cancela" | "bloqueia",
    chaveInvalidada: false,
    servidorAtiva: "ok" as "ok" | "recusa" | "sem-conexao",
    servidorEntra: "ok" as "ok" | "recusada" | "sem-conexao",
    avisosAbertos: 0,
  };
  if (inicial.ativa) {
    guardado.set(CHAVE_SEGREDO_BIOMETRIA, { valor: SEGREDO, protegido: true });
    guardado.set(CHAVE_BIOMETRIA_ATIVA, { valor: "1", protegido: false });
  }

  function exigirBiometria() {
    estado.avisosAbertos++;
    if (estado.aviso === "cancela") throw new Error("Could not Authenticate the user: User canceled. Authentication was canceled by the user");
    if (estado.aviso === "bloqueia") throw new Error("Could not Authenticate the user: Lockout. Too many attempts. Try again later.");
  }

  const dependencias: DependenciasBiometria = {
    get android() {
      return estado.android;
    },
    lerCredencial: async () => estado.credencial,
    chaves: async () => (inicial.semConta ? null : CHAVES),
    armazenamento: {
      podeUsarBiometria: () => estado.compativel,
      async ler(chave, protegido) {
        const item = guardado.get(chave);
        if (!protegido) return item && !item.protegido ? item.valor : null;
        if (!item) return null;
        if (estado.chaveInvalidada) return null;
        exigirBiometria();
        return item.valor;
      },
      async gravar(chave, valor, protegido) {
        if (protegido) exigirBiometria();
        guardado.set(chave, { valor, protegido: Boolean(protegido) });
      },
      async apagar(chave) {
        guardado.delete(chave);
      },
    },
    servidor: {
      async ativar(credencial) {
        chamadas.push(`ativar:${credencial}`);
        if (estado.servidorAtiva === "ok") return { ok: true, segredo: SEGREDO };
        return { ok: false, semConexao: estado.servidorAtiva === "sem-conexao" };
      },
      async entrar(credencial, segredo) {
        chamadas.push(`entrar:${credencial}:${segredo}`);
        return estado.servidorEntra;
      },
      async desativar(credencial) {
        chamadas.push(`desativar:${credencial}`);
      },
    },
  };
  return { biometria: criarBiometria(dependencias), estado, guardado, chamadas };
}

describe("por onde a entrada começa: BIOMETRIA → PIN → SMS ou e-mail", () => {
  it("aparelho novo vai para o código; autorizado vai para o PIN; com biometria nos dois lados, biometria", () => {
    assert.equal(entradaInicial({ autorizado: false, biometriaNoServidor: true, biometriaNoAparelho: true }), "codigo");
    assert.equal(entradaInicial({ autorizado: true, biometriaNoServidor: false, biometriaNoAparelho: false }), "pin");
    assert.equal(entradaInicial({ autorizado: true, biometriaNoServidor: true, biometriaNoAparelho: false }), "pin");
    assert.equal(entradaInicial({ autorizado: true, biometriaNoServidor: false, biometriaNoAparelho: true }), "pin");
    assert.equal(entradaInicial({ autorizado: true, biometriaNoServidor: true, biometriaNoAparelho: true }), "biometria");
  });
});

describe("aparelho compatível", () => {
  it("só o Android com biometria forte e alguma cadastrada oferece biometria", async () => {
    assert.equal(cenario().biometria.aparelhoCompativel(), true);
    // Sem hardware ou sem nenhuma biometria cadastrada, o sistema responde "não pode" do mesmo jeito.
    assert.equal(cenario({ compativel: false }).biometria.aparelhoCompativel(), false);
    assert.equal(cenario({ android: false }).biometria.aparelhoCompativel(), false);
    assert.equal(await cenario({ compativel: false, ativa: true }).biometria.ativaNoAparelho(), false);
    assert.equal(await cenario({ ativa: true }).biometria.ativaNoAparelho(), true);
    assert.equal(await cenario().biometria.ativaNoAparelho(), false);
  });
});

describe("ativar a biometria", () => {
  it("sucesso: o sistema pede a biometria, o segredo fica PROTEGIDO e a oferta recusada é esquecida", async () => {
    const { biometria, guardado, chamadas, estado } = cenario();
    await biometria.recusarOferta();
    assert.equal(await biometria.ativar(), "ok");
    assert.equal(estado.avisosAbertos, 1);
    assert.deepEqual(guardado.get(CHAVE_SEGREDO_BIOMETRIA), { valor: SEGREDO, protegido: true });
    assert.deepEqual(guardado.get(CHAVE_BIOMETRIA_ATIVA), { valor: "1", protegido: false });
    assert.equal(guardado.has(CHAVE_OFERTA_RECUSADA), false);
    assert.deepEqual(chamadas, [`ativar:${CREDENCIAL}`]);
    assert.equal(await biometria.ativaNoAparelho(), true);
  });

  it("aparelho sem biometria, ou sem dispositivo autorizado (sem PIN): nada é pedido ao servidor", async () => {
    for (const inicial of [{ compativel: false }, { android: false }, { credencial: null }, { semConta: true }]) {
      const { biometria, chamadas, guardado, estado } = cenario(inicial);
      assert.equal(await biometria.ativar(), "indisponivel");
      assert.deepEqual([chamadas.length, guardado.size, estado.avisosAbertos], [0, 0, 0]);
    }
  });

  it("a pessoa cancela a biometria do sistema: nada fica ativado, e o servidor é avisado", async () => {
    const { biometria, guardado, chamadas, estado } = cenario();
    estado.aviso = "cancela";
    assert.equal(await biometria.ativar(), "cancelada");
    assert.equal(guardado.size, 0);
    assert.deepEqual(chamadas, [`ativar:${CREDENCIAL}`, `desativar:${CREDENCIAL}`]);
    assert.equal(await biometria.ativaNoAparelho(), false);
  });

  it("servidor recusa ou está sem conexão: o aviso do sistema nem abre", async () => {
    for (const [resposta, esperado] of [["recusa", "indisponivel"], ["sem-conexao", "sem-conexao"]] as const) {
      const { biometria, estado, guardado } = cenario();
      estado.servidorAtiva = resposta;
      assert.equal(await biometria.ativar(), esperado);
      assert.deepEqual([estado.avisosAbertos, guardado.size], [0, 0]);
    }
  });
});

describe("entrar com biometria", () => {
  it("sucesso: a biometria libera o segredo e só credencial + segredo vão ao servidor", async () => {
    const { biometria, chamadas, estado } = cenario({ ativa: true });
    assert.equal(await biometria.entrar(), "ok");
    assert.equal(estado.avisosAbertos, 1);
    assert.deepEqual(chamadas, [`entrar:${CREDENCIAL}:${SEGREDO}`]);
    assert.equal(await biometria.ativaNoAparelho(), true);
  });

  it("cancelada ou não reconhecida: nada vai ao servidor e a biometria continua ativa (dá para tentar de novo ou usar o PIN)", async () => {
    const { biometria, chamadas, estado } = cenario({ ativa: true });
    estado.aviso = "cancela";
    assert.equal(await biometria.entrar(), "cancelada");
    assert.equal(chamadas.length, 0);
    assert.equal(await biometria.ativaNoAparelho(), true);
    estado.aviso = "aceita";
    assert.equal(await biometria.entrar(), "ok");
  });

  it("bloqueada pelo Android por tentativas: resultado próprio, nada vai ao servidor, e ela volta depois", async () => {
    const { biometria, chamadas, estado } = cenario({ ativa: true });
    estado.aviso = "bloqueia";
    assert.equal(await biometria.entrar(), "bloqueada");
    assert.equal(chamadas.length, 0);
    assert.equal(await biometria.ativaNoAparelho(), true);
    assert.equal(biometriaBloqueadaPeloSistema(new Error("Could not Authenticate the user: Lockout permanent. x")), true);
    assert.equal(biometriaBloqueadaPeloSistema(new Error("Could not Authenticate the user: User canceled. x")), false);
    assert.equal(biometriaBloqueadaPeloSistema(undefined), false);
  });

  it("biometrias do aparelho mudaram (chave invalidada): a biometria é desativada aqui e no servidor, sem abrir aviso", async () => {
    const { biometria, chamadas, estado, guardado } = cenario({ ativa: true });
    estado.chaveInvalidada = true;
    assert.equal(await biometria.entrar(), "desativada");
    assert.equal(estado.avisosAbertos, 0);
    assert.deepEqual(chamadas, [`desativar:${CREDENCIAL}`]);
    assert.deepEqual([guardado.has(CHAVE_SEGREDO_BIOMETRIA), guardado.has(CHAVE_BIOMETRIA_ATIVA)], [false, false]);
    // Depois de entrar com o PIN, dá para ativar de novo.
    estado.chaveInvalidada = false;
    assert.equal(await biometria.ativar(), "ok");
    assert.equal(await biometria.entrar(), "ok");
  });

  it("segredo ausente no armazenamento seguro: desativada, sem enviar nada de autenticação", async () => {
    const { biometria, chamadas, guardado } = cenario({ ativa: true });
    guardado.delete(CHAVE_SEGREDO_BIOMETRIA);
    assert.equal(await biometria.entrar(), "desativada");
    assert.ok(!chamadas.some((chamada) => chamada.startsWith("entrar:")));
    assert.equal(guardado.has(CHAVE_BIOMETRIA_ATIVA), false);
  });

  it("aparelho ficou sem biometria (removida no sistema): desativada", async () => {
    const { biometria, estado, guardado, chamadas } = cenario({ ativa: true });
    estado.compativel = false;
    assert.equal(await biometria.entrar(), "desativada");
    assert.deepEqual([estado.avisosAbertos, guardado.size], [0, 0]);
    assert.deepEqual(chamadas, [`desativar:${CREDENCIAL}`]);
  });

  it("autorização revogada no servidor: o segredo sai do aparelho e a entrada segue pelo PIN", async () => {
    const { biometria, estado, guardado } = cenario({ ativa: true });
    estado.servidorEntra = "recusada";
    assert.equal(await biometria.entrar(), "desativada");
    assert.equal(guardado.size, 0);
  });

  it("erro de rede: nada é apagado; dá para tentar de novo", async () => {
    const { biometria, estado } = cenario({ ativa: true });
    estado.servidorEntra = "sem-conexao";
    assert.equal(await biometria.entrar(), "sem-conexao");
    assert.equal(await biometria.ativaNoAparelho(), true);
  });

  it("sem a credencial do dispositivo (PIN removido), a biometria não tem como funcionar", async () => {
    const { biometria, chamadas, guardado } = cenario({ ativa: true, credencial: null });
    assert.equal(await biometria.entrar(), "desativada");
    assert.deepEqual([chamadas.length, guardado.size], [0, 0]);
  });
});

describe("desativar e a oferta", () => {
  it("desativar apaga do aparelho e avisa o servidor; a oferta recusada só vale até a próxima ativação", async () => {
    const { biometria, guardado, chamadas } = cenario({ ativa: true });
    await biometria.desativar();
    assert.deepEqual(chamadas, [`desativar:${CREDENCIAL}`]);
    assert.equal(guardado.size, 0);

    assert.equal(await biometria.ofertaRecusada(), false);
    await biometria.recusarOferta();
    assert.equal(await biometria.ofertaRecusada(), true);
  });
});

describe("o que a pessoa vê e o que o aparelho guarda", () => {
  const tela = ler("../components/fluxo-login.tsx");
  const ligacao = ler("./biometria-dispositivo.ts");
  const regras = ler("./biometria.ts");

  it("hierarquia na tela: Entrar com biometria, Usar PIN, Usar SMS ou e-mail — e a ativação é opcional", () => {
    const etapaBiometria = tela.slice(tela.indexOf('{etapa === "biometria" && ('), tela.indexOf('{etapa === "ativarBiometria" && ('));
    const ordem = ['rotulo="Entrar com biometria"', 'rotulo="Usar PIN"', 'rotulo="Usar SMS ou e-mail"'].map((parte) => etapaBiometria.indexOf(parte));
    assert.ok(ordem.every((posicao) => posicao >= 0) && ordem[0]! < ordem[1]! && ordem[1]! < ordem[2]!, String(ordem));
    assert.ok(tela.includes('rotulo="Ativar biometria"') && tela.includes("agoraNaoParaBiometria"));
    // Falha da biometria leva ao PIN — nunca dispara SMS/e-mail sozinha.
    const entradaPelaBiometria = tela.slice(tela.indexOf("const entrarPelaBiometria"), tela.indexOf("const ativarBiometriaDoAparelho"));
    assert.ok(entradaPelaBiometria.includes('setEtapa("pin")'));
    for (const proibido of ["sendOtp", "sendVerificationOtp", "pedirCodigo"]) assert.ok(!entradaPelaBiometria.includes(proibido), proibido);
  });

  it("frases genéricas: nada de 'digital', 'rosto', fornecedor ou erro técnico", () => {
    const textos = Object.values(MENSAGENS_BIOMETRIA).join(" ") + tela;
    for (const proibido of ["impressão digital", "Face ID", "reconhecimento facial", "Keystore", "BiometricPrompt", "Lockout"]) assert.ok(!textos.includes(proibido), proibido);
  });

  it("o segredo fica no armazenamento seguro, protegido pela biometria do SISTEMA; nada em AsyncStorage, arquivo ou log", () => {
    assert.ok(ligacao.includes("armazenamento: armazenamentoSeguro") && ligacao.includes("chaves: () => cofre.chavesAtivas()"));
    // A proteção é a do Keystore, não uma checagem solta na frente de um valor aberto.
    const protecao = ler("./armazenamento-seguro.ts");
    assert.ok(protecao.includes('from "expo-secure-store"') && protecao.includes("requireAuthentication: true") && protecao.includes("SecureStore.canUseBiometricAuthentication()"));
    assert.ok(regras.includes("armazenamento.gravar(chaves.segredoBiometria, resposta.segredo, true)") && regras.includes("armazenamento.ler(chaves.segredoBiometria, true)"));
    const codigo = (ligacao + regras + protecao + ler("./cofre-dispositivo.ts")).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const proibido of ["async-storage", "AsyncStorage", "FileSystem", "console.", "expo-local-authentication"]) assert.ok(!codigo.includes(proibido), proibido);
    // Só credencial e segredo vão ao servidor: nenhum dado biométrico, e a conta nunca é escolhida aqui.
    for (const proibido of ["usuarioId", "phoneNumber", "email", "fingerprint", "biometricData"]) assert.ok(!codigo.includes(proibido), proibido);
  });

  it("a Web continua sem biometria", () => {
    const web = (caminho: string) => readFileSync(new URL(`../../../../../web/src/features/autenticacao/${caminho}`, import.meta.url), "utf8");
    const fontesWeb = web("components/fluxo-autenticacao.tsx") + web("lib/api-pin.ts") + web("lib/textos-entrada.ts");
    for (const proibido of ["biometria/", "Entrar com biometria", "Ativar biometria", "webauthn", "PublicKeyCredential"]) assert.ok(!fontesWeb.includes(proibido), proibido);
  });
});
