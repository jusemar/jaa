import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PREVIA_MENSAGEM_RESPONDIDA_TAMANHO_MAXIMO, type ItemListaConversas, type Mensagem, type MensagemRespondida } from "@jaa/contratos";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatarHorarioMensagem } from "../lib/horarios.ts";
import { AcoesMidiaDesabilitadas } from "./acoes-midia-desabilitadas.tsx";
import { AvisosNotificacao } from "./avisos-notificacao.tsx";
import { BalaoMensagem } from "./balao-mensagem.tsx";
import { CabecalhoConversa } from "./cabecalho-conversa.tsx";
import { PreviaRespostaCompositor } from "./previa-resposta-compositor.tsx";
import { ListaConversas } from "./lista-conversas.tsx";

// Renderização real dos componentes de apresentação (sem navegador) para verificar o que é exibido.

const EU = "eeeeeeee-0000-4000-8000-000000000000";
const OUTRA = { identidadeId: "ffffffff-0000-4000-8000-000000000000", tipo: "pessoal" as const, nomeExibicao: "Mateus Filho", nomeUsuario: "mateus" };
const agora = new Date();
const ha = (minutos: number) => new Date(agora.getTime() - minutos * 60_000).toISOString();

function mensagem(n: number, remetente: string, criadoEm: string, estado: Mensagem["estado"] = "enviada"): Mensagem {
  return {
    id: `01a0a394-${String(n).padStart(4, "0")}-7000-8000-000000000000`,
    conversaId: "aaaaaaaa-0000-4000-8000-000000000000",
    remetenteIdentidadeId: remetente,
    tipo: "texto",
    conteudo: `conteúdo ${n}`,
    criadoEm,
    estado,
    mensagemRespondida: null,
    editadaEm: null,
    excluidaEm: null,
  };
}

const html = (elemento: ReactElement) => renderToStaticMarkup(elemento);
const balao = (m: Mensagem, aoResponder?: (m: Mensagem) => void, aoEditar?: (m: Mensagem) => void) =>
  html(
    createElement(BalaoMensagem, {
      mensagem: m,
      identidadeAtualId: EU,
      nomeRemetente: OUTRA.nomeExibicao,
      ...(aoResponder ? { aoResponder } : {}),
      ...(aoEditar ? { aoEditar } : {}),
    }),
  );
const texto = (marcacao: string) => marcacao.replace(/<[^>]+>/g, "");

describe("BalaoMensagem", () => {
  it("cada mensagem exibe o horário do SEU criadoEm, dentro do próprio balão", () => {
    const antiga = mensagem(1, OUTRA.identidadeId, ha(90));
    const recente = mensagem(2, OUTRA.identidadeId, ha(1));
    for (const m of [antiga, recente]) {
      const marcacao = balao(m);
      assert.ok(marcacao.includes(`<time dateTime="${m.criadoEm}"`), "time com o criadoEm da mensagem");
      assert.ok(texto(marcacao).includes(formatarHorarioMensagem(m.criadoEm)), "horário formatado da própria mensagem");
    }
    if (formatarHorarioMensagem(antiga.criadoEm) !== formatarHorarioMensagem(recente.criadoEm)) {
      assert.ok(!texto(balao(recente)).includes(formatarHorarioMensagem(antiga.criadoEm)));
    }
  });

  it("mensagem própria mostra o estado junto ao horário, no mesmo rodapé", () => {
    const esperados = { enviada: ["✓", "Enviada"], entregue: ["✓✓", "Entregue"], lida: ["✓✓", "Lida"] } as const;
    for (const [estado, [simbolo, rotulo]] of Object.entries(esperados)) {
      const marcacao = balao(mensagem(3, EU, ha(5), estado as Mensagem["estado"]));
      const rodape = marcacao.slice(marcacao.indexOf("data-rodape"));
      assert.ok(rodape.includes("<time"), "horário no rodapé");
      assert.ok(rodape.includes(`data-estado="${estado}"`), "estado no mesmo rodapé do horário");
      assert.ok(rodape.includes(`aria-label="${rotulo}"`));
      assert.ok(texto(rodape).endsWith(simbolo));
    }
  });

  it("mensagem recebida não mostra estado de envio", () => {
    const marcacao = balao(mensagem(4, OUTRA.identidadeId, ha(5), "lida"));
    assert.ok(!marcacao.includes("data-estado"));
    assert.ok(!texto(marcacao).includes("✓"));
  });
});

