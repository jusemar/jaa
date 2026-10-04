import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { Mensagem } from "@jaa/contratos";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BotaoPainelLateral, MestreDetalhe, classesDoConteudo, classesDoPainel } from "../../../components/navegacao/mestre-detalhe.tsx";
import { IconeLapis, IconeLixeira, IconeResponder } from "../../../components/ui/icones.tsx";
import { criarPreferenciaPainel } from "../../../lib/preferencia-painel.ts";
import { ehTeclaDeFechar } from "../lib/trava-rolagem.ts";
import { BalaoMensagem } from "./balao-mensagem.tsx";
import { ConversaNaoEscolhida } from "./mensageiro-tecnico.tsx";
import { MenuMensagem, type AcaoMensagem } from "./menu-mensagem.tsx";

/*
 * Refinamento visual da mensageria: cores da resposta e do rodapé, menu da mensagem no balão, foco do
 * compositor e o layout mestre-detalhe. Sem navegador: marcação real + as regras puras.
 */

const EU = "eeeeeeee-0000-4000-8000-000000000000";
const OUTRA = "ffffffff-0000-4000-8000-000000000000";
const html = (elemento: ReactElement) => renderToStaticMarkup(elemento);
const tag = (marcacao: string, atributo: string) => marcacao.match(new RegExp(`<[^>]*${atributo}[^>]*>`))?.[0] ?? "";
const classes = (marcacao: string, atributo: string) => tag(marcacao, atributo).match(/class="([^"]*)"/)?.[1]?.split(/\s+/) ?? [];
const fonte = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");

function mensagem(extra: Partial<Mensagem> = {}): Mensagem {
  return {
    id: "01a0a394-0001-7000-8000-000000000000",
    conversaId: "aaaaaaaa-0000-4000-8000-000000000000",
    remetenteIdentidadeId: EU,
    tipo: "texto",
    conteudo: "Sim, vou",
    criadoEm: "2026-10-03T12:00:00.000Z",
    estado: "enviada",
    mensagemRespondida: null,
    editadaEm: null,
    excluidaEm: null,
    pedido: null,
    anexo: null,
    ...extra,
  };
}
const referencia = { id: "01a0a394-0009-7000-8000-000000000000", remetente: { identidadeId: OUTRA, nomeExibicao: "Mateus" }, tipo: "texto" as const, previaConteudo: "Vai trabalhar?", conteudoTruncado: false, excluida: false };
const balao = (m: Mensagem, menuAberto = false) =>
  html(createElement(BalaoMensagem, { mensagem: m, identidadeAtualId: EU, nomeRemetente: "Mateus", aoResponder: () => {}, aoEditar: () => {}, aoExcluirParaMim: () => {}, aoExcluirParaTodos: () => {}, menuAberto }));

describe("resposta citada e rodapé da mensagem enviada", () => {
  it("texto citado escuro (nunca branco), nome com o destaque da marca, fundo sutil e barra lateral", () => {
    const marcacao = balao(mensagem({ mensagemRespondida: referencia }));
    const bloco = tag(marcacao, "data-referencia-resposta");
    assert.ok(/border-l/.test(bloco) && /bg-mensagem-enviada-conteudo\/\[0\.08\]/.test(bloco), "barra lateral + fundo levemente mais escuro");
    const interior = marcacao.slice(marcacao.indexOf("data-referencia-resposta"), marcacao.indexOf("Sim, vou"));
    assert.ok(interior.includes("text-mensagem-enviada-conteudo/80"), "conteúdo citado na cor escura do balão");
    assert.ok(interior.includes("text-marca"), "nome destacado");
    assert.ok(!/text-marca-conteudo|text-white/.test(interior), "nada branco no bloco citado");
  });

  it("horário em tom neutro, sem o verde da marca", () => {
    const rodape = classes(balao(mensagem()), "data-rodape");
    assert.ok(rodape.includes("text-conteudo-suave"));
    assert.ok(!rodape.includes("text-marca"));
  });

  it("enviada e entregue ficam neutras; só LIDA fica azul", () => {
    for (const estado of ["enviada", "entregue"] as const) {
      const marca = classes(balao(mensagem({ estado })), `data-estado="${estado}"`);
      assert.ok(!marca.includes("text-leitura") && !marca.includes("text-marca"), `${estado} herda o tom neutro do rodapé`);
    }
    assert.ok(classes(balao(mensagem({ estado: "lida" })), 'data-estado="lida"').includes("text-leitura"));
    assert.ok(/--cor-leitura:\s*oklch\([^)]*\s2\d\d\)/.test(fonte("../../../app/globals.css")), "token de leitura é azul (matiz 200–299)");
  });
});

