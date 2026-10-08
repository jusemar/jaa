import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { SENHA_TAMANHO_MINIMO } from "@jaa/contratos";
import { formularioEmpresaPronto } from "../../empresas/lib/minhas-empresas.ts";
import { sugerirSlug } from "../../empresas/lib/sugerir-slug.ts";
import { caminhoDoLink, linkPublico, origemDoSite } from "./link-publico.ts";
import { podeEnviarSenha } from "./senha.ts";

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");

describe("link público do próprio perfil", () => {
  it("é <site>/@usuario — a mesma regra da Web, sem id interno nem parâmetro", () => {
    assert.equal(caminhoDoLink("junior"), "/@junior");
    assert.equal(linkPublico("https://jaaa.com.br", "junior"), "https://jaaa.com.br/@junior");
    assert.equal(linkPublico("https://jaaa.com.br///", "pizzariabh"), "https://jaaa.com.br/@pizzariabh");
  });

  it("o endereço do site vem da configuração; em desenvolvimento, do computador que serve o app", () => {
    assert.equal(origemDoSite({ configurada: "https://jaaa.com.br/", emDesenvolvimento: false, hostDoBundler: null }), "https://jaaa.com.br");
    assert.equal(origemDoSite({ configurada: undefined, emDesenvolvimento: true, hostDoBundler: "192.168.0.10" }), "http://192.168.0.10:3334");
    // Configurado vence o palpite local.
    assert.equal(origemDoSite({ configurada: "https://jaaa.com.br", emDesenvolvimento: true, hostDoBundler: "192.168.0.10" }), "https://jaaa.com.br");
  });

  it("sem endereço conhecido não se inventa link (app distribuído sem a variável, ou valor inválido)", () => {
    assert.equal(origemDoSite({ configurada: undefined, emDesenvolvimento: false, hostDoBundler: "192.168.0.10" }), null);
    assert.equal(origemDoSite({ configurada: "jaaa.com.br", emDesenvolvimento: false, hostDoBundler: null }), null);
    assert.equal(origemDoSite({ configurada: "  ", emDesenvolvimento: true, hostDoBundler: null }), null);
  });
});

describe("senha da conta", () => {
  const senha = "x".repeat(SENHA_TAMANHO_MINIMO);

  it("primeira senha: basta o tamanho mínimo", () => {
    assert.equal(podeEnviarSenha({ definida: false, senha, senhaAtual: "" }), true);
    assert.equal(podeEnviarSenha({ definida: false, senha: senha.slice(1), senhaAtual: "" }), false);
  });

  it("trocar exige a senha atual preenchida", () => {
    assert.equal(podeEnviarSenha({ definida: true, senha, senhaAtual: "" }), false);
    assert.equal(podeEnviarSenha({ definida: true, senha, senhaAtual: "atual" }), true);
  });

  it("usa as rotas da conta (Better Auth), sem cabeçalho de identidade e sem autenticação paralela", () => {
    const api = ler("./api-perfil.ts");
    assert.ok(api.includes('requisitarApi("/conta/senha", situacaoSenhaSchema)'));
    assert.ok(api.includes('requisitarApi("/conta/senha", z.unknown(), { method: "POST"'));
  });
});

