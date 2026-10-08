import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Pedido, ResumoPedido } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DetalhePedido } from "./apresentacao-pedido.tsx";
import { PedidoNaConversaApresentacao } from "./pedido-na-conversa.tsx";

const texto = (html: string) => html.replace(/<[^>]+>/g, "").replace(/ /g, " ");

const resumo: ResumoPedido = {
  id: "dddddddd-0000-4000-8000-000000000000",
  numero: 15,
  status: "recebido",
  formaPagamentoNaEntrega: "dinheiro",
  trocoParaCentavos: null,
  subtotalCentavos: 9180,
  freteFinalCentavos: 0,
  totalCentavos: 9180,
  itens: [
    { nomeProduto: "Pizza Calabresa", quantidade: 2, subtotalCentavos: 7980, escolhas: [], observacao: null },
    { nomeProduto: "Refrigerante 2L", quantidade: 1, subtotalCentavos: 1200, escolhas: [], observacao: null },
  ],
};

const pedido: Pedido = {
  id: resumo.id,
  numero: resumo.numero,
  status: "recebido",
  origem: "conversa",
  conversaId: "eeeeeeee-0000-4000-8000-000000000000",
  empresa: { identidadeId: "bbbbbbbb-0000-4000-8000-000000000000", nome: "Pizzaria BH", nomeUsuario: "pizzariabh", slug: "pizzaria-bh" },
  cliente: { identidadeId: "aaaaaaaa-0000-4000-8000-000000000000", nomeExibicao: "Junior Rocha", nomeUsuario: "junior", tipo: "pessoal" },
  itens: [
    { id: "11111111-0000-4000-8000-000000000000", produtoId: "22222222-0000-4000-8000-000000000000", nomeProduto: "Pizza Calabresa", precoUnitarioCentavos: 3990, quantidade: 2, subtotalCentavos: 7980, escolhas: [], observacao: null },
    { id: "33333333-0000-4000-8000-000000000000", produtoId: "44444444-0000-4000-8000-000000000000", nomeProduto: "Refrigerante 2L", precoUnitarioCentavos: 1200, quantidade: 1, subtotalCentavos: 1200, escolhas: [], observacao: null },
  ],
  formaPagamentoNaEntrega: "dinheiro",
  trocoParaCentavos: null,
  totalCentavos: 9180,
  subtotalCentavos: 9180,
  freteOriginalCentavos: 0,
  descontoFreteCentavos: 0,
  freteFinalCentavos: 0,
  zonaEntregaId: null,
  zonaEntregaNome: null,
  destino: {
    enderecoId: "66666666-0000-4000-8000-000000000000",
    cep: "30123000",
    logradouro: "Rua das Flores",
    numero: "150",
    complemento: "Apto 302",
    bairro: "Centro",
    cidade: "Belo Horizonte",
    uf: "MG",
    pontoReferencia: "Portão azul",
    latitude: -19.919125,
    longitude: -43.938602,
    localizacaoConfirmadaEm: "2026-09-15T11:55:00.000Z",
  },
  motivoCancelamento: null,
  historico: [{ id: "55555555-0000-4000-8000-000000000000", status: "recebido", ocorridoEm: "2026-09-15T12:00:00.000Z", motivo: null }],
  criadoEm: "2026-09-15T12:00:00.000Z",
  atualizadoEm: "2026-09-15T12:00:00.000Z",
};

const detalhe = (dados: Pedido) => renderToStaticMarkup(createElement(DetalhePedido, { pedido: dados, aoFechar: () => {} }));
const naConversa = (propriedades: Partial<Parameters<typeof PedidoNaConversaApresentacao>[0]> = {}) =>
  renderToStaticMarkup(createElement(PedidoNaConversaApresentacao, { resumo, criadoEm: "2026-09-15T12:00:00.000Z", pedido: null, aberto: true, ...propriedades }));

