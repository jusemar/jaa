import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { criarSincroniaDaEntrega, saidaAfetaPedido } from "./sincronia-entrega";

type Entrega = { entregadorAtual: string | null };
type Resposta = { ok: true; dados: Entrega } | { ok: false };

const saidaCom = (...pedidoIds: string[]) => ({ paradas: pedidoIds.map((pedidoId) => ({ pedidoId })) }) as Parameters<typeof saidaAfetaPedido>[0];

/** Servidor falso: cada consulta fica pendente até o teste responder — a ordem das respostas é do teste. */
function montar() {
  const consultas: { empresaId: string; pedidoId: string; responder: (resposta: Resposta) => void }[] = [];
  const aplicadas: Entrega[] = [];
  const sincronia = criarSincroniaDaEntrega<Entrega>({
    obter: (empresaId, pedidoId) => new Promise<Resposta>((responder) => consultas.push({ empresaId, pedidoId, responder })),
    aplicar: (entrega) => aplicadas.push(entrega),
  });
  return { sincronia, consultas, aplicadas };
}

const comEntregador = (nome: string): Resposta => ({ ok: true, dados: { entregadorAtual: nome } });

describe("entrega do pedido aberto acompanha saida:atualizada", () => {
  it("a saída só afeta o pedido que está (ou esteve) entre as paradas dela", () => {
    assert.equal(saidaAfetaPedido(saidaCom("p1", "p2"), "p2"), true);
    assert.equal(saidaAfetaPedido(saidaCom("p1", "p2"), "p3"), false);
    assert.equal(saidaAfetaPedido(saidaCom("p1"), null), false);
  });

  it("despacho automático com o pedido aberto: relê a entrega e o entregador aparece sem reabrir", async () => {
    const { sincronia, consultas, aplicadas } = montar();
    sincronia.definirPedidoAberto("empresa", "p33");

    const relendo = sincronia.aoAtualizarSaida(saidaCom("p32", "p33"));
    assert.deepEqual(consultas.map(({ empresaId, pedidoId }) => [empresaId, pedidoId]), [["empresa", "p33"]]);
    consultas[0]?.responder(comEntregador("Entregador2"));
    await relendo;
    assert.deepEqual(aplicadas, [{ entregadorAtual: "Entregador2" }]);
  });

  it("saída de outro pedido, ou nenhum pedido aberto: nenhuma consulta", async () => {
    const { sincronia, consultas, aplicadas } = montar();
    await sincronia.aoAtualizarSaida(saidaCom("p33"));
    await sincronia.reler();
    sincronia.definirPedidoAberto("empresa", "p33");
    await sincronia.aoAtualizarSaida(saidaCom("p40", "p41"));
    assert.equal(consultas.length, 0);
    assert.deepEqual(aplicadas, []);
  });

  it("reconexão com pedido aberto: relê a entrega; depois de voltar à lista, não", async () => {
    const { sincronia, consultas, aplicadas } = montar();
    sincronia.definirPedidoAberto("empresa", "p33");
    const relendo = sincronia.reler();
    consultas[0]?.responder(comEntregador("Entregador2"));
    await relendo;
    assert.deepEqual(aplicadas, [{ entregadorAtual: "Entregador2" }]);

    sincronia.definirPedidoAberto("empresa", null);
    await sincronia.reler();
    assert.equal(consultas.length, 1);
  });

  it("resposta atrasada do pedido anterior não sobrescreve o pedido aberto agora", async () => {
    const { sincronia, consultas, aplicadas } = montar();
    sincronia.definirPedidoAberto("empresa", "p33");
    const doAnterior = sincronia.aoAtualizarSaida(saidaCom("p33"));

    // A pessoa troca de pedido antes de a resposta chegar.
    sincronia.definirPedidoAberto("empresa", "p34");
    consultas[0]?.responder(comEntregador("Entregador do 33"));
    await doAnterior;
    assert.deepEqual(aplicadas, []);

    // Fechou o pedido com a consulta no ar: também não grava.
    const doAtual = sincronia.reler();
    sincronia.definirPedidoAberto("empresa", null);
    consultas[1]?.responder(comEntregador("Entregador do 34"));
    await doAtual;
    assert.deepEqual(aplicadas, []);
  });

  it("dois avisos seguidos: vale a resposta da consulta mais recente, mesmo chegando fora de ordem", async () => {
    const { sincronia, consultas, aplicadas } = montar();
    sincronia.definirPedidoAberto("empresa", "p33");
    const primeira = sincronia.aoAtualizarSaida(saidaCom("p33"));
    const segunda = sincronia.aoAtualizarSaida(saidaCom("p33"));
    consultas[1]?.responder(comEntregador("Entregador2"));
    consultas[0]?.responder({ ok: true, dados: { entregadorAtual: null } });
    await Promise.all([primeira, segunda]);
    assert.deepEqual(aplicadas, [{ entregadorAtual: "Entregador2" }]);
  });

  it("a tela gravou a entrega por conta própria (atribuição): releitura pendente não a desfaz; falha não apaga nada", async () => {
    const { sincronia, consultas, aplicadas } = montar();
    sincronia.definirPedidoAberto("empresa", "p33");
    const pendente = sincronia.reler();
    sincronia.descartarPendentes();
    consultas[0]?.responder({ ok: true, dados: { entregadorAtual: null } });
    await pendente;

    const falha = sincronia.reler();
    consultas[1]?.responder({ ok: false });
    await falha;
    assert.deepEqual(aplicadas, []);
  });

  it("a tela de Pedidos liga o aviso da saída e a reconexão à releitura da entrega", () => {
    const fonte = readFileSync(new URL("./../components/area-pedidos-empresa.tsx", import.meta.url), "utf8");
    assert.match(fonte, /criarSincroniaDaEntrega\(\{ obter: obterEntregaDoPedido, aplicar: setEntrega \}\)/);
    // saida:atualizada → relê a entrega do pedido aberto (o evento não monta a entrega).
    assert.match(fonte, /void sincroniaDaEntrega\.aoAtualizarSaida\(/);
    // Reconectar relê também.
    assert.match(fonte, /socket\.on\("connect", [\s\S]{0,400}sincroniaDaEntrega\.reler\(\)|sincroniaDaEntrega\.reler\(\)[\s\S]{0,400}socket\.on\("connect"/);
    // O pedido aberto é informado ao abrir e ao voltar para a lista.
    assert.match(fonte, /sincroniaDaEntrega\.definirPedidoAberto\(empresaId, resultado\.dados\.id\)/);
    assert.match(fonte, /sincroniaDaEntrega\.definirPedidoAberto\(empresaId, null\)/);
  });
});