describe("menu da mensagem", () => {
  const acao = (id: AcaoMensagem["id"], rotulo: string, Icone: AcaoMensagem["Icone"]): AcaoMensagem => ({ id, rotulo, Icone, executar: () => {} });
  const todas = [acao("responder", "Responder", IconeResponder), acao("editar", "Editar", IconeLapis), acao("apagar-para-mim", "Apagar para mim", IconeLixeira), acao("apagar-para-todos", "Apagar para todos", IconeLixeira)];

  it("uma seta no canto superior direito do PRÓPRIO balão; nada ao lado da mensagem", () => {
    const marcacao = balao(mensagem());
    assert.equal(marcacao.match(/data-gatilho-menu-mensagem/g)?.length, 1);
    const item = marcacao.match(/^<li[^>]*>/)?.[0] ?? "";
    const balaoHtml = marcacao.slice(item.length);
    assert.ok(balaoHtml.startsWith("<div"), "o único filho da linha é o balão");
    assert.ok(/^<div[^>]*class="[^"]*\bgroup\b[^"]*\brelative\b/.test(balaoHtml), "a seta é posicionada dentro do balão");
    assert.ok(classes(marcacao, "data-menu-mensagem").join(" ").includes("absolute right-1 top-1"));
    assert.ok(!marcacao.includes("⋯") && !marcacao.includes("<details") && !marcacao.includes("Mais ações"), "três pontos antigos removidos");
    assert.ok(!/<\/div><button|<li[^>]*><button/.test(marcacao), "nenhum botão solto fora do balão");
  });

  it("a seta é um botão de verdade: foco por teclado, toque e estado anunciado", () => {
    const gatilho = tag(balao(mensagem()), "data-gatilho-menu-mensagem");
    assert.ok(gatilho.startsWith("<button") && gatilho.includes('aria-haspopup="menu"') && gatilho.includes('aria-expanded="false"'));
    assert.ok(gatilho.includes('aria-label="Ações da mensagem"'));
    assert.ok(gatilho.includes("group-hover:opacity-100") && gatilho.includes("focus-visible:opacity-100") && gatilho.includes("[@media(hover:none)]:opacity-100"));
    assert.ok(!balao(mensagem()).includes('role="menu"'), "fechado até clicar");
  });

  it("aberto: cada ação com seu ícone e rótulo", () => {
    const marcacao = html(createElement(MenuMensagem, { acoes: todas, emBalaoProprio: true, abertoInicialmente: true }));
    assert.ok(marcacao.includes('role="menu"') && marcacao.includes('aria-expanded="true"'));
    const itens = [...marcacao.matchAll(/data-acao-mensagem="([^"]+)"[^>]*>(<svg[\s\S]*?<\/svg>)([^<]+)/g)].map((item) => [item[1], item[3]]);
    assert.deepEqual(itens, [["responder", "Responder"], ["editar", "Editar"], ["apagar-para-mim", "Apagar para mim"], ["apagar-para-todos", "Apagar para todos"]]);
  });

  it("ações respeitam a mensagem: própria de texto tem as quatro; recebida não edita nem apaga para todos", () => {
    const ids = (marcacao: string) => [...marcacao.matchAll(/data-acao-mensagem="([^"]+)"/g)].map((item) => item[1]);
    assert.deepEqual(ids(balao(mensagem(), true)), ["responder", "editar", "apagar-para-mim", "apagar-para-todos"]);
    assert.deepEqual(ids(balao(mensagem({ remetenteIdentidadeId: OUTRA }), true)), ["responder", "apagar-para-mim"]);
    const imagem = mensagem({ tipo: "imagem", conteudo: "", anexo: { id: "01a0a394-0002-7000-8000-000000000000", tipo: "imagem", largura: 800, altura: 600 } });
    assert.deepEqual(ids(balao(imagem, true)), ["responder", "apagar-para-mim", "apagar-para-todos"], "imagem não é editável");
    assert.deepEqual(ids(balao(mensagem({ conteudo: "", excluidaEm: "2026-10-03T12:05:00.000Z" }), true)), ["apagar-para-mim"], "excluída: só esconder para mim");
  });

  it("menu aberto fica POR CIMA dos outros balões: a linha da mensagem sobe acima das irmãs", () => {
    const linha = (marcacao: string) => marcacao.match(/^<li[^>]*>/)?.[0] ?? "";
    const aberta = linha(balao(mensagem(), true));
    assert.ok(aberta.includes("data-menu-aberto") && /class="[^"]*\brelative z-20\b/.test(aberta));
    const fechada = linha(balao(mensagem()));
    assert.ok(!fechada.includes("data-menu-aberto") && !/\bz-20\b/.test(fechada), "fechado, nenhuma linha fica acima das outras");
    // A causa: a animação de entrada mantém transform/opacity (fill `both`) e cria um contexto por linha.
    assert.ok(/\.mensagem-entrando\s*\{\s*animation:[^;]*\bboth\b/.test(fonte("../../../app/globals.css")));
    assert.ok(fonte("./menu-mensagem.tsx").includes("aoMudarAberto?.(aberto)"));
  });

  it("Esc fecha (e clicar fora também): a tecla reconhecida e os ouvintes do menu", () => {
    assert.equal(ehTeclaDeFechar("Escape"), true);
    assert.equal(ehTeclaDeFechar("Enter"), false);
    const codigo = fonte("./menu-mensagem.tsx");
    assert.ok(codigo.includes("ehTeclaDeFechar(evento.key)") && codigo.includes('addEventListener("keydown"'));
    assert.ok(codigo.includes('addEventListener("mousedown"') && codigo.includes("container.current?.contains"));
  });
});

describe("compositor focado", () => {
  const codigo = fonte("./conversa-tecnica.tsx");
  const inicioPilula = codigo.indexOf("data-compositor\n");
  const pilula = codigo.slice(inicioPilula, inicioPilula + 400);

  it("a pílula não ganha borda, anel nem sombra ao focar", () => {
    assert.ok(pilula.includes("rounded-full border border-borda bg-superficie"));
    assert.ok(!/focus-within|focus:|ring-/.test(pilula));
    assert.ok(!/focus-within:(border|ring)/.test(codigo), "nenhum focus-within de destaque na conversa");
  });

  it("o campo continua lá: rótulo, placeholder, legenda e sem contorno próprio", () => {
    const campo = codigo.slice(codigo.indexOf('id="campo-mensagem"'), codigo.indexOf('id="campo-mensagem"') + 1400);
    assert.ok(campo.includes("campo-sem-contorno") && campo.includes('placeholder={bloqueada ? ""') && campo.includes("disabled={bloqueada}"));
    // O contorno global de foco (fora das camadas do Tailwind) é anulado por regra mais específica.
    assert.ok(/\.campo-sem-contorno:focus-visible\s*\{\s*outline:\s*none;/.test(fonte("../../../app/globals.css")));
    assert.ok(codigo.includes("Legenda (opcional)…") && codigo.includes("<BotaoAnexarImagem"));
  });
});

describe("layout mestre-detalhe", () => {
  const layout = (opcoes: { recolhido: boolean; conteudoEmFoco: boolean }) =>
    html(createElement(MestreDetalhe, { rotuloPainel: "Conversas", painel: createElement("p", null, "LISTA"), conteudo: createElement("p", null, "CONVERSA"), ...opcoes }));
  const visivel = (lista: string[], largo: boolean) => {
    const base = lista.includes("hidden") ? false : true;
    if (!largo) return base;
    if (lista.includes("md:hidden")) return false;
    if (lista.includes("md:flex")) return true;
    return base;
  };
  const lados = (opcoes: { recolhido: boolean; conteudoEmFoco: boolean }, largo: boolean) => ({
    painel: visivel(classesDoPainel(opcoes).split(" "), largo),
    conteudo: visivel(classesDoConteudo(opcoes).split(" "), largo),
  });

  it("janela larga, painel aberto: lista e conversa lado a lado, com ou sem conversa selecionada", () => {
    assert.deepEqual(lados({ recolhido: false, conteudoEmFoco: true }, true), { painel: true, conteudo: true });
    assert.deepEqual(lados({ recolhido: false, conteudoEmFoco: false }, true), { painel: true, conteudo: true });
    const marcacao = layout({ recolhido: false, conteudoEmFoco: true });
    assert.ok(marcacao.includes('data-painel="aberto"') && marcacao.includes("LISTA") && marcacao.includes("CONVERSA"));
  });

  it("painel recolhido: só o conteúdo na janela larga — e a conversa continua montada", () => {
    assert.deepEqual(lados({ recolhido: true, conteudoEmFoco: true }, true), { painel: false, conteudo: true });
    const marcacao = layout({ recolhido: true, conteudoEmFoco: true });
    assert.ok(marcacao.includes('data-painel="recolhido"'));
    assert.ok(marcacao.includes("LISTA") && marcacao.includes("CONVERSA"), "recolher só esconde: nada é desmontado, a conversa selecionada não se perde");
  });

  it("janela estreita: uma área por vez, e recolher não afeta o celular", () => {
    for (const recolhido of [false, true]) {
      assert.deepEqual(lados({ recolhido, conteudoEmFoco: false }, false), { painel: true, conteudo: false });
      assert.deepEqual(lados({ recolhido, conteudoEmFoco: true }, false), { painel: false, conteudo: true });
    }
  });

  it("largura do painel: de mensageiro (300–384 px), sem tomar metade da tela nem criar rolagem horizontal", () => {
    const painel = classesDoPainel({ recolhido: false, conteudoEmFoco: false });
    assert.ok(painel.includes("md:w-[clamp(18.75rem,30vw,24rem)]") && painel.includes("md:shrink-0") && painel.includes("w-full"));
    assert.ok(classesDoConteudo({ conteudoEmFoco: true }).includes("min-w-0 flex-1"));
  });

  it("o breakpoint é o da barra principal (md), não mais o xl que escondia a lista cedo demais", () => {
    assert.ok(!/xl:/.test(classesDoPainel({ recolhido: false, conteudoEmFoco: true }) + classesDoConteudo({ conteudoEmFoco: true })));
    const mensageiro = fonte("./mensageiro-tecnico.tsx");
    assert.ok(mensageiro.includes("<MestreDetalhe") && !/xl:/.test(mensageiro));
    assert.ok(fonte("../../../components/navegacao/navegacao-app.tsx").includes("md:flex"));
  });

  it("botão de recolher/abrir: ícone de painel (não é voltar), rótulo conforme o estado, só na janela larga", () => {
    const recolher = html(createElement(BotaoPainelLateral, { recolhido: false, aoAlternar: () => {} }));
    const abrir = html(createElement(BotaoPainelLateral, { recolhido: true, aoAlternar: () => {} }));
    assert.ok(recolher.includes('aria-label="Recolher painel lateral"') && recolher.includes('data-alternar-painel="recolher"'));
    assert.ok(abrir.includes('aria-label="Abrir painel lateral"') && abrir.includes('data-alternar-painel="abrir"'));
    assert.ok(classes(recolher, "data-alternar-painel").includes("hidden") && classes(recolher, "data-alternar-painel").includes("md:grid"));
    assert.ok(recolher.includes("<rect") && !recolher.includes("data-voltar-conversas"));
  });

  it("\"Escolha uma conversa\" à direita sem seleção; com o painel recolhido traz o botão de reabrir", () => {
    const vazio = html(createElement(ConversaNaoEscolhida, { painel: "conversas" }));
    assert.ok(vazio.includes("Escolha uma conversa") && !vazio.includes("data-alternar-painel"));
    const recolhido = html(createElement(ConversaNaoEscolhida, { painel: "conversas", inicio: createElement(BotaoPainelLateral, { recolhido: true, aoAlternar: () => {} }) }));
    assert.ok(recolhido.includes('data-alternar-painel="abrir"'));
  });

  it("preferência do painel: só o estado visual, sobrevive ao recarregar e tolera armazenamento indisponível", () => {
    const guardado = new Map<string, string>();
    const armazenamento = { getItem: (chave: string) => guardado.get(chave) ?? null, setItem: (chave: string, valor: string) => void guardado.set(chave, valor) };
    const preferencia = criarPreferenciaPainel(() => armazenamento);
    let avisos = 0;
    preferencia.assinar(() => (avisos += 1));
    assert.equal(preferencia.recolhido(), false, "padrão: aberto");
    preferencia.alternar();
    assert.equal(preferencia.recolhido(), true);
    assert.equal(avisos, 1);
    assert.deepEqual([...guardado.entries()], [["jaa.painel-lateral-recolhido", "1"]], "nada de conversa é guardado");
    assert.equal(criarPreferenciaPainel(() => armazenamento).recolhido(), true, "outra visita lê a preferência");
    preferencia.alternar();
    assert.equal(guardado.get("jaa.painel-lateral-recolhido"), "0");

    const quebrado = criarPreferenciaPainel(() => ({ getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("bloqueado"); } }));
    assert.equal(quebrado.recolhido(), false);
    quebrado.alternar();
    assert.equal(quebrado.recolhido(), true, "vale nesta visita");
    assert.equal(criarPreferenciaPainel(() => null).recolhido(), false);
  });
});

describe("contatos no mestre-detalhe", () => {
  const mensageiro = fonte("./mensageiro-tecnico.tsx");
  const app = fonte("../../../components/navegacao/app-jaa.tsx");

  it("Contatos e Conversas são o MESMO mensageiro: muda só o painel; a conversa não é duplicada", () => {
    assert.ok(app.includes('areaAtiva === "conversas" || areaAtiva === "contatos"'));
    assert.ok(app.includes('painel={areaAtiva === "contatos" ? "contatos" : "conversas"}'));
    assert.equal(app.match(/<MensageiroTecnico/g)?.length, 1);
    assert.ok(!app.includes("<AreaContatos"), "a agenda não é mais uma página que toma o lugar da conversa");
    assert.equal(mensageiro.match(/<ConversaTecnica/g)?.length, 1);
  });

  it("escolher um contato abre a conversa AO LADO, sem trocar de área nem desmontar a lista", () => {
    assert.ok(/<AreaContatos aoAbrirConversa=\{\(nomeUsuario\) => void abrirCom\(nomeUsuario\)\} \/>/.test(mensageiro));
    assert.ok(mensageiro.includes('rotuloPainel={painel === "contatos" ? "Contatos" : "Conversas"}'));
    const vazio = html(createElement(ConversaNaoEscolhida, { painel: "contatos" }));
    assert.ok(vazio.includes("Selecione um contato na lista ao lado"));
  });
});
