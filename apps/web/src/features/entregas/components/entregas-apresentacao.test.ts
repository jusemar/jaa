import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EntregaAtribuida, EntregaDoPedido, EntregadorDaEmpresa, StatusPedido, VinculoEntregador } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EmpresasEmQueTrabalho, ListaMinhasEntregas } from "./area-minhas-entregas.tsx";
import { EntregaDoPedidoEmpresa } from "./entrega-do-pedido.tsx";
import { ListaEntregadores } from "./quadro-entregadores.tsx";

const texto = (html: string) => html.replace(/<[^>]+>/g, "").replace(/ /g, " ");
const uuid = (n: number) => `${String(n).repeat(8)}-0000-4000-8000-000000000000`;

const pessoa = (nome: string, usuario: string) => ({ identidadeId: uuid(nome.length), tipo: "pessoal" as const, nomeExibicao: nome, nomeUsuario: usuario });

const paulo: EntregadorDaEmpresa = { id: uuid(1), pessoa: pessoa("Paulo Entregador", "paulo"), status: "ativo", disponivel: true, convidadoEm: "2026-09-16T12:00:00.000Z", respondidoEm: "2026-09-16T12:05:00.000Z" };
const joao: EntregadorDaEmpresa = { ...paulo, id: uuid(2), pessoa: pessoa("João Entregador", "joao"), status: "inativo" };
const convidado: EntregadorDaEmpresa = { ...paulo, id: uuid(3), pessoa: pessoa("Carlos Entregador", "carlos"), status: "convidado", respondidoEm: null };

describe("quadro de entregadores da empresa", () => {
  const lista = (entregadores: EntregadorDaEmpresa[]) => renderToStaticMarkup(createElement(ListaEntregadores, { entregadores, ocupado: false, aoAlterarStatus: () => {} }));

  it("mostra nome público, @usuario e status de cada vínculo", () => {
    const html = lista([paulo, joao, convidado]);
    const conteudo = texto(html);
    for (const esperado of ["Paulo Entregador", "@paulo", "Vínculo: Ativo", "João Entregador", "Vínculo: Inativo", "Carlos Entregador", "Convite enviado"]) {
      assert.ok(conteudo.includes(esperado), esperado);
    }
    // Só identidade pública: nunca telefone nem dados de conta.
    assert.equal(conteudo.includes("+55"), false);
  });

  it("ativo pode ser desativado, inativo reativado e convite pendente não é ativado pela empresa", () => {
    assert.ok(texto(lista([paulo])).includes("Desativar"));
    assert.ok(texto(lista([joao])).includes("Ativar"));
    assert.equal(lista([convidado]).includes("data-alternar-entregador"), false);
  });

  it("distingue ATIVO+DISPONÍVEL, ATIVO+INDISPONÍVEL e INATIVO", () => {
    const indisponivel: EntregadorDaEmpresa = { ...paulo, id: uuid(9), pessoa: pessoa("Carlos Entregador", "carlos"), disponivel: false };
    const conteudo = texto(lista([paulo, indisponivel, joao]));
    assert.ok(conteudo.includes("Disponibilidade: 🟢 Disponível"));
    assert.ok(conteudo.includes("Disponibilidade: ⚪ Indisponível"));
    // Vínculo inativo nem fala de disponibilidade (não é decisão pendente dele).
    assert.equal(texto(lista([joao])).includes("Disponibilidade"), false);
  });

  it("empresa sem entregadores vê o estado vazio", () => {
    assert.ok(texto(lista([])).includes("Nenhum entregador ainda."));
  });
});

describe("entrega no detalhe do pedido", () => {
  const entrega = (parcial: Partial<EntregaDoPedido> = {}): EntregaDoPedido => ({
    entregadorAtual: { id: paulo.id, pessoa: paulo.pessoa, status: "ativo", disponivel: true, atribuidoEm: "2026-09-16T14:30:00.000Z" },
    historico: [
      { id: uuid(4), entregador: paulo.pessoa, atribuidoEm: "2026-09-16T14:30:00.000Z", encerradoEm: null, motivoEncerramento: null },
    ],
    ...parcial,
  });

  const render = (status: StatusPedido, dados: EntregaDoPedido | null, ativos: EntregadorDaEmpresa[] = [paulo]) =>
    renderToStaticMarkup(createElement(EntregaDoPedidoEmpresa, { status, entrega: dados, entregadoresAtivos: ativos, ocupado: false, aoAtribuir: () => {} }));

  it("pedido pronto sem entregador oferece atribuir", () => {
    const html = render("pronto", { entregadorAtual: null, historico: [] });
    assert.ok(texto(html).includes("Nenhum"));
    assert.ok(texto(html).includes("Atribuir entregador"));
  });

  it("com entregador mostra quem está levando e permite trocar", () => {
    const conteudo = texto(render("saiu_para_entrega", entrega()));
    assert.ok(conteudo.includes("Paulo Entregador (@paulo)"));
    assert.ok(conteudo.includes("Trocar entregador"));
  });

  it("status sem entrega (recebido, entregue, cancelado) não oferece atribuição", () => {
    for (const status of ["recebido", "confirmado", "em_preparacao", "entregue", "cancelado"] as const) {
      assert.equal(render(status, entrega()).includes("data-atribuir-entregador"), false, status);
    }
  });

  it("histórico preserva quem esteve atribuído antes, com o motivo do encerramento", () => {
    const comTroca = entrega({
      entregadorAtual: { id: joao.id, pessoa: joao.pessoa, status: "ativo", disponivel: true, atribuidoEm: "2026-09-16T14:45:00.000Z" },
      historico: [
        { id: uuid(4), entregador: paulo.pessoa, atribuidoEm: "2026-09-16T14:30:00.000Z", encerradoEm: "2026-09-16T14:45:00.000Z", motivoEncerramento: "Reatribuído a outro entregador" },
        { id: uuid(5), entregador: joao.pessoa, atribuidoEm: "2026-09-16T14:45:00.000Z", encerradoEm: null, motivoEncerramento: null },
      ],
    });
    const conteudo = texto(render("em_rota", comTroca, [paulo, joao]));
    assert.ok(conteudo.includes("Paulo Entregador"));
    assert.ok(conteudo.includes("Reatribuído a outro entregador"));
    assert.ok(conteudo.includes("João Entregador"));
  });
});

