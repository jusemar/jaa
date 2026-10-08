import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { montarTimelineAcompanhamento, type AcompanhamentoPedido, type ResumoPedido } from "@jaa/contratos";
import { alternarExibicao, apresentacaoDoPedido, limitesDoMapa, pontosDoTrecho, principaisItens, rotuloCompacto, rotuloDeItens, temEntregaParaMostrar, temMapaParaMostrar, totalDeItens } from "./pedido-na-conversa.ts";

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");

const resumo: ResumoPedido = {
  id: "dddddddd-0000-4000-8000-000000000000",
  numero: 20,
  status: "pronto",
  formaPagamentoNaEntrega: "dinheiro",
  trocoParaCentavos: null,
  subtotalCentavos: 3390,
  freteFinalCentavos: 500,
  totalCentavos: 3890,
  itens: [
    { nomeProduto: "Fanta uva", quantidade: 1, subtotalCentavos: 900, escolhas: [], observacao: null },
    { nomeProduto: "Monte seu prato", quantidade: 1, subtotalCentavos: 2490, escolhas: ["Pequeno", "Feijão"], observacao: null },
  ],
};

const acompanhamento = (situacao: string, extras: Partial<AcompanhamentoPedido> = {}) =>
  ({ fila: { pedidoId: resumo.id, situacao, entregasAntes: 0 }, entregador: null, posicaoEntregador: null, rota: null, ...extras }) as AcompanhamentoPedido;
const entregador = { identidadeId: "eeeeeeee-0000-4000-8000-000000000000", tipo: "pessoal" as const, nomeExibicao: "Entregador2", nomeUsuario: "entregador2", fotoUrl: null };
const posicao = { latitude: -19.9, longitude: -43.9, capturadaEm: "2026-10-02T21:40:00.000Z" } as NonNullable<AcompanhamentoPedido["posicaoEntregador"]>;

describe("pedido do cliente dentro da conversa (Mobile)", () => {
  it("ATIVO fica sempre aberto; ENTREGUE e CANCELADO ficam compactos", () => {
    for (const status of ["recebido", "em_preparacao", "pronto", "saiu_para_entrega", "em_rota"] as const) assert.equal(apresentacaoDoPedido(status, null), "completa", status);
    for (const status of ["entregue", "cancelado"] as const) assert.equal(apresentacaoDoPedido(status, null), "compacta", status);
  });

  it("finalizado: 'Ver detalhes' abre ali mesmo e 'Recolher' fecha; ao FINALIZAR, recolhe sozinho", () => {
    const aberto = alternarExibicao("entregue", null);
    assert.equal(apresentacaoDoPedido("entregue", aberto), "completa");
    assert.equal(apresentacaoDoPedido("entregue", alternarExibicao("entregue", aberto)), "compacta");
    // Uma escolha feita com o pedido ativo não segura o pedido aberto depois de entregue.
    assert.equal(apresentacaoDoPedido("entregue", { terminal: false, aberto: true }), "compacta");
  });

  it("resumo: quantidade de itens, principais itens e rótulo compacto", () => {
    assert.equal(totalDeItens(resumo), 2);
    assert.equal(rotuloDeItens(2), "2 itens");
    assert.equal(rotuloDeItens(1), "1 item");
    assert.equal(principaisItens(resumo), "1x Fanta uva, 1x Monte seu prato");
    assert.equal(rotuloCompacto("entregue"), "Entregue");
    assert.equal(rotuloCompacto("cancelado"), "Cancelado");
  });

  it("linha do tempo: status reais, uma etapa atual; sem histórico não há horário inventado", () => {
    const etapas = montarTimelineAcompanhamento("pronto", []);
    assert.deepEqual(etapas.map((etapa) => [etapa.status, etapa.situacao]), [
      ["recebido", "concluida"],
      ["em_preparacao", "concluida"],
      ["pronto", "atual"],
      ["saiu_para_entrega", "futura"],
      ["entregue", "futura"],
    ]);
    assert.ok(etapas.every((etapa) => etapa.ocorridoEm === null));
  });

  it("ENTREGA só ocupa espaço quando há o que acompanhar; MAPA só na vez dele e com posição real", () => {
    assert.equal(temEntregaParaMostrar(null), false);
    assert.equal(temEntregaParaMostrar(acompanhamento("sem_saida")), false, "antes da entrega: nada");
    assert.equal(temEntregaParaMostrar(acompanhamento("sem_saida", { entregador })), true);
    assert.equal(temEntregaParaMostrar(acompanhamento("encerrado", { entregador })), false);
    assert.equal(temMapaParaMostrar(acompanhamento("indo_ate_voce", { entregador })), false, "sem posição não há mapa");
    assert.equal(temMapaParaMostrar(acompanhamento("indo_ate_voce", { entregador, posicaoEntregador: posicao })), true);
    assert.equal(temMapaParaMostrar(acompanhamento("sem_saida", { posicaoEntregador: posicao })), false, "fora da vez dele não há mapa");
  });

  it("a mensagem de pedido É o acompanhamento: sem card, sem 'Acompanhar pedido', sem outra tela", () => {
    const balao = ler("../../conversas/components/balao-mensagem.tsx");
    assert.ok(balao.includes("<PedidoNaConversa resumo={mensagem.pedido} criadoEm={mensagem.criadoEm}"));
    assert.equal(balao.includes("CardPedido"), false);
    const conversa = ler("../../conversas/components/tela-conversa.tsx");
    for (const antigo of ["pedidoAberto", "DetalhePedido", "abrirPedido"]) assert.equal(conversa.includes(antigo), false, antigo);
    const componente = ler("../components/pedido-na-conversa.tsx");
    assert.equal(componente.includes("Acompanhar pedido"), false);
    assert.equal(/router\.|Modal/.test(componente), false, "nada de navegação nem modal");
    // Realtime: o detalhe é relido quando o status do resumo muda.
    assert.ok(componente.includes("[resumo.id, resumo.status, completa]"));
    // Mensagens comuns continuam passando pelo balão normal.
    assert.ok(balao.includes("estilos.balao, propria ? estilos.propria : estilos.recebida"));
  });
});

