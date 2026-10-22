import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { VisitanteAtual } from "@jaa/contratos";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AreaEmpresas } from "../../features/empresas/components/area-empresas.tsx";
import { AreaPerfil } from "../../features/perfil/components/area-perfil.tsx";
import { EntradaPerfilProfissional } from "../../features/profissional/components/entrada-perfil-profissional.tsx";
import { AREAS_PESSOAIS, areasDaIdentidade } from "./areas.ts";
import { MensageiroTecnico } from "../../features/conversas/components/mensageiro-tecnico.tsx";
import { NavegacaoApp } from "./navegacao-app.tsx";
import { ProvedorCapacidades, type CapacidadesSessao } from "./capacidades-sessao.tsx";
import { exigeConta } from "../../lib/conta-necessaria.ts";
import { identidadeDoVisitante } from "../../features/identidades/hooks/use-identidade-ativa.ts";

/*
 * VISITANTE NO APP PRINCIPAL: quem chega pelo Link do Jaa sem conta usa o MESMO AppJaa (navegação,
 * pesquisa, conversas, Perfil, Empresas, Perfil profissional). O que exige conta continua À VISTA e,
 * ao ser usado, pede "Criar conta / Entrar". O servidor continua sendo quem recusa (CONTA_NECESSARIA).
 */
const fonte = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const texto = (marcacao: string) => marcacao.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const visitante: VisitanteAtual = {
  identidadeId: "bbbbbbbb-0000-4000-8000-000000000001",
  nomeExibicao: "Maria",
  expiraEm: "2026-10-16T12:00:00.000Z",
};
const capacidadesVisitante: CapacidadesSessao = { visitante: true, exigirConta: () => {}, criarConta: () => {}, entrar: () => {} };
const comoVisitante = (filho: ReactNode) => renderToStaticMarkup(createElement(ProvedorCapacidades, { value: capacidadesVisitante }, filho));

describe("visitante no shell principal do Jaaa", () => {
  /*
   * O AppJaa inteiro não renderiza no Node (o Toaster vem com outra cópia do React do monorepo); as
   * PEÇAS do shell — navegação e mensageiro — renderizam como o visitante as recebe, e a montagem do
   * AppJaa é conferida na fonte.
   */
  const areas = areasDaIdentidade(identidadeDoVisitante(visitante), { visitante: true });
  const navegacao = renderToStaticMarkup(createElement(NavegacaoApp, { areas, areaAtiva: "conversas", aoAbrir: () => {} }));
  const mensageiro = comoVisitante(
    createElement(MensageiroTecnico, { identidadeId: visitante.identidadeId, pessoa: { ...identidadeDoVisitante(visitante) } }),
  );
  const app = fonte("./app-jaa.tsx");

  it("abre o MESMO AppJaa: navegação principal, Pesquisar e o mensageiro (lista + conversa)", () => {
    assert.ok(navegacao.includes('aria-label="Navegação principal"'));
    assert.ok(mensageiro.includes('aria-label="Mensageiro"'), "conversa dentro do shell, não numa tela à parte");
    assert.ok(mensageiro.includes('placeholder="Pesquisar no Jaaa"'), "o campo Pesquisar está lá");
    assert.ok(mensageiro.includes('aria-label="Filtrar conversas"'), "a mesma lista de conversas");
    // O AppJaa é um só: o visitante entra nele com as capacidades da sessão.
    assert.ok(app.includes("useIdentidadeAtiva(identidadePessoalId, visitante)") && app.includes("<ProvedorCapacidades value={capacidades}>"));
    assert.ok(app.includes("<MensageiroTecnico"));
  });

  it("vê Conversas, Contatos (com a Pesquisa) e Perfil; Entregas é capacidade de conta", () => {
    assert.deepEqual(
      areas.map((area) => area.id),
      ["conversas", "contatos", "perfil"],
    );
    for (const area of areas) assert.ok(navegacao.includes(`data-area="${area.id}"`), area.id);
    assert.ok(!navegacao.includes('data-area="entregas"'));
    // Quem tem conta continua vendo a navegação pessoal inteira.
    assert.deepEqual(areasDaIdentidade(identidadeDoVisitante(visitante)), AREAS_PESSOAIS);
    assert.ok(app.includes("areasDaIdentidade(identidades.ativa, { visitante: visitante !== null })"));
  });

  it("Criar conta / Entrar à vista, sem 'Sair' de uma conta que não existe", () => {
    assert.ok(app.includes("data-faixa-visitante") && app.includes("data-visitante-criar-conta") && app.includes("data-visitante-entrar"));
    assert.ok(app.includes("Sem conta, suas conversas expiram após 24 h sem uso."));
    assert.ok(app.includes("const sair = visitante ? null : ("));
    assert.ok(app.includes("data-menu-criar-conta") && app.includes("data-menu-entrar"));
  });

  it("nenhum @usuario técnico do visitante aparece", () => {
    assert.equal(identidadeDoVisitante(visitante).nomeUsuario, "", "o técnico nunca chega ao cliente");
    assert.ok(!mensageiro.includes("visitante_") && !/>@</.test(mensageiro));
    assert.ok(texto(mensageiro).includes("Visitante · sem conta"));
    assert.ok(fonte("../../features/identidades/components/seletor-identidade.tsx").includes('"Visitante · sem conta"'));
  });
});