describe("edição no balão", () => {
  it("editada mostra indicação discreta junto ao horário original, sem mudar o horário", () => {
    const m = { ...mensagem(20, EU, ha(30), "lida"), editadaEm: ha(1) };
    const marcacao = balao(m);
    const rodape = marcacao.slice(marcacao.indexOf("data-rodape"));
    assert.ok(rodape.includes("data-editada") && texto(rodape).includes("editada"));
    assert.ok(rodape.includes(`dateTime="${m.criadoEm}"`), "horário continua sendo o criadoEm");
    assert.ok(!balao(mensagem(21, EU, ha(2))).includes("data-editada"));
  });

  it("ação Editar só existe na mensagem própria", () => {
    const noop = () => {};
    assert.ok(balao(mensagem(22, EU, ha(2)), noop, noop).includes(">Editar<"));
    assert.ok(!balao(mensagem(23, OUTRA.identidadeId, ha(2)), noop, noop).includes(">Editar<"));
  });
});

describe("resposta dentro do balão", () => {
  const citada = (remetente: string, nomeExibicao: string, previaConteudo = "Você vai trabalhar amanhã?", conteudoTruncado = false): MensagemRespondida => ({
    id: "01a0a394-0001-7000-8000-000000000000",
    remetente: { identidadeId: remetente, nomeExibicao },
    tipo: "texto",
    previaConteudo,
    conteudoTruncado,
    excluida: false,
  });
  const resposta = (remetente: string, referencia: MensagemRespondida, estado: Mensagem["estado"] = "lida"): Mensagem => ({
    ...mensagem(9, remetente, ha(3), estado),
    conteudo: "Sim, pela manhã.",
    mensagemRespondida: referencia,
  });

  it("recebida: referência compacta (nome do autor + trecho) antes do conteúdo, horário no rodapé e sem status", () => {
    const marcacao = balao(resposta(OUTRA.identidadeId, citada(EU, "Ana")));
    const referencia = marcacao.indexOf("data-referencia-resposta");
    assert.ok(referencia > 0 && referencia < marcacao.indexOf("data-conteudo"), "referência no topo do balão");
    assert.ok(texto(marcacao).includes("VocêVocê vai trabalhar amanhã?Sim, pela manhã."), "mensagem citada é minha → Você");
    assert.ok(!texto(marcacao).includes("respondeu"), "sem texto verboso");
    assert.ok(!marcacao.includes("data-estado"));
    assert.ok(marcacao.slice(marcacao.indexOf("data-rodape")).includes("<time"));
    assert.ok(marcacao.includes('data-resposta="true"'));
  });

  it("própria: nome da outra identidade na referência e ✓✓ junto ao horário", () => {
    const marcacao = balao(resposta(EU, citada(OUTRA.identidadeId, "Mateus Filho")));
    assert.ok(texto(marcacao).includes("Mateus FilhoVocê vai trabalhar amanhã?"));
    const rodape = marcacao.slice(marcacao.indexOf("data-rodape"));
    assert.ok(rodape.includes("<time") && rodape.includes('data-estado="lida"'));
  });

  it("prévia truncada pela API ganha reticências e fica limitada visualmente (sem quebrar o layout)", () => {
    const longa = "é".repeat(PREVIA_MENSAGEM_RESPONDIDA_TAMANHO_MAXIMO);
    const marcacao = balao(resposta(EU, citada(OUTRA.identidadeId, "Mateus Filho", longa, true)));
    assert.ok(texto(marcacao).includes(`${longa}…`));
    assert.ok(marcacao.includes("line-clamp-2"));
    assert.ok(marcacao.includes("[overflow-wrap:anywhere]"));
    assert.ok(!texto(marcacao).includes("é".repeat(PREVIA_MENSAGEM_RESPONDIDA_TAMANHO_MAXIMO + 1)));
  });

  it("mensagem comum não tem referência; ação Responder aparece quando disponível", () => {
    const comum = balao(mensagem(10, OUTRA.identidadeId, ha(1)), () => {});
    assert.ok(!comum.includes("data-referencia-resposta"));
    assert.ok(comum.includes('aria-label="Responder"'));
    assert.ok(comum.includes('data-resposta="false"'));
  });

  it("prévia do compositor mostra autor + trecho e o X de cancelar, sem texto verboso", () => {
    const marcacao = html(
      createElement(PreviaRespostaCompositor, {
        resposta: { mensagemId: "01a0a394-0001-7000-8000-000000000000", nomeAutor: "Mateus Filho", previaConteudo: "Você vai trabalhar amanhã?", conteudoTruncado: false },
        aoCancelar: () => {},
      }),
    );
    assert.ok(texto(marcacao).startsWith("Mateus FilhoVocê vai trabalhar amanhã?"));
    assert.ok(marcacao.includes('aria-label="Cancelar resposta"'));
    assert.ok(!/respond/i.test(texto(marcacao)));
  });
});

