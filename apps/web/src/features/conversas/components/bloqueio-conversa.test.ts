import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { comunicacaoBloqueada, type IdentidadeVisivel, type ItemListaConversas } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfirmarAcaoConversa, acoesDisponiveis } from "./acoes-conversa.tsx";
import { SimboloBloqueio } from "./bloqueio-conversa.tsx";
import { CabecalhoConversa } from "./cabecalho-conversa.tsx";
import { ListaConversas } from "./lista-conversas.tsx";

const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const PESSOA: IdentidadeVisivel = { identidadeId: "aaaaaaaa-0000-4000-8000-000000000001", tipo: "pessoal", nomeExibicao: "Carlos", nomeUsuario: "carlos", fotoUrl: null };
const EMPRESA: IdentidadeVisivel = { identidadeId: "aaaaaaaa-0000-4000-8000-000000000002", tipo: "empresarial", nomeExibicao: "Pizzaria", nomeUsuario: "pizzaria", fotoUrl: null };
const item = (outra: IdentidadeVisivel, extra: Partial<ItemListaConversas> = {}): ItemListaConversas => ({
  id: "bbbbbbbb-0000-4000-8000-000000000001",
  tipo: "direta",
  outraIdentidade: outra,
  ultimaMensagem: null,
  atividadeId: "0199aaaa-0000-7000-8000-000000000001",
  naoLidas: 0,
  comunicacaoBloqueada: false,
  ...extra,
});
const listaCom = (itens: ItemListaConversas[], comAcoes = true) =>
  renderToStaticMarkup(
    createElement(ListaConversas, {
      identidadeId: "cccccccc-0000-4000-8000-000000000001",
      itens,
      carregando: false,
      erro: null,
      temMais: false,
      carregandoMais: false,
      conversaAbertaId: null,
      aoAbrir: () => {},
      aoCarregarMais: () => {},
      ...(comAcoes ? { aoAcaoConversa: async () => null } : {}),
    }),
  );