describe("empresas em que trabalho (disponibilidade do entregador)", () => {
  const vinculo = (nome: string, status: VinculoEntregador["status"], disponivel: boolean): VinculoEntregador => ({
    id: uuid(nome.length),
    empresa: { identidadeId: uuid(2), nome, nomeUsuario: nome.toLowerCase().replace(/\W/g, ""), slug: nome.toLowerCase().replace(/\W/g, "-") },
    status,
    disponivel,
    disponibilidadeAtualizadaEm: disponivel ? "2026-09-16T12:00:00.000Z" : null,
  });

  const render = (vinculos: VinculoEntregador[]) =>
    renderToStaticMarkup(createElement(EmpresasEmQueTrabalho, { vinculos, ocupado: false, aoAlterarDisponibilidade: () => {} }));

  it("mostra a disponibilidade POR EMPRESA, com a ação inversa em cada uma", () => {
    const html = render([vinculo("Pizzaria A", "ativo", true), vinculo("Pizzaria B", "ativo", false)]);
    const conteudo = texto(html);
    assert.ok(conteudo.includes("Pizzaria A"));
    assert.ok(conteudo.includes("🟢 Disponível"));
    assert.ok(conteudo.includes("Ficar indisponível"));
    assert.ok(conteudo.includes("Pizzaria B"));
    assert.ok(conteudo.includes("⚪ Indisponível"));
    assert.ok(conteudo.includes("Ficar disponível"));
    assert.equal((html.match(/data-alternar-disponibilidade/g) ?? []).length, 2, "cada empresa tem seu próprio controle");
  });

  it("vínculo inativo aparece como inativo e não oferece disponibilidade", () => {
    const html = render([vinculo("Pizzaria C", "inativo", false)]);
    assert.ok(texto(html).includes("Inativo"));
    assert.equal(html.includes("data-alternar-disponibilidade"), false);
    assert.equal(html.includes('data-disponibilidade'), false);
  });

  it("convite pendente também não escolhe disponibilidade", () => {
    const html = render([vinculo("Pizzaria D", "convidado", false)]);
    assert.ok(texto(html).includes("Convite enviado"));
    assert.equal(html.includes("data-alternar-disponibilidade"), false);
  });
});

describe("minhas entregas (área do entregador)", () => {
  const entrega: EntregaAtribuida = {
    pedidoId: uuid(6),
    empresa: { identidadeId: uuid(7), nome: "Pizzaria BH", nomeUsuario: "pizzariabh", slug: "pizzaria-bh" },
    status: "saiu_para_entrega",
    destino: {
      enderecoId: uuid(8),
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
      localizacaoConfirmadaEm: "2026-09-16T11:55:00.000Z",
    },
    cliente: pessoa("Bruna Cliente", "bruna"),
    itens: [{ nomeProduto: "Pizza Calabresa", quantidade: 2 }],
    totalCentavos: 7980,
    formaPagamentoNaEntrega: "dinheiro",
    trocoParaCentavos: 10000,
    atribuidoEm: "2026-09-16T14:30:00.000Z",
  };

  const lista = (entregas: EntregaAtribuida[]) => renderToStaticMarkup(createElement(ListaMinhasEntregas, { entregas }));

  it("mostra o necessário para entregar: empresa, endereço, cliente, itens e pagamento", () => {
    const html = lista([entrega]);
    const conteudo = texto(html);
    for (const esperado of ["Pizzaria BH", "Rua das Flores, 150 — Apto 302", "Centro, Belo Horizonte/MG", "CEP 30123-000", "Referência: Portão azul", "Cliente: Bruna Cliente", "2× Pizza Calabresa", "R$ 79,80", "Dinheiro na entrega", "Troco para R$ 100,00", "Saiu para entrega"]) {
      assert.ok(conteudo.includes(esperado), esperado);
    }
    assert.ok(conteudo.includes("📍 Ponto de entrega confirmado"));
  });

  it("cartão na entrega não mostra troco", () => {
    const conteudo = texto(lista([{ ...entrega, formaPagamentoNaEntrega: "cartao", trocoParaCentavos: null }]));
    assert.ok(conteudo.includes("Cartão na entrega"));
    assert.equal(conteudo.includes("Troco"), false);
  });

  it("abre o ponto no mapa usando a coordenada snapshot, sem exibir números crus", () => {
    const html = lista([entrega]);
    assert.ok(html.includes("data-abrir-no-mapa"));
    assert.ok(html.includes("mlat=-19.919125"), "o link usa o ponto confirmado do pedido");
    assert.equal(texto(html).includes("-19.919125"), false, "coordenada crua não é texto para humano");
  });

  it("sem entregas atribuídas explica o estado vazio", () => {
    assert.ok(texto(lista([])).includes("Nenhuma entrega atribuída a você agora."));
  });
});