describe("detalhe do Pedido na gestão da EMPRESA", () => {
  it("mostra cliente, preço unitário de cada item, total e status", () => {
    const conteudo = texto(detalhe(pedido));
    for (const esperado of ["Pedido #15 — Pizzaria BH", "Cliente: Junior Rocha", "2× Pizza Calabresa — R$ 39,90 cada = R$ 79,80", "1× Refrigerante 2L — R$ 12,00 cada = R$ 12,00", "Total: R$ 91,80", "Status: Pedido recebido"]) {
      assert.ok(conteudo.includes(esperado), esperado);
    }
  });

  it("pedido histórico mostra subtotal, taxa e total do SNAPSHOT, sem recalcular", () => {
    const comFrete = { ...pedido, subtotalCentavos: 9180, freteOriginalCentavos: 500, freteFinalCentavos: 500, totalCentavos: 9680, zonaEntregaNome: "Bairro A" };
    for (const esperado of ["Subtotal", "R$ 91,80", "Taxa de entrega", "R$ 5,00", "Total: R$ 96,80"]) assert.ok(texto(detalhe(comFrete)).includes(esperado), esperado);
  });

  it("timeline compacta de sempre (✓ ● ○), itens abertos, sem o acompanhamento do cliente", () => {
    const emPreparo: Pedido = { ...pedido, status: "em_preparacao", historico: [...pedido.historico, { id: "55555555-0000-4000-8000-000000000002", status: "em_preparacao", ocorridoEm: "2026-09-15T12:10:00.000Z", motivo: null }] };
    const html = detalhe(emPreparo);
    assert.ok(texto(html).includes("● Em preparação") && texto(html).includes("○ Pronto"));
    assert.equal(html.includes('aria-current="step"'), false);
    assert.equal(html.includes("data-pedido-na-conversa"), false);
  });
});