describe("menu de ações da conversa", () => {
  it("cada conversa tem o botão de opções (Radix, acessível); sem ações, a lista não mostra menu", () => {
    // O menu é Radix: no navegador o Next usa um React só; em Node o monorepo tem dois, então a
    // conferência é estrutural, e o SSR abaixo roda sem o menu.
    const menu = readFileSync(new URL("./acoes-conversa.tsx", import.meta.url), "utf8");
    assert.match(menu, /@radix-ui\/react-dropdown-menu/);
    assert.match(menu, /aria-label=\{`Opções da conversa com \$\{outra\.nomeExibicao\}`\}/);
    assert.equal(listaCom([item(PESSOA)], false).includes("data-opcoes-conversa"), false);
  });

  it("botão direito abre o MESMO menu controlado do botão de opções", () => {
    // Sem DOM nos testes: a garantia é estrutural — o contextmenu da linha abre o mesmo estado que o "⋯".
    const fonte = readFileSync(new URL("./lista-conversas.tsx", import.meta.url), "utf8");
    assert.match(fonte, /onContextMenu=\{[\s\S]*?evento\.preventDefault\(\);\s*setMenuAberto\(item\.id\);/);
    assert.match(fonte, /aberto=\{menuAberto === item\.id\}/);
    assert.equal((fonte.match(/<AcoesDaConversa/g) ?? []).length, 1, "um menu só por conversa");
  });

  it("o ⋯ do CABEÇALHO usa o mesmo componente e a MESMA função de ações da lista", () => {
    const conversa = readFileSync(new URL("./conversa-tecnica.tsx", import.meta.url), "utf8");
    assert.match(conversa, /<AcoesDaConversa alvo=\{\{ id: conversa\.id, outraIdentidade: outro \}\} aoExecutar=\{aoAcaoConversa\} \/>/);
    const mensageiro = readFileSync(new URL("./mensageiro-tecnico.tsx", import.meta.url), "utf8");
    assert.equal((mensageiro.match(/aoAcaoConversa=\{executarAcaoConversa\}/g) ?? []).length, 2, "lista e cabeçalho: o mesmo executor");
  });

  it("a situação de bloqueio é lida sempre que o menu fica ABERTO, por qualquer caminho (causa do 'Bloquear' sumido)", () => {
    const menu = readFileSync(new URL("./acoes-conversa.tsx", import.meta.url), "utf8");
    // Antes: só no onOpenChange do Radix, que não roda quando o menu é aberto por fora (botão direito).
    assert.match(menu, /useEffect\(\(\) => \{\s*if \(!aberto \|\| outra\.tipo !== "pessoal"\) return;/);
    assert.match(menu, /onOpenChange=\{aoMudarAberto\}/);
  });

  it("ações: pessoa → limpar, apagar e bloquear/desbloquear conforme QUEM bloqueou; empresa → sem bloqueio", () => {
    assert.deepEqual(acoesDisponiveis("pessoal", { podeBloquear: true, euBloqueei: false, fuiBloqueado: false }), ["limpar", "apagar", "bloquear"]);
    assert.deepEqual(acoesDisponiveis("pessoal", { podeBloquear: true, euBloqueei: true, fuiBloqueado: false }), ["limpar", "apagar", "desbloquear"]);
    // Só o OUTRO bloqueou: nada de "Desbloquear" (não é dele); pode criar o próprio bloqueio.
    assert.deepEqual(acoesDisponiveis("pessoal", { podeBloquear: true, euBloqueei: false, fuiBloqueado: true }), ["limpar", "apagar", "bloquear"]);
    assert.deepEqual(acoesDisponiveis("empresarial", { podeBloquear: false, euBloqueei: false, fuiBloqueado: false }), ["limpar", "apagar"]);
    assert.deepEqual(acoesDisponiveis("empresarial", null), ["limpar", "apagar"]);
  });

  it("com empresa nunca há bloqueio, nem enquanto carrega", () => {
    assert.equal(acoesDisponiveis(EMPRESA.tipo, null).includes("bloquear"), false);
    assert.equal(acoesDisponiveis(EMPRESA.tipo, { podeBloquear: true, euBloqueei: false, fuiBloqueado: false }).includes("bloquear"), false);
  });

  it("confirmações curtas e claras para limpar, apagar e bloquear", () => {
    const confirmar = (acao: "limpar" | "apagar" | "bloquear") =>
      texto(renderToStaticMarkup(createElement(ConfirmarAcaoConversa, { acao, item: item(PESSOA), ocupado: false, erro: null, aoConfirmar: () => {}, aoCancelar: () => {} })));
    assert.ok(confirmar("limpar").includes("As mensagens somem só para você"));
    assert.ok(confirmar("apagar").includes("Ela sai da sua lista só para você"));
    assert.ok(confirmar("bloquear").includes("Bloquear @carlos?"));
    assert.ok(confirmar("bloquear").includes("não interfere em pedidos ou entregas"));
  });
});

describe("bloqueio na interface", () => {
  it("bloqueio em QUALQUER sentido bloqueia a comunicação", () => {
    assert.equal(comunicacaoBloqueada({ euBloqueei: true, fuiBloqueado: false }), true);
    assert.equal(comunicacaoBloqueada({ euBloqueei: false, fuiBloqueado: true }), true);
    assert.equal(comunicacaoBloqueada({ euBloqueei: false, fuiBloqueado: false }), false);
  });

  it("🚫 discreto e acessível junto ao nome — na lista e no cabeçalho —, sem aviso textual", () => {
    const simbolo = renderToStaticMarkup(createElement(SimboloBloqueio));
    assert.ok(simbolo.includes('role="img"'));
    assert.ok(simbolo.includes('aria-label="Comunicação bloqueada com este usuário"'));
    assert.ok(simbolo.includes("title="));
    assert.ok(listaCom([item(PESSOA, { comunicacaoBloqueada: true })], false).includes("data-comunicacao-bloqueada"));
    assert.equal(listaCom([item(PESSOA)], false).includes("data-comunicacao-bloqueada"), false);
    const cabecalho = renderToStaticMarkup(createElement(CabecalhoConversa, { outraIdentidade: PESSOA, presenca: null, digitando: false, bloqueada: true }));
    assert.ok(cabecalho.includes("data-comunicacao-bloqueada"));
    for (const proibido of ["Mensagens bloqueadas entre vocês", "Não é possível enviar mensagens"]) assert.equal(texto(cabecalho).includes(proibido), false);
  });

  it("conversa LIMPA continua na lista, sem prévia de mensagem antiga", () => {
    const html = listaCom([item(PESSOA)], false);
    assert.ok(html.includes("Carlos"));
    assert.ok(texto(html).includes("Sem mensagens"));
  });

  it("compositor bloqueado: sem digitar nem enviar (e o servidor recusa de qualquer forma)", () => {
    const fonte = readFileSync(new URL("./conversa-tecnica.tsx", import.meta.url), "utf8");
    assert.match(fonte, /disabled=\{bloqueada\}/);
    assert.match(fonte, /disabled=\{ocupado \|\| bloqueada\}/);
    assert.doesNotMatch(fonte, /Mensagens bloqueadas entre vocês/);
  });
});