describe("exclusão no balão", () => {
  const tombstone = (remetente: string): Mensagem => ({ ...mensagem(30, remetente, ha(10), "lida"), conteudo: "", excluidaEm: ha(1) });
  const noop = () => {};
  const comAcoes = (m: Mensagem) =>
    html(createElement(BalaoMensagem, { mensagem: m, identidadeAtualId: EU, nomeRemetente: OUTRA.nomeExibicao, aoResponder: noop, aoEditar: noop, aoExcluirParaMim: noop, aoExcluirParaTodos: noop }));

  it("tombstone mostra 'Mensagem excluída' com o horário original, sem conteúdo, status, referência nem Responder/Editar", () => {
    const marcacao = comAcoes({ ...tombstone(EU), mensagemRespondida: null });
    assert.ok(texto(marcacao).includes("Mensagem excluída"));
    assert.ok(marcacao.includes('data-excluida="true"'));
    assert.ok(marcacao.includes("<time"));
    for (const ausente of ["data-estado", "data-referencia-resposta", 'aria-label="Responder"', ">Editar<", ">Excluir para todos<", "data-editada"]) {
      assert.ok(!marcacao.includes(ausente), ausente);
    }
    assert.ok(marcacao.includes(">Excluir para mim<"), "tombstone ainda pode ser escondido para mim");
  });

  it("Excluir para todos só na própria; Excluir para mim em qualquer mensagem", () => {
    const propria = comAcoes(mensagem(31, EU, ha(2)));
    const recebida = comAcoes(mensagem(32, OUTRA.identidadeId, ha(2)));
    assert.ok(propria.includes(">Excluir para todos<") && propria.includes(">Excluir para mim<"));
    assert.ok(!recebida.includes(">Excluir para todos<") && recebida.includes(">Excluir para mim<"));
  });

  it("referência a mensagem excluída mostra 'Mensagem excluída' sem conteúdo", () => {
    const resposta: Mensagem = {
      ...mensagem(33, OUTRA.identidadeId, ha(1)),
      mensagemRespondida: { id: mensagem(30, EU, ha(10)).id, remetente: { identidadeId: EU, nomeExibicao: "Ana" }, tipo: "texto", previaConteudo: "", conteudoTruncado: false, excluida: true },
    };
    const marcacao = balao(resposta);
    const referencia = marcacao.slice(marcacao.indexOf("data-referencia-resposta"), marcacao.indexOf("data-conteudo"));
    assert.ok(texto(referencia).includes("VocêMensagem excluída"));
  });
});

