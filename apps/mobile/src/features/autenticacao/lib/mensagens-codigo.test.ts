import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { mensagemDoCodigo } from "./mensagens-codigo.ts";

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");

describe("mensagens do código (celular ou e-mail)", () => {
  it("traduzem os códigos do servidor em frases simples", () => {
    assert.equal(mensagemDoCodigo({ status: 400, code: "INVALID_OTP", message: "Invalid OTP" }), "Código incorreto.");
    assert.equal(mensagemDoCodigo({ status: 400, code: "INVALID_EMAIL" }), "E-mail inválido.");
    assert.equal(mensagemDoCodigo({ status: 503, code: "FALHA_AO_ENVIAR_CODIGO" }), "Não foi possível enviar o código. Tente novamente.");
    assert.equal(mensagemDoCodigo({ status: 429, code: "OTP_SOLICITADO_RECENTEMENTE" }), "Aguarde um minuto antes de pedir um novo código.");
    assert.equal(mensagemDoCodigo({ status: 403, code: "TOO_MANY_ATTEMPTS" }), "Muitas tentativas. Peça um novo código.");
  });

  it("erro desconhecido, limite e falta de rede têm texto próprio — nunca o texto técnico recebido", () => {
    assert.equal(mensagemDoCodigo({ status: 500, message: "Resend respondeu 500. stack: ..." }), "Não foi possível concluir. Tente novamente.");
    assert.equal(mensagemDoCodigo({ status: 429, message: "Too many requests" }), "Muitas solicitações. Tente novamente em instantes.");
    assert.equal(mensagemDoCodigo(undefined), "Sem conexão com o Jaaa.");
  });

  it("nenhuma frase fala de fornecedor, de conta existente ou de detalhe interno", () => {
    const fonte = ler("./mensagens-codigo.ts").split("const MENSAGENS")[1] ?? "";
    for (const interno of ["Resend", "Comtele", "Better Auth", "já existe", "cadastrad", "stack"]) assert.ok(!fonte.includes(interno), interno);
  });
});

describe("tela de entrada do app: telefone OU e-mail", () => {
  const tela = ler("../components/fluxo-login.tsx");

  it("o e-mail só é oferecido quando o servidor diz que o canal existe", () => {
    assert.ok(tela.includes("buscarMetodosDeEntrada()"));
    // Com e-mail ligado, a pessoa escolhe o canal; sem ele, vai direto ao celular (não há o que escolher).
    assert.ok(tela.includes('trocarModo(emailDisponivel ? "escolherCanal" : "telefone")'));
    assert.ok(tela.includes('{emailDisponivel && <Botao aparencia="secundario" larguraTotal rotulo="Usar e-mail"'));
    for (const parte of ['rotulo="Entrar com código"', 'rotulo="Criar conta"', 'rotulo="E-mail"']) assert.ok(tela.includes(parte), parte);
  });

  it("usa os mesmos contratos da Web: pedido de código e confirmação pelo Better Auth", () => {
    assert.ok(tela.includes('emailOtp.sendVerificationOtp({ email: emailLimpo, type: "sign-in" })'));
    assert.ok(tela.includes("signIn.emailOtp({ email: emailLimpo, otp: codigo.trim() })"));
    assert.ok(tela.includes("phoneNumber.sendOtp({ phoneNumber: telefone })") && tela.includes("phoneNumber.verify({ phoneNumber: telefone, code: codigo.trim() })"));
    // As falhas passam pelo tradutor: o texto cru do servidor não vai para a tela.
    assert.ok(!tela.includes("error.message"));
  });
});

describe("PIN do dispositivo no app", () => {
  const tela = ler("../components/fluxo-login.tsx");
  const pin = ler("./pin-dispositivo.ts");

  it("aparelho autorizado entra com PIN, com a volta para o código sempre disponível; criar só depois do código", () => {
    for (const parte of ['rotulo="Entrar com PIN"', 'rotulo="Usar SMS ou e-mail"', 'rotulo="Criar PIN"', 'rotulo="Confirmar PIN"', 'rotulo="Agora não"', "dispositivoTemPin()", "setEntrouPorCodigo(true)"]) assert.ok(tela.includes(parte), parte);
    // Campo numérico, oculto, de 6 dígitos — e o PIN é apagado depois de usado.
    assert.ok(tela.includes("secureTextEntry") && tela.includes("maxLength={TAMANHO_PIN}") && tela.includes('setPin("")'));
    assert.equal(mensagemDoCodigo({ status: 401, code: "PIN_NAO_ACEITO" }), "Não foi possível entrar com o PIN. Confira o PIN ou use SMS ou e-mail.");
    assert.equal(mensagemDoCodigo({ status: 429, code: "PIN_BLOQUEADO" }), "Muitas tentativas. Aguarde alguns minutos ou use SMS ou e-mail.");
  });

  it("a credencial do aparelho fica só no armazenamento seguro — nunca em AsyncStorage, arquivo ou log", () => {
    // O PIN grava só pelo cofre, e o cofre só fala com o armazenamento seguro do sistema.
    assert.ok(pin.includes('from "./armazenamento-seguro"') && pin.includes("cofre.guardarCredencial(contaId, criado.data.credencial)") && pin.includes("cofre.esquecerConta(contaId)"));
    assert.ok(ler("./armazenamento-seguro.ts").includes('from "expo-secure-store"'));
    const codigo = (pin + ler("./armazenamento-seguro.ts") + ler("./cofre-dispositivo.ts")).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const proibido of ["async-storage", "AsyncStorage", "FileSystem", "console.", "setItem("]) assert.ok(!(codigo + tela).includes(proibido), proibido);
    // Só PIN e credencial vão para o servidor: quem é a conta nunca é escolhido pelo aparelho.
    assert.ok(pin.includes('chamar("/pin/entrar", { pin, credencial })'));
    for (const proibido of ["usuarioId", "phoneNumber", "email"]) assert.ok(!codigo.includes(proibido), proibido);
  });

  it("o PIN nunca é guardado no aparelho: nem em claro, nem protegido pela biometria", () => {
    // O que o aparelho grava: a credencial do dispositivo, o segredo da biometria, duas marcas e a conta ativa.
    const fontes = pin + ler("./biometria-dispositivo.ts") + ler("./biometria.ts") + ler("./cofre-dispositivo.ts") + ler("./armazenamento-seguro.ts");
    const gravacoes = [...fontes.matchAll(/armazenamento\.gravar\(([^,)]+)/g)].map((achado) => achado[1]).sort();
    assert.deepEqual(gravacoes, ["CHAVE_CONTA_ATIVA", "chaves.biometriaAtiva", "chaves.credencial", "chaves.ofertaRecusada", "chaves.segredoBiometria"]);
    assert.ok(!/gravar\([^)]*\bpin\b/.test(fontes) && !/setItemAsync\([^)]*\bpin\b/.test(fontes));
  });

  it("revogar o dispositivo ou recriar o PIN também apaga a biometria deste aparelho", () => {
    // Revogada pelo servidor ou removida pela pessoa: tudo o que é DAQUELA conta sai do aparelho.
    assert.equal((pin.match(/await cofre\.esquecerConta\(contaId\);/g) ?? []).length, 2);
    // PIN novo: só a biometria (da mesma conta) é apagada; a credencial nova entra no lugar.
    assert.ok(pin.includes("await cofre.esquecerBiometriaDe(contaId);"));
  });
});
