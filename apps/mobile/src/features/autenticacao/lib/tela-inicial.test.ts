import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");

const login = ler("../components/fluxo-login.tsx");
const entrada = ler("../components/tela-entrar.tsx");

// O trecho de cada etapa na tela, do `{etapa === "x" && (` até a etapa seguinte.
function etapa(nome: string): string {
  const inicio = login.indexOf(`{etapa === "${nome}" && (`);
  assert.ok(inicio >= 0, `etapa ${nome} não encontrada`);
  const proxima = login.indexOf("{etapa === ", inicio + 10);
  return login.slice(inicio, proxima === -1 ? undefined : proxima);
}
const rotulos = (trecho: string) => [...trecho.matchAll(/rotulo=(?:"([^"]+)"|\{([^}]+)\})/g)].map((achado) => achado[1] ?? achado[2]);

describe("primeira tela da entrada: logo, dois campos e três ações", () => {
  const primeira = etapa("senha");

  it("hierarquia: Usuário, Senha, [Entrar], ou, [Entrar com código], [Criar conta]", () => {
    const ordem = ['rotulo="Usuário"', 'rotulo="Senha"', 'rotulo="Entrar" larguraTotal', "<Divisor />", 'rotulo="Entrar com código"', 'rotulo="Criar conta"'].map((parte) => primeira.indexOf(parte));
    assert.ok(ordem.every((posicao) => posicao >= 0), String(ordem));
    assert.deepEqual([...ordem].sort((a, b) => a - b), ordem, "fora de ordem");
    // O campo de usuário continua aceitando @usuario, celular ou e-mail.
    assert.ok(primeira.includes('placeholder="@usuario, celular ou e-mail"'));
    // Uma ação principal e duas secundárias — e nada além disso para quem está num aparelho comum.
    assert.equal((primeira.match(/<Botao /g) ?? []).length, 4);
    assert.equal((primeira.match(/aparencia="secundario"/g) ?? []).length, 2);
    // O 4º botão só existe em aparelho já autorizado (volta para PIN/biometria), e é discreto.
    assert.ok(primeira.includes("{(biometriaAtiva || pinDisponivel) && ("));
  });

  it("sem título, sem frases e sem as ações repetidas de antes", () => {
    assert.ok(login.includes("senha: { titulo: null, apoio: null }"));
    for (const removido of ["Novo no Jaaa?", "Entrar com código por SMS", "Entrar com código por e-mail", "Criar conta com o celular", "Criar conta com o e-mail", "Suas conversas"]) {
      assert.ok(!login.includes(removido) && !entrada.includes(removido), removido);
    }
  });

  it("nada técnico na entrada: sem endereço do servidor, sem versão/build e sem tela de diagnóstico", () => {
    for (const fonte of [login, entrada]) {
      for (const proibido of ["URL_API", "Servidor: {", "__DEV__", "SobreApp", "rotuloVersao", "Build", "diagnostico", "http://", "https://"]) assert.ok(!fonte.includes(proibido), proibido);
    }
    // A falha de conexão também não mostra o endereço; ele só aparece no diagnóstico de desenvolvimento.
    assert.ok(!ler("../../conta/components/portao-sessao.tsx").includes("URL_API"));
    assert.ok(ler("../../conta/components/diagnostico-contexto.tsx").includes("Servidor: {URL_API}"));
    assert.ok(ler("../../perfil/components/tela-perfil.tsx").includes('{__DEV__ && <Botao aparencia="secundario" rotulo="Diagnóstico do contexto (desenvolvimento)"'));
    // Versão e build continuam existindo — no Perfil.
    assert.ok(ler("../../perfil/components/tela-perfil.tsx").includes("<SobreApp />"));
  });

  it("a engrenagem do build de desenvolvimento vem desligada por padrão (o menu segue acessível por gesto)", () => {
    assert.ok(ler("../../../../app.config.ts").includes('["expo-dev-client", { toolsButton: false }]'));
  });
});

describe("Entrar com código e Criar conta: uma escolha de canal, depois os fluxos de sempre", () => {
  const escolha = etapa("escolherCanal");

  it("as duas ações abrem a MESMA etapa de escolha; o que muda é só o título e o nome do primeiro canal", () => {
    assert.ok(login.includes('onPress={() => comecarComCodigo("codigo")}') && login.includes('onPress={() => comecarComCodigo("criar")}'));
    assert.ok(login.includes('const TITULO_DO_PROPOSITO: Record<Proposito, string> = { codigo: "Entrar com código", criar: "Criar conta" };'));
    // Entrar com código → SMS / E-mail; Criar conta → Celular / E-mail.
    assert.deepEqual(rotulos(escolha), ['proposito === "criar" ? "Celular" : "SMS"', "E-mail", "Voltar"]);
    assert.ok(escolha.includes('onPress={() => trocarModo("telefone")}') && escolha.includes('onPress={() => trocarModo("email")}') && escolha.includes('onPress={() => trocarModo("senha")}'));
  });

  it("nenhum fluxo novo: celular e e-mail seguem pelas mesmas etapas e pelas mesmas chamadas", () => {
    assert.ok(etapa("telefone").includes("onPress={pedirCodigo}") && etapa("email").includes("onPress={pedirCodigoPorEmail}"));
    assert.equal((login.match(/phoneNumber\.sendOtp\(/g) ?? []).length, 1);
    assert.equal((login.match(/emailOtp\.sendVerificationOtp\(/g) ?? []).length, 1);
    assert.equal((login.match(/phoneNumber\.verify\(/g) ?? []).length, 1);
    assert.equal((login.match(/signIn\.emailOtp\(/g) ?? []).length, 1);
    // Pedir o código só acontece por toque em "Continuar" — escolher o canal não envia nada.
    for (const proibido of ["sendOtp", "sendVerificationOtp", "pedirCodigo"]) assert.ok(!escolha.includes(proibido), proibido);
    // Dá para voltar à primeira tela de qualquer etapa do código.
    for (const nome of ["telefone", "email"]) assert.ok(etapa(nome).includes('rotulo="Voltar"'), nome);
  });

  it("senha, PIN, biometria e conta ativa do aparelho continuam ligados como antes", () => {
    for (const parte of ["entrarComSenha(identificador, senha)", "entrarComPin(pin)", "biometria.entrar()", "biometria.ativar()", "criarPin(contaId, pin, confirmacaoPin)", "usarContaNoAparelho(conta.identidadePessoal?.id)", 'rotulo="Usar SMS ou e-mail"', 'rotulo="Usar PIN"']) {
      assert.ok(login.includes(parte), parte);
    }
    for (const nome of ["pin", "criarPin", "biometria", "ativarBiometria", "codigo", "cadastro"]) assert.ok(etapa(nome).length > 0, nome);
  });
});