describe("entrega no pedido do cliente: foto do entregador, mapa e rastreamento que o alimenta", () => {
  it("o entregador aparece com o avatar do Jaaa (foto quando o servidor envia, iniciais quando não)", () => {
    const componente = ler("../components/acompanhamento-cliente.tsx");
    assert.ok(componente.includes("<AvatarIdentidade identidade={entregador} />"));
    assert.ok(componente.includes("@{entregador.nomeUsuario}"));
  });

  it("sem mapa para mostrar, uma frase curta — e o binário sem Mapbox avisa em vez de sumir", () => {
    const componente = ler("../components/acompanhamento-cliente.tsx");
    assert.ok(componente.includes("avisoNoLugarDoMapa(acompanhamento)"));
    assert.ok(componente.includes("TEXTO_MAPA_DA_ENTREGA.indisponivelNoAparelho"));
  });

  it("o aparelho do entregador ENVIA posição: precisão alta, leitura mesmo parado, primeira posição na hora e retomada ao reabrir", () => {
    const rastreamento = ler("../../entregas/lib/rastreamento.ts");
    // Precisão equilibrada vinha imprecisa demais (descartada pela política) e a distância mínima calava quem estava parado.
    assert.ok(rastreamento.includes("const PRECISAO_DA_ENTREGA = Location.Accuracy.High;"));
    assert.equal(rastreamento.includes("Location.Accuracy.Balanced"), false);
    assert.equal(rastreamento.includes("distanceInterval: POLITICA_RASTREAMENTO.distanciaMinimaMetros"), false);
    assert.ok(rastreamento.includes("void enviarPosicaoAtual(saidaId);"));
    // Quem decide o que vira requisição continua sendo a política compartilhada.
    assert.ok(rastreamento.includes("decidirEnvioDePosicao(anterior, paraLeitura(posicao))"));
    const tela = ler("../../entregas/components/tela-entrega.tsx");
    assert.ok(tela.includes("await iniciarRastreamento(naRuaId, { pedir: false })"), "rota em andamento religa o rastreamento sem abrir diálogo");
    assert.ok(ler("../../entregas/lib/deposito-rastreamento.ts").includes("SecureStore.setItemAsync(CHAVE_SAIDA, saidaId)"));
  });
});

describe("mapa da entrega do cliente no app: Mapbox nativo, trecho real, previsão e aviso legível", () => {
  const geometria = [{ latitude: -19.92, longitude: -43.94 }, { latitude: -19.921, longitude: -43.939 }, { latitude: -19.923, longitude: -43.938 }];

  it("a linha é a geometria do servidor, na ordem; sem trecho não há linha", () => {
    assert.deepEqual(pontosDoTrecho(geometria), [[-43.94, -19.92], [-43.939, -19.921], [-43.938, -19.923]]);
    assert.deepEqual(pontosDoTrecho(null), []);
  });

  it("o enquadramento contém entregador, destino e o trecho inteiro", () => {
    assert.deepEqual(limitesDoMapa([[-43.94, -19.92], [-43.938, -19.923], ...pontosDoTrecho(geometria)]), { ne: [-43.938, -19.92], sw: [-43.94, -19.923] });
    assert.equal(limitesDoMapa([[-43.94, -19.92]]), null);
  });

  it("continua Mapbox NATIVO (sem WebView nem Leaflet), com a linha, 'Previsão', 'Distância' e aviso sólido", () => {
    const componente = ler("../components/acompanhamento-cliente.tsx");
    assert.ok(componente.includes("obterMapbox()") && componente.includes("<LineLayer id=\"trecho-da-entrega-linha\""));
    assert.equal(/WebView|leaflet/i.test(componente), false);
    assert.ok(componente.includes("geometria={rota?.geometria ?? null}"), "a geometria vem do acompanhamento do servidor");
    assert.ok(componente.includes("{rota && (") && componente.includes("Previsão: ") && componente.includes("Distância: "), "só com dado real");
    assert.ok(componente.includes("aviso: { backgroundColor: Cores.marcaSuave"), "fundo sólido do tema");
    assert.ok(componente.includes("Aguardando a localização do entregador…"));
    assert.equal(/fetch\(|directions/i.test(componente), false, "o app não calcula rota");
  });
});