describe("Perfil, Empresas e Perfil profissional para o visitante: VER ≠ ALTERAR", () => {
  it("Perfil: as mesmas abas (inclusive Perfil profissional e Minhas empresas), com o nome dele e sem @usuario", () => {
    const perfil = comoVisitante(createElement(AreaPerfil, { ehEmpresa: false, visitante, empresas: createElement("p", null, "EMPRESAS") }));
    for (const aba of ["Perfil", "Privacidade", "Conta e segurança", "Perfil profissional", "Minhas empresas"]) assert.ok(texto(perfil).includes(aba), aba);
    assert.ok(perfil.includes('value="Maria"'), "o nome que ele já tem");
    assert.ok(perfil.includes("Escolhido ao criar sua conta"));
    assert.ok(!perfil.includes("visitante_") && !perfil.includes('value="@"'));
    // O Link do Jaaa é recurso de conta: aparece como tal.
    assert.ok(perfil.includes("data-recurso-com-conta") && texto(perfil).includes("Seu Link do Jaaa"));
    // Nenhum status aparece como escolhido: o visitante não tem um.
    assert.ok(!perfil.includes('aria-checked="true"'));
  });

  it("alterar o perfil (salvar, foto, status, privacidade) pede conta ANTES de chamar a API", () => {
    const tela = fonte("../../features/perfil/components/area-perfil.tsx");
    assert.ok(/if \(ehVisitante\) \{\s*exigirConta\(\);\s*return;\s*\}\s*\/\/ Um envio por vez/.test(tela), "salvar perfil");
    assert.ok(/function mudarPrivacidade[^{]*\{\s*if \(ehVisitante\) \{\s*exigirConta\(\);/.test(tela), "status e privacidade");
    assert.ok(tela.includes("visitante ? exigirConta() : entrada.current?.click()"), "foto");
    assert.ok(tela.includes("if (ehVisitante) return;"), "o perfil do visitante não é pedido ao servidor");
    // Conta e segurança: a aba existe e explica que é a conta que resolve.
    assert.ok(fonte("../../features/perfil/components/conta-e-seguranca.tsx").includes('titulo="Sua conta no Jaaa"'));
  });

  it("Empresas: a área aparece; 'Criar empresa' exige conta", () => {
    const area = comoVisitante(createElement(AreaEmpresas, { aoEmpresaCriada: () => {} }));
    assert.ok(area.includes('aria-label="Minhas empresas"') && area.includes("data-criar-empresa"));
    assert.ok(!/data-criar-empresa=""[^>]*disabled/.test(area), "o botão não fica morto: tocar explica");
    assert.ok(fonte("../../features/empresas/components/area-empresas.tsx").includes('if (visitante) exigirConta("Para criar uma empresa, você precisa de uma conta no Jaaa.");'));
  });

  it("Perfil profissional: a entrada aparece; ativar exige conta", () => {
    const entrada = comoVisitante(createElement(EntradaPerfilProfissional, { aoAbrir: () => {} }));
    assert.ok(entrada.includes("data-ativar-perfil-profissional") && texto(entrada).includes("Ativar perfil profissional"));
    assert.ok(fonte("../../features/profissional/components/entrada-perfil-profissional.tsx").includes("onClick={visitante ? () => exigirConta("));
  });

  it("Entregas não abre para o visitante; Contatos existe e explica que a agenda é recurso de conta", () => {
    const app = fonte("./app-jaa.tsx");
    assert.ok(app.includes('areaAtiva === "entregas" && !visitante && <AreaMinhasEntregas'));
    const contatos = fonte("../../features/contatos/components/area-contatos.tsx");
    assert.ok(contatos.includes('titulo="Sua agenda no Jaaa"') && contatos.includes("if (visitante) return;"));
    // Pesquisar continua; SALVAR contato pede conta.
    assert.ok(fonte("../../features/contatos/components/pesquisa-jaa.tsx").includes('exigirConta("Para salvar contatos, você precisa de uma conta no Jaaa.")'));
  });
});

describe("ações que exigem conta: o servidor decide, o app explica", () => {
  it("toda AÇÃO recusada com CONTA_NECESSARIA (ou 6ª conversa) abre 'Criar conta / Entrar'; leitura não", () => {
    assert.ok(exigeConta("CONTA_NECESSARIA") && exigeConta("LIMITE_DE_CONVERSAS_ATINGIDO"));
    assert.ok(!exigeConta("NAO_AUTENTICADO") && !exigeConta(null));
    const api = fonte("../../lib/api.ts");
    assert.equal((api.match(/avisarSeExigirConta\(/g) ?? []).length, 2, "requisição comum e multipart");
    const sinal = fonte("../../lib/conta-necessaria.ts");
    assert.ok(sinal.includes('(metodo ?? "GET").toUpperCase() !== "GET"'));
    const app = fonte("./app-jaa.tsx");
    assert.ok(app.includes("ouvirContaNecessaria((motivo) => setContaPedida(motivo))"));
    assert.ok(app.includes("titulo={TITULO_CONTA_NECESSARIA}") && app.includes("data-conta-pedida-criar") && app.includes("data-conta-pedida-entrar"));
  });

  it("6ª conversa nova (pela pesquisa ou por link): a janela de conta, não um erro solto", () => {
    const mensageiro = fonte("../../features/conversas/components/mensageiro-tecnico.tsx");
    assert.ok(mensageiro.includes("if (!exigeConta(aberta.codigo)) setErro(aberta.mensagem);"));
  });

  it("pedido: o cardápio continua à vista e 'adicionar' explica que precisa de conta (sem carrinho de visitante)", () => {
    const mensageiro = fonte("../../features/conversas/components/mensageiro-tecnico.tsx");
    assert.ok(mensageiro.includes("capacidades.visitante ? { aoExigirConta: capacidades.exigirConta } : {}"));
    const conversa = fonte("../../features/conversas/components/conversa-tecnica.tsx");
    assert.ok(/!aoExigirConta &&/.test(conversa));
    assert.ok(conversa.includes("Para fazer um pedido, você precisa de uma conta no Jaaa."));
  });
});

describe("entrada pelo link e conversão em conta", () => {
  const fluxo = fonte("../../features/autenticacao/components/fluxo-autenticacao.tsx");

  it("/@usuario sem sessão: cria o visitante sozinho e abre o AppJaa já na conversa do link", () => {
    assert.ok(fluxo.includes("if (!conta.ok && linkDeDestino) {"));
    assert.ok(fluxo.includes("let falha = conta.status === 401 ? null : conta;") && fluxo.includes("const criado = await entrarComoVisitante();"));
    assert.ok(!/Conversar sem criar conta|ComecarComoVisitante|data-comecar-visitante|ConversaDoVisitante/.test(fluxo));
    // O app (de conta ou de visitante) recebe o destino do link: a conversa abre dentro dele.
    assert.ok(/<AppJaa\s+conta=\{contaDoApp\}[\s\S]*destinoInicial=\{destino\}/.test(fluxo));
  });

  it("Criar conta / Entrar abrem POR CIMA do app (mesma árvore): ao concluir, o mesmo app ganha capacidades", () => {
    assert.ok(fluxo.includes('const contaDoApp = etapa.nome === "autenticado" ? etapa.conta : etapa.nome !== "carregando" ? contaVisitante : null;'));
    assert.ok(fluxo.includes("<Janela") && fluxo.includes("{entrada}"));
    // Depois do código a conta já existe: cadastro/PIN não voltam ao visitante.
    assert.ok(fluxo.includes('const podeVoltar = etapa.nome !== "cadastro" && etapa.nome !== "criar-pin";'));
    assert.ok(fluxo.includes("data-voltar-a-conversa"));
    // O perfil relê de verdade quando a identidade deixa de ser visitante (mesmo id).
    assert.ok(fonte("./app-jaa.tsx").includes('key={`${ativa.identidadeId}:${visitante ? "visitante" : "conta"}`}'));
  });

  it("falha ao abrir o visitante (429, 5xx, rede) é FALHA com 'Tentar novamente', não a tela de entrar", () => {
    assert.ok(fluxo.includes('setEtapa({ nome: "falha-visitante", mensagem: falha.mensagem });'));
    // A falha sai antes de `aplicarConta`, que é quem mandaria para a entrada.
    assert.ok(/if \(falha\) \{\s*if \(ativo\) setEtapa\(\{ nome: "falha-visitante"[^}]*\}\);\s*return;\s*\}/.test(fluxo));
    assert.ok(fluxo.includes("data-falha-visitante") && fluxo.includes("data-tentar-visitante-de-novo") && fluxo.includes("Tentar novamente"));
    assert.ok(fluxo.includes("setTentativaVisitante((atual) => atual + 1)") && fluxo.includes("[aplicarConta, linkDeDestino, tentativaVisitante]"));
    // Entrar continua possível, mas como escolha de quem já tem conta.
    assert.ok(fluxo.includes("Já tenho conta"));
  });

  it("realtime vale para o visitante", () => {
    assert.ok(fluxo.includes('etapa.nome === "autenticado" || etapa.nome === "visitante"'));
  });
});