describe("pedido do CLIENTE dentro da conversa", () => {
  it("ATIVO: o acompanhamento aparece aberto, direto — sem 'Acompanhar pedido' nem 'Ver pedido' no meio", () => {
    const html = naConversa();
    assert.ok(html.includes('data-apresentacao="completa"') && html.includes(`data-pedido-na-conversa="${resumo.id}"`));
    const conteudo = texto(html);
    for (const esperado of ["Pedido #15", "15/09/2026 às", "Pedido recebido", "A empresa recebeu seu pedido", "Resumo do pedido", "3 itens", "2x Pizza Calabresa, 1x Refrigerante 2L", "R$ 91,80", "Dinheiro na entrega", "Itens do pedido"]) {
      assert.ok(conteudo.includes(esperado), esperado);
    }
    for (const antigo of ["Acompanhar pedido", "Ver pedido", "Ver detalhes", "Recolher"]) assert.equal(conteudo.includes(antigo), false, antigo);
    assert.equal(html.includes("data-card-pedido"), false, "o card antigo não existe mais");
  });

  it("linha do tempo dos status REAIS: concluídas, UMA atual em destaque e as próximas; hora só quando existe", () => {
    const historico = [
      ...pedido.historico,
      { id: "55555555-0000-4000-8000-000000000002", status: "em_preparacao" as const, ocorridoEm: "2026-09-15T12:10:00.000Z", motivo: null },
      { id: "55555555-0000-4000-8000-000000000003", status: "pronto" as const, ocorridoEm: "2026-09-15T12:30:00.000Z", motivo: null },
    ];
    const html = naConversa({ resumo: { ...resumo, status: "pronto" }, pedido: { ...pedido, status: "pronto", historico } });
    const situacao = (status: string) => new RegExp(`data-etapa="${status}" data-situacao="(\\w+)"`).exec(html)?.[1];
    assert.deepEqual(["recebido", "em_preparacao", "pronto", "saiu_para_entrega", "entregue"].map(situacao), ["concluida", "concluida", "atual", "futura", "futura"]);
    assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1);
    assert.ok(texto(html).includes("Aguardando coleta") && texto(html).includes("Seu pedido está separado e aguardando o entregador."));
    // Sem o histórico (pedido completo ainda carregando), as etapas aparecem e nenhum horário é inventado.
    const semHistorico = naConversa({ resumo: { ...resumo, status: "pronto" } });
    assert.equal(/data-etapa="pronto" data-situacao="atual"/.test(semHistorico), true);
    assert.equal(/\d{2}:\d{2}<\/span><\/span><\/li>/.test(semHistorico), false);
  });

  it("itens abrem e fecham NO LUGAR (details), com opções, observação e preço", () => {
    const comMontagem = { ...resumo, itens: [{ nomeProduto: "Monte seu prato", quantidade: 1, subtotalCentavos: 2490, escolhas: ["Pequeno", "Feijão"], observacao: "sem cebola" }] };
    const fechado = naConversa({ resumo: comMontagem });
    assert.ok(/<details[^>]*data-itens-do-pedido/.test(fechado) && !/<details[^>]*data-itens-do-pedido[^>]* open/.test(fechado));
    assert.ok(texto(fechado).includes("Ver itens (1)"));
    const aberto = naConversa({ resumo: comMontagem, itensAbertosInicialmente: true });
    assert.ok(/<details[^>]* open/.test(aberto));
    for (const esperado of ["Monte seu prato", "1x", "Pequeno · Feijão", "sem cebola", "R$ 24,90"]) assert.ok(texto(aberto).includes(esperado), esperado);
    assert.equal(/<a |href=/.test(aberto), false, "nada navega para outra tela");
  });

  it("endereço e ponto confirmado vêm do pedido; a entrega (fila/entregador/mapa) só entra em pedido ATIVO", () => {
    const entrega = createElement("div", { "data-entrega-teste": "" }, "mapa");
    const ativo = naConversa({ pedido, entrega });
    assert.ok(ativo.includes("data-entrega-teste"));
    if (pedido.destino) assert.ok(texto(ativo).includes("Endereço de entrega") && texto(ativo).includes("Ponto de entrega confirmado"));
    // O endereço existe UMA vez, na coluna das informações (depois de Resumo e Itens) — nunca duplicado.
    assert.equal((ativo.match(/data-destino-pedido/g) ?? []).length, pedido.destino ? 1 : 0);
    if (pedido.destino) assert.ok(ativo.indexOf("data-itens-do-pedido") < ativo.indexOf("data-destino-pedido") && ativo.indexOf("data-entrega-teste") < ativo.indexOf("data-total-pedido"));
    // As colunas são alinhadas pelo topo: nenhuma altura fixa nem cartão esticado.
    assert.ok(/data-colunas-do-pedido[^>]*items-start/.test(ativo) && !/h-full|items-stretch/.test(ativo));
    const entregue = naConversa({ resumo: { ...resumo, status: "entregue" }, pedido: { ...pedido, status: "entregue" }, entrega });
    assert.equal(entregue.includes("data-entrega-teste"), false);
  });

  it("ENTREGUE ou CANCELADO: compacto na conversa; 'Ver detalhes' abre ali mesmo e 'Recolher' fecha", () => {
    for (const [status, rotulo] of [["entregue", "Entregue"], ["cancelado", "Cancelado"]] as const) {
      const compacto = naConversa({ resumo: { ...resumo, status }, aberto: false });
      assert.ok(compacto.includes('data-apresentacao="compacta"'), status);
      assert.ok(texto(compacto).includes(`Pedido #15 · ${rotulo}`) && texto(compacto).includes("3 itens · R$ 91,80 · 15/09/2026"));
      assert.ok(compacto.includes("data-ver-detalhes-do-pedido") && compacto.includes('aria-expanded="false"'));
      assert.equal(compacto.includes("data-etapa="), false, "sem linha do tempo enquanto recolhido");
    }
    const aberto = naConversa({ resumo: { ...resumo, status: "cancelado" }, pedido: { ...pedido, status: "cancelado", motivoCancelamento: "Produto indisponível" }, aberto: true });
    assert.ok(aberto.includes('data-apresentacao="completa"') && aberto.includes("data-recolher-pedido"));
    assert.ok(texto(aberto).includes("Motivo: Produto indisponível") && texto(aberto).includes("Este pedido foi cancelado pela empresa."));
  });

  it("troco só no dinheiro com troco; nada de dados de cartão", () => {
    assert.equal(texto(naConversa()).toLowerCase().includes("troco"), false);
    const comTroco = texto(naConversa({ resumo: { ...resumo, trocoParaCentavos: 10000 } }));
    assert.ok(comTroco.includes("Troco para") && comTroco.includes("R$ 100,00 (levar R$ 8,20)"));
    const cartao = naConversa({ resumo: { ...resumo, formaPagamentoNaEntrega: "cartao" } });
    assert.ok(texto(cartao).includes("Cartão na entrega") && !texto(cartao).toLowerCase().includes("troco"));
    for (const proibido of ["cvv", "validade", "número do cartão", "titular", "<input", "<form"]) assert.ok(!(cartao + detalhe(pedido)).toLowerCase().includes(proibido), proibido);
  });
});

describe("conversa sem sobras do pedido", () => {
  it("a frase 'Pedido #N enviado para a empresa' e o painel que a exibia não existem mais", async () => {
    const { readFileSync } = await import("node:fs");
    const conversa = readFileSync(new URL("../../conversas/components/conversa-tecnica.tsx", import.meta.url), "utf8");
    assert.equal(conversa.includes("enviado para a empresa"), false);
    assert.equal(conversa.includes("avisoPedido"), false);
  });
});
