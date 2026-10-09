import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { SEM_EMAIL, emailVisivel, prepararNovoEmail, somenteDigitosDoCodigo, textosDoEmail } from "./email-da-conta.ts";

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");

describe("e-mail da conta no Perfil (Web)", () => {
  it("mostra o e-mail real; o endereço técnico do cadastro por celular nunca aparece", () => {
    assert.equal(emailVisivel(" Ana@Exemplo.com "), "ana@exemplo.com");
    for (const oculto of [null, undefined, "", "   ", "3f9a…@email-tecnico.jaa.invalid", "ABC@Email-Tecnico.Jaa.Invalid", "x@qualquer.invalid"]) assert.equal(emailVisivel(oculto), null, String(oculto));
  });

  it("conta com e-mail: endereço + Alterar e-mail; conta sem e-mail real: 'Nenhum e-mail cadastrado' + Cadastrar e-mail", () => {
    assert.deepEqual(textosDoEmail("usuario@dominio.com"), { valor: "usuario@dominio.com", acao: "Alterar e-mail", campo: "Novo e-mail" });
    assert.deepEqual(textosDoEmail(null), { valor: SEM_EMAIL, acao: "Cadastrar e-mail", campo: "E-mail" });
    assert.equal(SEM_EMAIL, "Nenhum e-mail cadastrado");
    // Conta que só tem o endereço técnico é uma conta SEM e-mail.
    assert.deepEqual(textosDoEmail(emailVisivel("abc@email-tecnico.jaa.invalid")), textosDoEmail(null));
  });

  it("o endereço novo só é enviado quando tem cara de e-mail, não é o técnico e não é o atual", () => {
    assert.deepEqual(prepararNovoEmail("  Nova@Exemplo.COM ", null), { ok: true, email: "nova@exemplo.com" });
    assert.deepEqual(prepararNovoEmail("nova@exemplo.com", "ana@exemplo.com"), { ok: true, email: "nova@exemplo.com" });
    for (const incompleto of ["", "   ", "ana", "ana@", "ana@exemplo", "a b@exemplo.com"]) assert.deepEqual(prepararNovoEmail(incompleto, null), { ok: false, mensagem: null }, incompleto);
    assert.deepEqual(prepararNovoEmail("x@email-tecnico.jaa.invalid", null), { ok: false, mensagem: "E-mail inválido." });
    assert.deepEqual(prepararNovoEmail("ANA@exemplo.com", "ana@exemplo.com"), { ok: false, mensagem: "Este já é o e-mail da sua conta." });
    assert.equal(somenteDigitosDoCodigo("12a 34-5678"), "123456");
  });
});

describe("cartão do e-mail no Perfil Web: mesmas rotas do servidor, sem fluxo paralelo", () => {
  const tela = ler("../components/formulario-email.tsx");
  const conta = ler("../components/conta-e-seguranca.tsx");

  it("fica em Perfil → Conta e segurança, ANTES da senha", () => {
    assert.ok(conta.includes('<Secao titulo="Conta e segurança"') && conta.includes("<FormularioEmail />") && conta.includes("<FormularioSenha />"));
    assert.ok(conta.indexOf("<FormularioEmail />") < conta.indexOf("<FormularioSenha />"));
    assert.ok(ler("../components/area-perfil.tsx").includes("<ContaESeguranca />"));
  });

  it("lê o e-mail pela API e só o troca depois do código enviado ao endereço NOVO — sem SMS neste fluxo", () => {
    assert.ok(ler("./api-perfil.ts").includes('requisitarApi("/conta/email", situacaoEmailContaSchema, comIdentidade())'));
    assert.ok(tela.includes("emailOtp.requestEmailChange({ newEmail: preparado.email })"));
    assert.ok(tela.includes("emailOtp.changeEmail({ newEmail: preparado.email, otp: codigo })"));
    for (const proibido of ["phoneNumber", "sendOtp", "SMS"]) assert.ok(!tela.replace(/\/\*[\s\S]*?\*\//g, "").includes(proibido), proibido);
    // O e-mail exibido só muda na confirmação — relido do servidor, e sempre pelo filtro do endereço técnico.
    const pedido = tela.slice(tela.indexOf("function pedirCodigo"), tela.indexOf("function confirmar"));
    const confirmacao = tela.slice(tela.indexOf("function confirmar"), tela.indexOf("<LinhaDaConta"));
    assert.ok(!pedido.includes("setEmailAtual"));
    assert.ok(confirmacao.indexOf("changeEmail") < confirmacao.indexOf("buscarSituacaoEmail()") && confirmacao.indexOf("buscarSituacaoEmail()") < confirmacao.indexOf("setEmailAtual"));
    assert.equal((tela.match(/setEmailAtual\(/g) ?? []).length, 3);
    assert.equal((tela.match(/setEmailAtual\(emailVisivel\(|setEmailAtual\(situacao\.ok \? emailVisivel\(|setEmailAtual\(null\)/g) ?? []).length, 3);
  });

  it("mensagens genéricas: não diz se o endereço é de outra conta nem cita fornecedor; código de 6 dígitos e 5 minutos", () => {
    assert.ok(tela.includes("Se o endereço puder ser usado, enviamos um código"));
    assert.ok(tela.includes("mensagemDeErroAutenticacao(error)") && !tela.includes("error.message"));
    for (const proibido of ["já está em uso", "já cadastrado", "pertence a outra", "Resend", "Better Auth", "email-tecnico", "console."]) assert.ok(!tela.replace(/\/\*[\s\S]*?\*\//g, "").includes(proibido), proibido);
    assert.ok(tela.includes("Ele vale por 5 minutos.") && tela.includes("maxLength={6}") && tela.includes("codigo.length !== 6"));
    const mensagens = ler("../../autenticacao/lib/mensagens-erro.ts");
    for (const codigo of ["INVALID_OTP", "OTP_EXPIRED", "INVALID_EMAIL", "FALHA_AO_ENVIAR_CODIGO", "OTP_SOLICITADO_RECENTEMENTE"]) assert.ok(mensagens.includes(codigo), codigo);
  });

  it("o texto da senha fala do código por SMS ou e-mail", () => {
    const senha = ler("../components/formulario-senha.tsx");
    assert.ok(senha.includes("Esqueceu? Você pode entrar com código por SMS ou e-mail."));
    assert.ok(!senha.includes("enviado para o seu celular"));
  });
});