describe("CabecalhoConversa", () => {
  const cabecalho = (presenca: "online" | "offline" | null, digitando: boolean) =>
    html(createElement(CabecalhoConversa, { outraIdentidade: OUTRA, presenca, digitando }));

  it("mostra nome, @usuario e Online/Offline; digitando tem prioridade", () => {
    assert.ok(texto(cabecalho("online", false)).includes("Mateus Filho@mateusOnline"));
    assert.ok(texto(cabecalho("offline", false)).endsWith("Offline"));
    assert.ok(texto(cabecalho("online", true)).endsWith("digitando..."));
    assert.ok(texto(cabecalho(null, false)).endsWith("@mateus"), "sem conexão: não afirma online nem offline");
  });

  it("conversa com empresa: selo Empresa e ações (ex.: Ver produtos); com pessoa, nenhum selo", () => {
    const empresa = { ...OUTRA, tipo: "empresarial" as const, nomeExibicao: "Pizzaria BH" };
    const html = renderToStaticMarkup(createElement(CabecalhoConversa, { outraIdentidade: empresa, presenca: "online", digitando: false, acoes: createElement("button", null, "Ver produtos") }));
    assert.ok(html.includes('data-tipo-participante="empresarial"') && texto(html).includes("Pizzaria BHEmpresa"));
    assert.ok(texto(html).includes("Ver produtos"));
    assert.ok(!cabecalho("online", false).includes("data-tipo-participante"));
  });

  it("não tem horário global nem prévia da última mensagem", () => {
    for (const marcacao of [cabecalho("online", false), cabecalho(null, true)]) {
      assert.ok(!marcacao.includes("<time"));
      assert.ok(!/\d{2}:\d{2}/.test(texto(marcacao)));
      assert.ok(!texto(marcacao).includes("conteúdo"));
    }
  });
});

describe("ListaConversas (inalterada)", () => {
  it("última mensagem que é resposta: a prévia da lista mostra só o conteúdo novo", () => {
    const ultima: Mensagem = {
      ...mensagem(6, OUTRA.identidadeId, ha(1)),
      conteudo: "Sim, pela manhã.",
      mensagemRespondida: { id: mensagem(1, EU, ha(9)).id, remetente: { identidadeId: EU, nomeExibicao: "Ana" }, tipo: "texto", previaConteudo: "Você vai trabalhar amanhã?", conteudoTruncado: false, excluida: false },
    };
    const item: ItemListaConversas = { id: ultima.conversaId, tipo: "direta", outraIdentidade: OUTRA, ultimaMensagem: ultima, naoLidas: 0 };
    const marcacao = html(
      createElement(ListaConversas, { identidadeId: EU, itens: [item], carregando: false, erro: null, temMais: false, carregandoMais: false, conversaAbertaId: null, aoAbrir: () => {}, aoCarregarMais: () => {} }),
    );
    assert.ok(texto(marcacao).includes("Sim, pela manhã."));
    assert.ok(!texto(marcacao).includes("Você vai trabalhar amanhã?"));
    assert.ok(!marcacao.includes("data-referencia-resposta"));
  });

  it("última mensagem excluída para todos aparece como 'Mensagem excluída' na lista", () => {
    const ultima: Mensagem = { ...mensagem(7, OUTRA.identidadeId, ha(1)), conteudo: "", excluidaEm: ha(0) };
    const item: ItemListaConversas = { id: ultima.conversaId, tipo: "direta", outraIdentidade: OUTRA, ultimaMensagem: ultima, naoLidas: 0 };
    const marcacao = html(
      createElement(ListaConversas, { identidadeId: EU, itens: [item], carregando: false, erro: null, temMais: false, carregandoMais: false, conversaAbertaId: null, aoAbrir: () => {}, aoCarregarMais: () => {} }),
    );
    assert.ok(texto(marcacao).includes("Mensagem excluída"));
  });

  it("badge de não lidas aparece com a contagem (99+ no limite) e some na conversa em leitura", () => {
    const ultima = mensagem(8, OUTRA.identidadeId, ha(1));
    const renderizar = (naoLidas: number, conversaEmLeituraId: string | null) =>
      html(
        createElement(ListaConversas, {
          identidadeId: EU,
          itens: [{ id: ultima.conversaId, tipo: "direta", outraIdentidade: OUTRA, ultimaMensagem: ultima, naoLidas }],
          carregando: false,
          erro: null,
          temMais: false,
          carregandoMais: false,
          conversaAbertaId: conversaEmLeituraId,
          conversaEmLeituraId,
          aoAbrir: () => {},
          aoCarregarMais: () => {},
        }),
      );
    assert.ok(renderizar(3, null).includes('data-nao-lidas="3"'));
    assert.ok(renderizar(3, null).includes('aria-label="3 mensagens não lidas"'));
    assert.ok(renderizar(1, null).includes('aria-label="1 mensagem não lida"'));
    assert.ok(texto(renderizar(100, null)).includes("99+"));
    assert.ok(!renderizar(0, null).includes("data-nao-lidas"));
    assert.ok(!renderizar(3, ultima.conversaId).includes("data-nao-lidas"), "conversa aberta e visível não mostra badge");
  });

  it("continua mostrando nome, @usuario, prévia e horário da última mensagem", () => {
    const ultima = mensagem(5, OUTRA.identidadeId, ha(2));
    const item: ItemListaConversas = { id: ultima.conversaId, tipo: "direta", outraIdentidade: OUTRA, ultimaMensagem: ultima, naoLidas: 0 };
    const marcacao = html(
      createElement(ListaConversas, {
        identidadeId: EU,
        itens: [item],
        carregando: false,
        erro: null,
        temMais: false,
        carregandoMais: false,
        conversaAbertaId: item.id,
        aoAbrir: () => {},
        aoCarregarMais: () => {},
      }),
    );
    assert.ok(texto(marcacao).includes("Mateus Filho"));
    assert.ok(texto(marcacao).includes("@mateus"));
    assert.ok(texto(marcacao).includes("conteúdo 5"));
    assert.ok(marcacao.includes(`<time dateTime="${ultima.criadoEm}"`));
  });
});

