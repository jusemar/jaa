import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { SEM_EMAIL, emailVisivel, prepararNovoEmail, somenteDigitosDoCodigo, textosDoEmail } from "./email-da-conta.ts";

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");

describe("e-mail da conta no Perfil", () => {
  it("mostra o e-mail real; o endereço técnico do cadastro por celular nunca aparece", () => {
    assert.equal(emailVisivel(" Ana@Exemplo.com "), "ana@exemplo.com");
    for (const oculto of [null, undefined, "", "   ", "3f9a…@email-tecnico.jaa.invalid", "ABC@Email-Tecnico.Jaa.Invalid", "x@qualquer.invalid"]) assert.equal(emailVisivel(oculto), null, String(oculto));
  });

  it("conta só com telefone: campo sem e-mail e ação de cadastrar; conta com e-mail: endereço e ação de alterar", () => {
    assert.deepEqual(textosDoEmail(null), { valor: SEM_EMAIL, acao: "Cadastrar e-mail", campo: "E-mail" });
    assert.deepEqual(textosDoEmail("ana@exemplo.com"), { valor: "ana@exemplo.com", acao: "Alterar e-mail", campo: "Novo e-mail" });
    assert.equal(SEM_EMAIL, "Nenhum e-mail cadastrado");
  });

  it("o endereço novo só é enviado quando tem cara de e-mail, não é o técnico e não é o atual", () => {
    assert.deepEqual(prepararNovoEmail("  Nova@Exemplo.COM ", null), { ok: true, email: "nova@exemplo.com" });
    assert.deepEqual(prepararNovoEmail("nova@exemplo.com", "ana@exemplo.com"), { ok: true, email: "nova@exemplo.com" });
    // Incompleto enquanto a pessoa digita: sem mensagem de erro.
    for (const incompleto of ["", "   ", "ana", "ana@", "ana@exemplo", "a b@exemplo.com"]) assert.deepEqual(prepararNovoEmail(incompleto, null), { ok: false, mensagem: null }, incompleto);
    assert.deepEqual(prepararNovoEmail("x@email-tecnico.jaa.invalid", null), { ok: false, mensagem: "E-mail inválido." });
    assert.deepEqual(prepararNovoEmail("ANA@exemplo.com", "ana@exemplo.com"), { ok: false, mensagem: "Este já é o e-mail da sua conta." });
  });

  it("o código tem 6 números", () => {
    assert.equal(somenteDigitosDoCodigo("12a 34-5678"), "123456");
  });
});

describe("tela do e-mail: mesmas rotas do servidor, sem fluxo paralelo", () => {
  const tela = ler("../components/formulario-email.tsx");
  const perfil = ler("../components/tela-perfil.tsx");

  it("está no Perfil, na seção Conta, ao lado da senha, sem tirar nada do que havia", () => {
    assert.ok(perfil.includes("<FormularioEmail />") && perfil.includes("<FormularioSenha />"));
    assert.ok(perfil.indexOf("<FormularioEmail />") < perfil.indexOf("<FormularioSenha />"));
    for (const secao of ['"Meu perfil"', 'titulo="Seu link público"', 'titulo="Status"', 'titulo="Privacidade"', 'titulo="Perfil profissional"', 'titulo="Conta e segurança"', 'titulo="Minhas empresas"']) assert.ok(perfil.includes(secao), secao);
  });

  it("lê o e-mail da conta pela API e troca só depois do código enviado ao endereço NOVO", () => {
    assert.ok(ler("./api-perfil.ts").includes('requisitarApi("/conta/email", situacaoEmailContaSchema)'));
    assert.ok(tela.includes("emailOtp.requestEmailChange({ newEmail: preparado.email })"));
    assert.ok(tela.includes("emailOtp.changeEmail({ newEmail: preparado.email, otp: codigo })"));
    // O e-mail exibido só muda depois da confirmação — e é relido do servidor.
    const confirmar = tela.slice(tela.indexOf("const confirmar"), tela.indexOf("<Cartao"));
    assert.ok(confirmar.indexOf("changeEmail") < confirmar.indexOf("setEmailAtual"));
    assert.ok(!tela.slice(tela.indexOf("const pedirCodigo"), tela.indexOf("const confirmar")).includes("setEmailAtual"));
    // Passa sempre pelo filtro que esconde o endereço técnico.
    assert.equal((tela.match(/setEmailAtual\(/g) ?? []).length, 3);
    assert.equal((tela.match(/setEmailAtual\(emailVisivel\(|setEmailAtual\(situacao\.ok \? emailVisivel\(|setEmailAtual\(null\)/g) ?? []).length, 3);
  });

  it("mensagens genéricas: a tela não diz se o endereço já é de outra conta, nem cita fornecedor", () => {
    assert.ok(tela.includes("Se o endereço puder ser usado, enviamos um código"));
    assert.ok(tela.includes("mensagemDoCodigo(error)") && !tela.includes("error.message"));
    for (const proibido of ["já está em uso", "já cadastrado", "pertence a outra", "Resend", "email-tecnico", "console."]) assert.ok(!tela.includes(proibido), proibido);
    assert.ok(tela.includes("Ele vale por 5 minutos.") && tela.includes("maxLength={6}"));
  });
});

describe("tela de entrada do app sem as duas frases", () => {
  const entrada = ler("../../autenticacao/components/tela-entrar.tsx");
  const login = ler("../../autenticacao/components/fluxo-login.tsx");

  it("a logo continua igual, sem frase embaixo e sem espaço reservado para ela", () => {
    assert.ok(entrada.includes('require("../../../../assets/images/jaaa-logo-login.png")') && entrada.includes("aspectRatio: PROPORCAO_DA_LOGO, maxWidth: 264"));
    for (const removido of ["Suas conversas", "do seu jeito", "estilos.frase", "<Texto"]) assert.ok(!entrada.includes(removido), removido);
    assert.ok(entrada.includes('marca: { alignItems: "center" }'));
  });

  it("a primeira tela não tem título nem frase de apoio; as outras etapas mantêm os delas", () => {
    assert.ok(login.includes("senha: { titulo: null, apoio: null }"));
    for (const removido of ["Use seu @usuario", "celular ou e-mail e a sua senha", "celular ou email e a sua senha"]) assert.ok(!login.includes(removido), removido);
    // Sem título e sem frase, o cabeçalho nem é desenhado (não sobra espaço vazio acima dos campos).
    assert.ok(login.includes("{(titulo || apoio) && ("));
    assert.ok(login.includes('codigo: { titulo: "Código de verificação"') && login.includes('pin: { titulo: "Entrar com PIN"'));
    // Os campos e o botão principal da entrada seguem todos lá.
    for (const parte of ['rotulo="Usuário"', 'rotulo="Senha"', 'rotulo="Entrar" larguraTotal']) assert.ok(login.includes(parte), parte);
  });
});
