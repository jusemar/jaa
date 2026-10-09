import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { EXEMPLOS_ENTRADA, TEXTOS_ENTRADA, fraseDoDestino } from "./textos-entrada.ts";

const fonte = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");

describe("exemplos (placeholders) da entrada e do cadastro", () => {
  it("são modelos fictícios: DDD 00 (inexistente) e nomes genéricos", () => {
    assert.match(EXEMPLOS_ENTRADA.celular, /^\(00\) 00000-0000$/);
    // O campo de usuário não mostra dado de ninguém: só diz o que aceita.
    assert.equal(EXEMPLOS_ENTRADA.identificador, "@usuario, celular ou e-mail");
    assert.equal(EXEMPLOS_ENTRADA.codigo, "000000");
    assert.equal(EXEMPLOS_ENTRADA.usuario, "seunome");
    // Domínio de exemplo reservado: não é o endereço de ninguém.
    assert.equal(EXEMPLOS_ENTRADA.email, "voce@exemplo.com");
  });

  it("todo placeholder da tela vem destas constantes — nunca de conta, sessão ou resposta da API", () => {
    const tela = fonte("../components/fluxo-autenticacao.tsx");
    const placeholders = [...tela.matchAll(/placeholder=(\{[^}]*\}|"[^"]*")/g)].map((achado) => achado[1]);
    assert.ok(placeholders.length >= 5);
    for (const valor of placeholders) assert.match(valor as string, /^\{EXEMPLOS_ENTRADA\.[a-z]+\}$/, valor);
    // Nenhum número de celular ou @usuario escrito direto na tela.
    assert.ok(!/\(\d{2}\) ?9\d{4}-\d{4}/.test(tela), "sem telefone na tela");
    assert.ok(!/placeholder="/.test(tela));
  });
});

describe("textos da entrada", () => {
  it("primeira tela: dois campos e três ações, sem título, frase ou jargão", () => {
    assert.deepEqual(TEXTOS_ENTRADA.entrar, { identificador: "Usuário", senha: "Senha", acao: "Entrar", ou: "ou", comCodigo: "Entrar com código", criarConta: "Criar conta" });
    for (const removido of ["Novo no Jaaa?", "Entrar com código por SMS", "Entrar com código por e-mail", "Criar conta com celular", "Criar conta com o celular", "Criar conta com e-mail", "Continuar com telefone", "Esqueci a senha"]) {
      assert.ok(!JSON.stringify(TEXTOS_ENTRADA).includes(removido), removido);
    }
    const todos = JSON.stringify(TEXTOS_ENTRADA) + TEXTOS_ENTRADA.codigo.descricao("(00) 00000-0000");
    // "SMS" só aparece na alternativa do PIN ("Usar SMS ou e-mail"), que é como a pessoa conhece o canal.
    for (const jargao of ["OTP", "token", "autentica", "credencia"]) assert.ok(!todos.toLowerCase().includes(jargao.toLowerCase()), jargao);
  });

  it("não prometem o que o servidor não faz: nada de redefinir/recuperar senha", () => {
    const todos = JSON.stringify(TEXTOS_ENTRADA).toLowerCase();
    for (const promessa of ["redefin", "recuper", "nova senha"]) assert.ok(!todos.includes(promessa), promessa);
  });

  it("Entrar com código e Criar conta abrem a escolha do canal: SMS/Celular, E-mail e Voltar", () => {
    assert.deepEqual(TEXTOS_ENTRADA.canal, {
      codigo: { titulo: "Entrar com código", telefone: "SMS" },
      criar: { titulo: "Criar conta", telefone: "Celular" },
      email: "E-mail",
      voltar: "Voltar",
    });
    // Os dois canais contam a mesma história, com as mesmas etapas.
    assert.deepEqual(Object.keys(TEXTOS_ENTRADA.email), Object.keys(TEXTOS_ENTRADA.celular));
    assert.equal(TEXTOS_ENTRADA.codigo.descricao("voce@exemplo.com"), "Enviamos um código de 6 dígitos para voce@exemplo.com.");
    assert.equal(TEXTOS_ENTRADA.codigo.validade, "O código vale por 5 minutos.");
    assert.deepEqual(TEXTOS_ENTRADA.codigo.trocar, { telefone: "Trocar número", email: "Trocar e-mail" });
  });

  it("PIN do dispositivo: entrar, voltar para o código e criar depois do código", () => {
    const tela = fonte("../components/fluxo-autenticacao.tsx");
    assert.equal(TEXTOS_ENTRADA.pin.entrar.usarCodigo, "Usar SMS ou e-mail");
    assert.equal(TEXTOS_ENTRADA.pin.criar.agoraNao, "Agora não");
    assert.equal(EXEMPLOS_ENTRADA.pin, "000000");
    // Dispositivo autorizado → PIN na frente, com a volta para o código sempre disponível.
    assert.ok(tela.includes("await buscarSituacaoPin()") && tela.includes('comPin ? { nome: "pin" } : { nome: "entrar" }'));
    assert.ok(tela.includes("data-usar-codigo") && tela.includes("data-pin-agora-nao") && tela.includes("{pinDisponivel && ("));
    // Criar PIN só é oferecido depois de entrar com o código.
    assert.ok(tela.includes("oferecerPin.current = true;") && tela.includes('{ nome: "criar-pin", conta: conta.dados }'));
    // Campo oculto, numérico, de 6 dígitos.
    assert.ok(tela.includes('type="password"') && tela.includes('inputMode="numeric"') && tela.includes("maxLength={TAMANHO_PIN}"));
  });

  it("nenhum segredo do PIN fica ao alcance do JavaScript ou do armazenamento do navegador", () => {
    const fontes = fonte("./api-pin.ts") + fonte("../components/fluxo-autenticacao.tsx");
    for (const proibido of ["localStorage", "sessionStorage", "indexedDB", "document.cookie", "console.", "credencial:"]) assert.ok(!fontes.includes(proibido), proibido);
    // O navegador só manda o PIN digitado; a credencial vai no cookie HttpOnly, que a página não lê.
    const api = fonte("./api-pin.ts");
    assert.ok(api.includes('chamar("/pin/entrar", { pin })') && api.includes('chamar("/pin/criar", { pin, confirmacao })'));
    assert.ok(!api.includes("usuarioId") && !api.includes("phoneNumber") && !api.includes("email"));
  });

  it("a tela só oferece o e-mail quando o servidor diz que o canal existe, e não fala de fornecedor", () => {
    const tela = fonte("../components/fluxo-autenticacao.tsx");
    assert.ok(tela.includes("buscarMetodosDeEntrada") && tela.includes("{emailDisponivel && ("));
    assert.ok(tela.includes('emailOtp.sendVerificationOtp({ email, type: "sign-in" })') && tela.includes("signIn.emailOtp({ email: destino, otp: codigo })"));
    const mensagens = fonte("./mensagens-erro.ts") + JSON.stringify(TEXTOS_ENTRADA);
    for (const interno of ["Resend", "Comtele", "Better Auth", "503", "stack"]) assert.ok(!mensagens.includes(interno), interno);
  });

  it("frase de quem chegou por link é curta e diz com quem a pessoa continua", () => {
    const frase = fraseDoDestino("Pizzaria Oasis");
    assert.equal(frase, "É rápido: entre e continue com Pizzaria Oasis.");
    assert.ok(frase.length < 60);
  });
});

describe("tela inicial da Web: mesma hierarquia e mesma lógica do aplicativo", () => {
  const tela = fonte("../components/fluxo-autenticacao.tsx");
  // O trecho de cada etapa, do `{etapa.nome === "x" && (` até a etapa seguinte.
  function etapa(nome: string): string {
    const inicio = tela.indexOf(`{etapa.nome === "${nome}" && (`);
    assert.ok(inicio >= 0, `etapa ${nome} não encontrada`);
    const proxima = tela.indexOf("{etapa.nome === ", inicio + 10);
    return tela.slice(inicio, proxima === -1 ? undefined : proxima);
  }

  it("hierarquia: Usuário, Senha, [Entrar], ou, [Entrar com código], [Criar conta] — num cartão só, sem título", () => {
    const primeira = etapa("entrar");
    const ordem = ["TEXTOS_ENTRADA.entrar.identificador", "TEXTOS_ENTRADA.entrar.senha", 'type="submit"', "TEXTOS_ENTRADA.entrar.ou", "TEXTOS_ENTRADA.entrar.comCodigo", "TEXTOS_ENTRADA.entrar.criarConta"].map((parte) => primeira.indexOf(parte));
    assert.ok(ordem.every((posicao) => posicao >= 0), String(ordem));
    assert.deepEqual([...ordem].sort((a, b) => a - b), ordem, "fora de ordem");
    assert.equal((primeira.match(/<Cartao/g) ?? []).length, 1);
    assert.ok(!primeira.includes("<h2") && !primeira.includes("<p "), "sem título e sem frase");
    // Uma ação principal e duas secundárias; o 4º botão só existe em navegador já autorizado, e é discreto.
    assert.equal((primeira.match(/<Botao /g) ?? []).length, 4);
    assert.equal((primeira.match(/aparencia="secundario"/g) ?? []).length, 2);
    assert.ok(primeira.includes("{pinDisponivel && (") && primeira.includes('aparencia="discreto" data-entrar-com-pin'));
  });

  it("nada técnico na entrada: sem endereço do servidor, versão, build ou nome de fornecedor", () => {
    const fontes = tela + fonte("./textos-entrada.ts") + fonte("../../landing/components/entrada-conta.tsx");
    for (const proibido of ["URL_API", "NEXT_PUBLIC_API_URL", "localhost", "Servidor: ", "Build", "versão ", "Resend", "Comtele", "Better Auth\""]) assert.ok(!fontes.includes(proibido), proibido);
  });

  it("as duas ações abrem a MESMA etapa de escolha; sem e-mail no servidor, vai direto ao celular", () => {
    assert.ok(tela.includes('onClick={() => comecarComCodigo("codigo")}') && tela.includes('onClick={() => comecarComCodigo("criar")}'));
    assert.ok(tela.includes("irPara(emailDisponivel ? { nome: \"canal\", motivo } : { nome: \"telefone\", motivo });"));
    const escolha = etapa("canal");
    for (const parte of ["TEXTOS_ENTRADA.canal[etapa.motivo].titulo", "TEXTOS_ENTRADA.canal[etapa.motivo].telefone", "TEXTOS_ENTRADA.canal.email", "TEXTOS_ENTRADA.canal.voltar"]) assert.ok(escolha.includes(parte), parte);
    assert.ok(escolha.includes('irPara({ nome: "telefone", motivo: etapa.motivo })') && escolha.includes('irPara({ nome: "email", motivo: etapa.motivo })') && escolha.includes('irPara({ nome: "entrar" })'));
    // Escolher o canal não envia código nenhum.
    for (const proibido of ["sendOtp", "sendVerificationOtp", "solicitarCodigo"]) assert.ok(!escolha.includes(proibido), proibido);
    // A página /cadastro começa nessa mesma escolha.
    assert.ok(tela.includes('iniciarCadastro ? { nome: "canal", motivo: "criar" }'));
  });

  it("nenhum fluxo novo: celular e e-mail seguem pelas mesmas etapas e pelas mesmas chamadas", () => {
    assert.equal((tela.match(/phoneNumber\.sendOtp\(/g) ?? []).length, 1);
    assert.equal((tela.match(/emailOtp\.sendVerificationOtp\(/g) ?? []).length, 1);
    assert.equal((tela.match(/phoneNumber\.verify\(/g) ?? []).length, 1);
    assert.equal((tela.match(/signIn\.emailOtp\(/g) ?? []).length, 1);
    assert.ok(tela.includes("entrarComSenha(") && etapa("telefone").includes("solicitarCodigo(etapa.motivo, evento)") && etapa("email").includes("solicitarCodigoPorEmail(etapa.motivo, evento)"));
  });

  it("PIN: criar só depois do CÓDIGO e só se o navegador ainda não tiver um; entrar com senha nunca oferece", () => {
    // A marca de "entrou pelo código" só é ligada na confirmação do código.
    assert.equal((tela.match(/oferecerPin\.current = true;/g) ?? []).length, 1);
    const confirmacaoDoCodigo = tela.slice(tela.indexOf("function verificarCodigo"), tela.indexOf("function entrarPeloPin"));
    assert.ok(confirmacaoDoCodigo.includes("oferecerPin.current = true;"));
    const entradaComSenha = tela.slice(tela.indexOf("function entrar("), tela.indexOf("function solicitarCodigo"));
    assert.ok(!entradaComSenha.includes("oferecerPin"));
    assert.ok(tela.includes("const criarAgora = oferecerPin.current && !navegadorComPin.current;"));
    // Navegador autorizado começa pelo PIN, com a volta para o código sempre disponível.
    assert.ok(etapa("pin").includes("data-usar-codigo") && etapa("pin").includes("TEXTOS_ENTRADA.pin.entrar.usarCodigo"));
  });

  it("a Web continua sem biometria", () => {
    // Só o CÓDIGO conta (os comentários explicam justamente que a Web não tem biometria).
    const codigo = (tela + fonte("./api-pin.ts") + fonte("./textos-entrada.ts")).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const proibido of ["biometria", "Biometria", "webauthn", "PublicKeyCredential"]) assert.ok(!codigo.includes(proibido), proibido);
  });
});
