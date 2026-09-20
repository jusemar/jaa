import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ROTULO_STATUS_ENTREGADOR,
  atribuirEntregaEntradaSchema,
  convidarEntregadorEntradaSchema,
  entregaAtribuidaSchema,
  entregaEstaAtiva,
  entregadorDaEmpresaSchema,
  entregadorPodeEscolherDisponibilidade,
  entregadorPodeOperar,
  entregadorPodeReceberAtribuicao,
  statusEntregadorSchema,
  alterarDisponibilidadeEntradaSchema,
  vinculoEntregadorSchema,
} from "./entregador.ts";

const uuid = "01a0a394-6225-75f2-b809-b2690993c512";

describe("vínculo de entregador", () => {
  it("tem três estados e só o ativo opera entregas", () => {
    assert.deepEqual(statusEntregadorSchema.options, ["convidado", "ativo", "inativo"]);
    assert.equal(entregadorPodeOperar("ativo"), true);
    assert.equal(entregadorPodeOperar("convidado"), false, "convite pendente não entrega");
    assert.equal(entregadorPodeOperar("inativo"), false);
    assert.equal(ROTULO_STATUS_ENTREGADOR.convidado, "Convite enviado");
  });

  it("convite é pelo @usuario público, normalizado", () => {
    assert.equal(convidarEntregadorEntradaSchema.parse({ nomeUsuario: "@Paulo" }).nomeUsuario, "paulo");
    assert.equal(convidarEntregadorEntradaSchema.safeParse({ nomeUsuario: "" }).success, false);
    // Nada de procurar pessoa por telefone.
    assert.equal(convidarEntregadorEntradaSchema.safeParse({ telefone: "+5531987650001" }).success, false);
  });

  it("a empresa vê apenas a identidade pública do entregador", () => {
    const entregador = entregadorDaEmpresaSchema.parse({
      id: uuid,
      pessoa: { identidadeId: uuid, tipo: "pessoal", nomeExibicao: "Paulo Entregador", nomeUsuario: "paulo" },
      status: "ativo",
      disponivel: true,
      convidadoEm: "2026-09-16T12:00:00.000Z",
      respondidoEm: "2026-09-16T12:05:00.000Z",
    });
    assert.deepEqual(Object.keys(entregador.pessoa).sort(), ["identidadeId", "nomeExibicao", "nomeUsuario", "tipo"]);
    assert.equal(JSON.stringify(entregador).includes("telefone"), false);
  });

  it("atribuição indica o entregador escolhido e o que a tela via (concorrência)", () => {
    assert.equal(atribuirEntregaEntradaSchema.safeParse({ entregadorId: uuid }).success, true);
    assert.equal(atribuirEntregaEntradaSchema.safeParse({ entregadorId: uuid, entregadorAtualId: null }).success, true);
    assert.equal(atribuirEntregaEntradaSchema.safeParse({ entregadorId: "paulo" }).success, false);
  });
});

describe("vínculo x disponibilidade", () => {
  it("vínculo ativo permite operar, mas só ativo E disponível recebe NOVA atribuição", () => {
    assert.equal(entregadorPodeOperar("ativo"), true);
    assert.equal(entregadorPodeReceberAtribuicao({ status: "ativo", disponivel: true }), true);
    // Ativo e indisponível continua entregador: só não recebe pedido novo.
    assert.equal(entregadorPodeReceberAtribuicao({ status: "ativo", disponivel: false }), false);
    for (const status of ["convidado", "inativo"] as const) {
      assert.equal(entregadorPodeReceberAtribuicao({ status, disponivel: true }), false, status);
      assert.equal(entregadorPodeEscolherDisponibilidade(status), false, status);
    }
    assert.equal(entregadorPodeEscolherDisponibilidade("ativo"), true);
  });

  it("a disponibilidade vive no vínculo (por empresa), nunca na pessoa", () => {
    const vinculo = { id: uuid, empresa: { identidadeId: uuid, nome: "Pizzaria A", nomeUsuario: "pizzaria_a", slug: "pizzaria-a" }, status: "ativo" as const, disponivel: true, disponibilidadeAtualizadaEm: "2026-09-16T12:00:00.000Z" };
    assert.equal(vinculoEntregadorSchema.safeParse(vinculo).success, true);
    assert.equal(vinculoEntregadorSchema.safeParse({ ...vinculo, disponivel: "sim" }).success, false);
    // Alterar disponibilidade é só um booleano — nada de status do vínculo junto.
    assert.equal(alterarDisponibilidadeEntradaSchema.safeParse({ disponivel: false }).success, true);
    assert.equal(alterarDisponibilidadeEntradaSchema.safeParse({ status: "inativo" }).success, false);
  });
});

describe("entrega vista pelo entregador", () => {
  const entrega = {
    pedidoId: uuid,
    numeroPedido: 3,
    empresa: { identidadeId: uuid, nome: "Pizzaria BH", nomeUsuario: "pizzariabh", slug: "pizzaria-bh" },
    status: "saiu_para_entrega",
    destino: {
      enderecoId: uuid,
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
    cliente: { identidadeId: uuid, tipo: "pessoal", nomeExibicao: "Bruna Cliente", nomeUsuario: "bruna" },
    itens: [{ nomeProduto: "Pizza Calabresa", quantidade: 2 }],
    totalCentavos: 7980,
    formaPagamentoNaEntrega: "dinheiro",
    trocoParaCentavos: 10000,
    atribuidoEm: "2026-09-16T12:10:00.000Z",
  };

  it("traz destino com ponto confirmado, cliente público e como receber na entrega", () => {
    const valida = entregaAtribuidaSchema.parse(entrega);
    assert.equal(valida.destino.latitude, -19.919125);
    assert.equal(valida.trocoParaCentavos, 10000);
    assert.equal(valida.itens[0]?.quantidade, 2);
  });

  it("entrega sem ponto confirmado não é entregável", () => {
    assert.equal(entregaAtribuidaSchema.safeParse({ ...entrega, destino: { ...entrega.destino, latitude: null } }).success, false);
    assert.equal(entregaAtribuidaSchema.safeParse({ ...entrega, destino: null }).success, false);
  });

  it("não expõe preço unitário, telefone nem dados de conta do cliente", () => {
    const valida = entregaAtribuidaSchema.parse({ ...entrega, telefoneCliente: "+5531987650001", itens: [{ nomeProduto: "Pizza", quantidade: 1, precoUnitarioCentavos: 3990 }] });
    assert.equal("telefoneCliente" in valida, false);
    assert.equal("precoUnitarioCentavos" in (valida.itens[0] ?? {}), false);
  });

  it("entregas ativas são as que ainda estão em operação", () => {
    for (const status of ["pronto", "saiu_para_entrega", "em_rota"] as const) assert.equal(entregaEstaAtiva(status), true, status);
    for (const status of ["recebido", "confirmado", "em_preparacao", "entregue", "cancelado"] as const) assert.equal(entregaEstaAtiva(status), false, status);
  });
});
