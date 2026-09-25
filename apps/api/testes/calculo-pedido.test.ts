import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GrupoOpcoesPublico } from "@jaa/contratos";
import { calcularItens, resolverPagamento } from "../src/features/pedidos/lib/calcular-pedido.js";
import type { ProdutoRegistro } from "../src/features/produtos/repositorios/repositorio-produtos.js";

/*
 * O SERVIDOR é a autoridade do dinheiro e da montagem. Estes testes são PUROS (sem banco) e cobrem
 * exatamente o que o navegador não pode decidir: preço unitário com acréscimos, mínimo e máximo de
 * cada grupo, opção que não pertence ao produto e o snapshot das escolhas.
 */

const produto = (id: string, nome: string, precoCentavos: number): ProdutoRegistro =>
  ({
    id,
    empresaId: "e0000000-0000-4000-8000-000000000000",
    nome,
    descricao: null,
    precoCentavos,
    disponibilidade: "disponivel",
    categoriaId: null,
    imagemChave: null,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  }) as ProdutoRegistro;

const prato = produto("11111111-0000-4000-8000-000000000000", "Monte seu prato", 2490);
const refrigerante = produto("22222222-0000-4000-8000-000000000000", "Refrigerante", 600);

const PEQUENO = "aaaa1111-0000-4000-8000-000000000000";
const GRANDE = "aaaa2222-0000-4000-8000-000000000000";
const ARROZ = "bbbb1111-0000-4000-8000-000000000000";
const FEIJAO = "bbbb2222-0000-4000-8000-000000000000";
const BATATA = "bbbb3333-0000-4000-8000-000000000000";

// Grupos como a EMPRESA cadastrou: tamanho obrigatório de escolha única, acompanhamentos até 2.
const tamanho: GrupoOpcoesPublico = {
  id: "g1111111-0000-4000-8000-000000000000",
  nome: "Tamanho",
  instrucao: null,
  minimoEscolhas: 1,
  maximoEscolhas: 1,
  opcoes: [
    { id: PEQUENO, nome: "Pequeno", precoAdicionalCentavos: 0 },
    { id: GRANDE, nome: "Grande", precoAdicionalCentavos: 500 },
  ],
};
const acompanhamentos: GrupoOpcoesPublico = {
  id: "g2222222-0000-4000-8000-000000000000",
  nome: "Acompanhamentos",
  instrucao: null,
  minimoEscolhas: 0,
  maximoEscolhas: 2,
  opcoes: [
    { id: ARROZ, nome: "Arroz", precoAdicionalCentavos: 0 },
    { id: FEIJAO, nome: "Feijão", precoAdicionalCentavos: 0 },
    { id: BATATA, nome: "Batata frita", precoAdicionalCentavos: 300 },
  ],
};
const grupos = new Map([[prato.id, [tamanho, acompanhamentos]]]);

