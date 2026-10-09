/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { AUTORIA_DO_APP, rotuloVersao, type VersaoInstalada } from "./rotulo-versao.ts";

const base: VersaoInstalada = { versao: "0.6.0", build: "6", variante: "development", atualizadoEm: null };
const data = () => "04/10 21:30";

describe("rótulo da versão instalada", () => {
  it("development mostra o ambiente", () => {
    assert.deepEqual(rotuloVersao(base, data), { principal: "Jaaa 0.6.0 · Build 6", detalhe: null });
  });

  it("development com update OTA em execução diz quando ele foi publicado", () => {
    assert.equal(rotuloVersao({ ...base, atualizadoEm: new Date() }, data).detalhe, "Atualizado em 04/10 21:30");
  });

  it("produção não mostra ambiente nem detalhe técnico", () => {
    assert.deepEqual(rotuloVersao({ ...base, variante: "production", atualizadoEm: new Date() }, data), { principal: "Jaaa 0.6.0 · Build 6", detalhe: null });
  });

  it("binário antigo sem os módulos nativos de versão não quebra", () => {
    assert.deepEqual(rotuloVersao({ ...base, versao: null, build: null }, data), { principal: "Jaaa —", detalhe: null });
  });
});

describe("autoria e ambiente no rodapé da versão", () => {
  const data = () => "04/10 21:30";
  const dev: VersaoInstalada = { versao: "0.6.0", build: "6", variante: "development", atualizadoEm: new Date() };

  it("o texto de autoria é exatamente 'Desenvolvido por: @Junior' e aparece no rodapé", () => {
    assert.equal(AUTORIA_DO_APP, "Desenvolvido por: @Junior");
    const rodape = readFileSync(new URL("../components/ui/sobre-app.tsx", import.meta.url), "utf8");
    assert.ok(rodape.includes("{AUTORIA_DO_APP}") && rodape.includes("{rotulo.principal}"));
  });

  it("a palavra 'Development' não é mais escrita; a versão numérica continua", () => {
    for (const variante of ["development", "production"] as const) {
      const rotulo = rotuloVersao({ ...dev, variante }, data);
      assert.ok(!/development/i.test(`${rotulo.principal} ${rotulo.detalhe ?? ""}`));
      assert.ok(rotulo.principal.includes("0.6.0") && rotulo.principal.includes("Build 6"));
    }
  });
});

describe("campo de senha do login: olho de mostrar/ocultar dentro do campo", () => {
  const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");

  it("começa oculta; o olho alterna só a visibilidade — não toca no valor — e tem nome acessível", () => {
    const login = ler("../features/autenticacao/components/fluxo-login.tsx");
    assert.ok(login.includes("useState(false)") && login.includes("secureTextEntry={!mostrarSenha}"));
    const acao = login.slice(login.indexOf("acao={{"), login.indexOf("}}", login.indexOf("acao={{")));
    assert.ok(acao.includes('mostrarSenha ? "olhoFechado" : "olho"') && acao.includes('mostrarSenha ? "Ocultar senha" : "Mostrar senha"') && acao.includes("setMostrarSenha((atual) => !atual)") && !acao.includes("setSenha"));
    assert.ok(!login.includes('<Botao aparencia="discreto" rotulo={mostrarSenha'), "o botão de texto separado saiu");
  });

  it("o botão fica DENTRO do campo, à direita, sem cobrir o texto; ícones do conjunto do app", () => {
    const campo = ler("../components/ui/campo-texto.tsx");
    assert.ok(campo.includes('position: "absolute"') && campo.includes("right: 0") && campo.includes("campoComAcao: { paddingRight: ALTURA_TOQUE }") && campo.includes('accessibilityRole="button"'));
    const icones = ler("../components/ui/icone.tsx");
    assert.ok(icones.includes('olho: { ios: "eye", android: "visibility"') && icones.includes('olhoFechado: { ios: "eye.slash", android: "visibility_off"'));
  });
});

describe("marca, ícone e logos do Jaaa", () => {
  const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
  const existe = (caminho: string) => existsSync(new URL(caminho, import.meta.url));

  it("o nome exibido é Jaaa (app, versão) — os identificadores técnicos continuam os mesmos", () => {
    const variante = ler("./variante.ts");
    assert.ok(variante.includes('nome: "Jaaa Dev", pacote: "com.jaa.app.dev", scheme: "jaa-dev"') && variante.includes('nome: "Jaaa", pacote: "com.jaa.app", scheme: "jaa"'));
    assert.ok(rotuloVersao({ versao: "0.6.0", build: "6", variante: "production", atualizadoEm: null }, () => "").principal.startsWith("Jaaa 0.6.0"));
  });

  it("ícone do Android: derivados técnicos do arquivo fornecido, referenciados na configuração e existentes", () => {
    const config = ler("../../app.config.ts");
    assert.ok(config.includes('icon: "./assets/images/jaaa-icone.png"') && config.includes('foregroundImage: "./assets/images/jaaa-icone-adaptativo.png"'));
    assert.ok(!config.includes("android-icon-foreground") && !config.includes("monochromeImage"));
    for (const arquivo of ["jaaa-app-icon.png.png", "jaaa-icone.png", "jaaa-icone-adaptativo.png", "jaaa-logo-horizontal.png", "jaaa-logo-login.png", "jaaa-logo-versao.png"]) assert.ok(existe(`../../assets/images/${arquivo}`), arquivo);
  });

  it("a logo da versão aparece SÓ na área Sobre; a do login, na entrada (e no carregamento)", () => {
    const sobre = ler("../components/ui/sobre-app.tsx");
    assert.ok(sobre.includes('require("../../../assets/images/jaaa-logo-versao.png")') && sobre.includes("{AUTORIA_DO_APP}") && sobre.includes("{rotulo.principal}"));
    const entrada = ler("../features/autenticacao/components/tela-entrar.tsx");
    assert.ok(entrada.includes('require("../../../../assets/images/jaaa-logo-login.png")') && entrada.includes("aspectRatio: PROPORCAO_DA_LOGO"));
    // Versão e build ficam só no Perfil: a tela de entrada não mostra nada técnico.
    assert.ok(!entrada.includes("SobreApp"));
    assert.ok(!entrada.includes("jaaa-logo-versao"));
    assert.ok(ler("../features/perfil/components/tela-perfil.tsx").includes("<SobreApp />"));
  });

  it("login redesenhado sem perder nada: senha com olho, código, criação de conta, cadastro, erro e carregando", () => {
    const login = ler("../features/autenticacao/components/fluxo-login.tsx");
    for (const parte of ['rotulo="Usuário"', 'rotulo="Senha"', "secureTextEntry={!mostrarSenha}", 'rotulo="Entrar" larguraTotal carregando={ocupado}', 'rotulo="Entrar com código"', 'rotulo="Criar conta"', 'rotulo="Celular com DDD"', 'autoComplete="sms-otp"', 'rotulo="Concluir cadastro"', "Trocar número", '<Aviso tom="erro">']) assert.ok(login.includes(parte), parte);
    assert.ok(!login.includes(" style={{"), "sem estilo inline solto");
  });
});