describe("minhas empresas", () => {
  it("o endereço da loja é sugerido pelo nome, como na Web", () => {
    assert.equal(sugerirSlug("Pizzaria São João & Cia"), "pizzaria-sao-joao-cia");
  });

  it("criar só libera com os três campos preenchidos", () => {
    assert.equal(formularioEmpresaPronto({ nome: "Pizzaria", nomeUsuario: "pizzariabh", slug: "pizzaria" }), true);
    assert.equal(formularioEmpresaPronto({ nome: "Pizzaria", nomeUsuario: " ", slug: "pizzaria" }), false);
  });

  it("criar empresa abre em branco: sem valor inicial, sem dado de outra empresa e sem preenchimento automático", () => {
    const tela = ler("../../empresas/components/minhas-empresas.tsx");
    assert.equal(/pizzaria/i.test(tela.replace(/\/\*[\s\S]*?\*\//g, "")), false);
    for (const estado of ['useState("")', "onPress={abrirFormulario}", 'setNome("");', 'setSlug("");']) assert.ok(tela.includes(estado), estado);
    assert.equal((tela.match(/\{\.\.\.SEM_PREENCHIMENTO_AUTOMATICO\}/g) ?? []).length, 3);
    assert.ok(tela.includes('placeholder="@seunegocio"') && tela.includes('placeholder="seu-negocio"'));
  });

  it("quem já criou uma empresa vê 'Criar empresa' DESATIVADO, com o limite dito abaixo, e não abre o formulário", () => {
    const tela = ler("../../empresas/components/minhas-empresas.tsx");
    assert.ok(tela.includes('<Botao rotulo="Criar empresa" aparencia="secundario" disabled={!podeCriar} onPress={abrirFormulario} />'));
    assert.ok(tela.includes("if (!podeCriar) return;"));
    assert.ok(tela.includes("{limiteAtingido && (") && tela.includes("{AVISO_LIMITE_DE_EMPRESAS}"));
    assert.ok(tela.includes("{podeCriar && criando && ("), "o formulário só existe para quem pode criar");
    // A lista e as ações da empresa existente não dependem de poder criar.
    assert.ok(tela.includes("{empresas && empresas.length > 0 && ("));
  });

  it("nada de autorização no app: abrir relê do servidor e 'agir como' só aparece para identidade operável", () => {
    const tela = ler("../../empresas/components/minhas-empresas.tsx");
    assert.ok(tela.includes("await obterEmpresa(empresa.id)"));
    assert.ok(tela.includes("operaveis.some((identidade) => identidade.identidadeId === empresa.identidadeId)"));
    assert.ok(tela.includes("await recarregarContexto()"));
  });
});

describe("Perfil no app: os recursos de conta da Web", () => {
  const tela = ler("../components/tela-perfil.tsx");

  it("link público, Perfil profissional, senha e Minhas empresas estão na tela", () => {
    for (const trecho of ['titulo="Seu link público"', "<LinkPublico nomeUsuario={perfil.nomeUsuario} />", "<TelaPerfilProfissional", "<FormularioSenha />", "<MinhasEmpresas />"]) assert.ok(tela.includes(trecho), trecho);
    assert.equal(tela.includes("ficam no Jaaa Web por enquanto"), false);
  });

  it("Perfil profissional, senha e Minhas empresas são só da pessoa (agindo como empresa não aparecem)", () => {
    assert.ok(tela.includes("if (profissionalAberto && !ehEmpresa)"));
    assert.equal((tela.match(/\{!ehEmpresa && \(/g) ?? []).length, 3);
  });

  it("o Perfil profissional do app usa as mesmas rotas da Web", () => {
    const api = ler("../../profissional/lib/api-perfil-profissional.ts");
    const web = readFileSync(new URL("../../../../../web/src/features/profissional/lib/api-perfil-profissional.ts", import.meta.url), "utf8");
    const rotas = (fonte: string) => [...fonte.matchAll(/mutar\((["`][^,)]*)/g)].map((achado) => achado[1]).sort();
    assert.deepEqual(rotas(api), rotas(web));
    assert.ok(rotas(api).length >= 12);
  });

  it("as regras de tela do Perfil profissional da Web existem todas no app (mesmos nomes)", () => {
    const web = readFileSync(new URL("../../../../../web/src/features/profissional/lib/apresentacao-perfil-profissional.ts", import.meta.url), "utf8");
    const app = ler("../../profissional/lib/apresentacao-perfil-profissional.ts");
    const exportados = (fonte: string) => [...fonte.matchAll(/^export (?:const|function|type|interface) (\w+)/gm)].map((achado) => achado[1]);
    const faltando = exportados(web).filter((nome) => !exportados(app).includes(nome));
    assert.deepEqual(faltando, []);
  });
});