describe("mídias futuras no compositor", () => {
  it("Foto, Vídeo, Áudio e Documento aparecem desabilitados, com 'Em breve', sem seletor de arquivo", () => {
    const marcacao = html(createElement(AcoesMidiaDesabilitadas));
    for (const rotulo of ["Foto", "Vídeo", "Áudio", "Documento"]) {
      const botao = marcacao.match(new RegExp(`<button[^>]*data-midia-futura="${rotulo}"[^>]*>`))?.[0] ?? "";
      assert.ok(botao.includes("disabled"), `${rotulo} desabilitado`);
      assert.ok(botao.includes('type="button"'), `${rotulo} não envia formulário`);
    }
    assert.ok(texto(marcacao).includes("Em breve"));
    assert.ok(!/<input|type="file"|<form|ondrop|accept=/i.test(marcacao), "sem seletor, upload ou drop");
  });
});

describe("AvisosNotificacao", () => {
  it("mostra autor e prévia (com reticências se truncada), sem horário nem dados privados", () => {
    const marcacao = html(
      createElement(AvisosNotificacao, {
        avisos: [
          {
            conversaId: "aaaaaaaa-0000-4000-8000-000000000000",
            mensagemId: "01a0a394-0001-7000-8000-000000000000",
            remetente: OUTRA,
            previaConteudo: "Você vai trabalhar amanhã?",
            conteudoTruncado: true,
            criadoEm: "2026-09-15T12:00:00.000Z",
          },
        ],
        aoAbrir: () => {},
        aoDispensar: () => {},
      }),
    );
    assert.ok(texto(marcacao).includes("Mateus FilhoVocê vai trabalhar amanhã?…"));
    assert.ok(marcacao.includes('aria-label="Dispensar notificação"'));
    assert.equal(html(createElement(AvisosNotificacao, { avisos: [], aoAbrir: () => {}, aoDispensar: () => {} })).includes("data-notificacao"), false);
  });
});