describe("cálculo do pedido com montagem", () => {
  it("preço unitário = produto + acréscimos, e o subtotal multiplica pela quantidade", () => {
    const resultado = calcularItens([{ produtoId: prato.id, quantidade: 2, opcaoIds: [GRANDE, BATATA] }], [prato], grupos);
    assert.equal(resultado.tipo, "itens");
    if (resultado.tipo !== "itens") return;

    const item = resultado.itens[0]!;
    // 24,90 + 5,00 (Grande) + 3,00 (Batata) = 32,90 por unidade.
    assert.equal(item.precoUnitarioCentavos, 3290);
    assert.equal(item.subtotalCentavos, 6580);
    assert.equal(resultado.totalCentavos, 6580);
    assert.equal(item.nomeProduto, "Monte seu prato", "snapshot do nome");
  });

  it("as escolhas viram SNAPSHOT na ordem dos grupos, com nome e acréscimo do momento", () => {
    // Enviadas fora de ordem de propósito: quem ordena é o servidor, pela apresentação dos grupos.
    const resultado = calcularItens([{ produtoId: prato.id, quantidade: 1, opcaoIds: [ARROZ, GRANDE] }], [prato], grupos);
    assert.equal(resultado.tipo, "itens");
    if (resultado.tipo !== "itens") return;

    assert.deepEqual(
      resultado.itens[0]!.escolhas.map((escolha) => [escolha.grupoNome, escolha.opcaoNome, escolha.precoAdicionalCentavos, escolha.posicao]),
      [
        ["Tamanho", "Grande", 500, 0],
        ["Acompanhamentos", "Arroz", 0, 1],
      ],
    );
  });

  it("recusa grupo obrigatório vazio, dizendo QUAL grupo", () => {
    const resultado = calcularItens([{ produtoId: prato.id, quantidade: 1, opcaoIds: [ARROZ] }], [prato], grupos);
    assert.equal(resultado.tipo, "escolhas-invalidas");
    if (resultado.tipo !== "escolhas-invalidas") return;
    assert.equal(resultado.motivo, "faltam-escolhas");
    assert.equal(resultado.grupoNome, "Tamanho");
  });

  it("recusa mais escolhas do que o grupo permite, mesmo que a tela do cliente tenha sido alterada", () => {
    const resultado = calcularItens([{ produtoId: prato.id, quantidade: 1, opcaoIds: [GRANDE, ARROZ, FEIJAO, BATATA] }], [prato], grupos);
    assert.equal(resultado.tipo, "escolhas-invalidas");
    if (resultado.tipo !== "escolhas-invalidas") return;
    assert.equal(resultado.motivo, "escolhas-demais");
    assert.equal(resultado.grupoNome, "Acompanhamentos");
  });

  it("recusa duas escolhas em grupo de escolha única", () => {
    const resultado = calcularItens([{ produtoId: prato.id, quantidade: 1, opcaoIds: [PEQUENO, GRANDE] }], [prato], grupos);
    assert.equal(resultado.tipo, "escolhas-invalidas");
    if (resultado.tipo !== "escolhas-invalidas") return;
    assert.equal(resultado.grupoNome, "Tamanho");
  });

  it("recusa opção desconhecida e opção enviada para produto SEM grupos", () => {
    const inventada = calcularItens([{ produtoId: prato.id, quantidade: 1, opcaoIds: [GRANDE, "cccccccc-0000-4000-8000-000000000000"] }], [prato], grupos);
    assert.equal(inventada.tipo, "escolhas-invalidas");
    if (inventada.tipo === "escolhas-invalidas") assert.equal(inventada.motivo, "opcao-desconhecida");

    // Produto comum não aceita opção nenhuma: ignorar em silêncio esconderia um cliente enganado.
    const semGrupos = calcularItens([{ produtoId: refrigerante.id, quantidade: 1, opcaoIds: [GRANDE] }], [refrigerante], grupos);
    assert.equal(semGrupos.tipo, "escolhas-invalidas");
    if (semGrupos.tipo === "escolhas-invalidas") assert.equal(semGrupos.motivo, "opcao-desconhecida");
  });

  it("MESMA montagem repetida é recusada; montagens DIFERENTES do mesmo produto são dois itens", () => {
    const repetida = calcularItens(
      [
        { produtoId: prato.id, quantidade: 1, opcaoIds: [GRANDE] },
        { produtoId: prato.id, quantidade: 1, opcaoIds: [GRANDE] },
      ],
      [prato],
      grupos,
    );
    assert.equal(repetida.tipo, "itens-invalidos");
    if (repetida.tipo === "itens-invalidos") assert.equal(repetida.motivo, "produto-repetido");

    const distintas = calcularItens(
      [
        { produtoId: prato.id, quantidade: 1, opcaoIds: [GRANDE] },
        { produtoId: prato.id, quantidade: 1, opcaoIds: [PEQUENO] },
      ],
      [prato],
      grupos,
    );
    assert.equal(distintas.tipo, "itens");
    if (distintas.tipo !== "itens") return;
    assert.deepEqual(distintas.itens.map((item) => item.precoUnitarioCentavos), [2990, 2490]);
    assert.equal(distintas.totalCentavos, 5480);
  });

  it("produto comum continua funcionando exatamente como antes, sem grupos nenhum", () => {
    const resultado = calcularItens([{ produtoId: refrigerante.id, quantidade: 3 }], [refrigerante], new Map());
    assert.equal(resultado.tipo, "itens");
    if (resultado.tipo !== "itens") return;
    assert.equal(resultado.itens[0]!.precoUnitarioCentavos, 600);
    assert.equal(resultado.itens[0]!.subtotalCentavos, 1800);
    assert.deepEqual(resultado.itens[0]!.escolhas, []);
  });

  it("produto indisponível ou de outra empresa não entra, mesmo com montagem válida", () => {
    const resultado = calcularItens([{ produtoId: prato.id, quantidade: 1, opcaoIds: [GRANDE] }], [], grupos);
    assert.equal(resultado.tipo, "itens-invalidos");
    if (resultado.tipo === "itens-invalidos") assert.equal(resultado.motivo, "produto-indisponivel-ou-de-outra-empresa");
  });

  it("o troco continua sendo conferido contra o total JÁ com acréscimos", () => {
    const resultado = calcularItens([{ produtoId: prato.id, quantidade: 1, opcaoIds: [GRANDE] }], [prato], grupos);
    assert.equal(resultado.tipo, "itens");
    if (resultado.tipo !== "itens") return;

    // Total 29,90: troco para 25,00 seria menor que a conta.
    assert.equal(resolverPagamento({ forma: "dinheiro", trocoParaCentavos: 2500 }, resultado.totalCentavos).tipo, "pagamento-invalido");
    assert.deepEqual(resolverPagamento({ forma: "dinheiro", trocoParaCentavos: 5000 }, resultado.totalCentavos), { tipo: "pagamento", trocoParaCentavos: 5000 });
    // Troco igual ao total não é troco.
    assert.deepEqual(resolverPagamento({ forma: "dinheiro", trocoParaCentavos: 2990 }, resultado.totalCentavos), { tipo: "pagamento", trocoParaCentavos: null });
  });

  it("a OBSERVAÇÃO entra no snapshot do item e não mexe no preço", () => {
    const resultado = calcularItens([{ produtoId: prato.id, quantidade: 1, opcaoIds: [GRANDE], observacao: "sem cebola" }], [prato], grupos);
    assert.equal(resultado.tipo, "itens");
    if (resultado.tipo !== "itens") return;
    assert.equal(resultado.itens[0]!.observacao, "sem cebola");
    // 24,90 + 5,00 (Grande): observação é instrução de preparo, não item cobrável.
    assert.equal(resultado.itens[0]!.precoUnitarioCentavos, 2990);

    const semObservacao = calcularItens([{ produtoId: prato.id, quantidade: 1, opcaoIds: [GRANDE] }], [prato], grupos);
    assert.equal(semObservacao.tipo, "itens");
    if (semObservacao.tipo !== "itens") return;
    assert.equal(semObservacao.itens[0]!.observacao, null, "ausente vira null, nunca string vazia");
    assert.equal(semObservacao.totalCentavos, resultado.totalCentavos);
  });

  it("mesma montagem com observações DIFERENTES são dois itens; iguais são recusadas como repetição", () => {
    const distintas = calcularItens(
      [
        { produtoId: prato.id, quantidade: 1, opcaoIds: [GRANDE], observacao: "sem cebola" },
        { produtoId: prato.id, quantidade: 1, opcaoIds: [GRANDE] },
      ],
      [prato],
      grupos,
    );
    assert.equal(distintas.tipo, "itens", "para quem prepara, são pedidos diferentes");
    if (distintas.tipo !== "itens") return;
    assert.deepEqual(distintas.itens.map((item) => item.observacao), ["sem cebola", null]);

    const repetidas = calcularItens(
      [
        { produtoId: prato.id, quantidade: 1, opcaoIds: [GRANDE], observacao: "sem cebola" },
        { produtoId: prato.id, quantidade: 1, opcaoIds: [GRANDE], observacao: "sem cebola" },
      ],
      [prato],
      grupos,
    );
    assert.equal(repetidas.tipo, "itens-invalidos");
    if (repetidas.tipo === "itens-invalidos") assert.equal(repetidas.motivo, "produto-repetido");
  });

  it("produto comum também aceita observação, sem opções", () => {
    const resultado = calcularItens([{ produtoId: refrigerante.id, quantidade: 2, observacao: "bem gelado" }], [refrigerante], new Map());
    assert.equal(resultado.tipo, "itens");
    if (resultado.tipo !== "itens") return;
    assert.equal(resultado.itens[0]!.observacao, "bem gelado");
    assert.deepEqual(resultado.itens[0]!.escolhas, []);
  });
});