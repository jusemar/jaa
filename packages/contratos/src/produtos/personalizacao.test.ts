import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  criarGrupoOpcoesEntradaSchema,
  criarOpcaoEntradaSchema,
  grupoDeEscolhaUnica,
  grupoDeVariacaoBase,
  grupoObrigatorio,
  grupoOpcoesPublicoSchema,
  precoUnitarioComEscolhas,
  validarEscolhas,
  type GrupoOpcoesPublico,
} from "./personalizacao.ts";

/*
 * A REGRA da montagem é compartilhada: o servidor a executa como autoridade e a interface a executa
 * para habilitar o botão. Por isso ela vive no contrato e é testada aqui, uma vez.
 */

const uuid = (n: number) => `01a0a394-6225-75f2-b809-b269099${String(n).padStart(5, "0")}`;

const tamanho: GrupoOpcoesPublico = {
  id: uuid(1),
  nome: "Tamanho",
  instrucao: null,
  minimoEscolhas: 1,
  maximoEscolhas: 1,
  opcoes: [
    { id: uuid(10), nome: "Pequeno", precoAdicionalCentavos: 0 },
    { id: uuid(11), nome: "Grande", precoAdicionalCentavos: 500 },
  ],
};

const acompanhamentos: GrupoOpcoesPublico = {
  id: uuid(2),
  nome: "Acompanhamentos",
  instrucao: "Valem para os dois tamanhos.",
  minimoEscolhas: 0,
  maximoEscolhas: 2,
  opcoes: [
    { id: uuid(20), nome: "Arroz", precoAdicionalCentavos: 0 },
    { id: uuid(21), nome: "Feijão", precoAdicionalCentavos: 0 },
    { id: uuid(22), nome: "Batata frita", precoAdicionalCentavos: 300 },
  ],
};

// Segundo grupo de escolha única: refinamento DENTRO da versão escolhida, não a versão em si.
const carne: GrupoOpcoesPublico = {
  id: uuid(3),
  nome: "Carne",
  instrucao: null,
  minimoEscolhas: 1,
  maximoEscolhas: 1,
  opcoes: [
    { id: uuid(30), nome: "Bife bovino", precoAdicionalCentavos: 0 },
    { id: uuid(31), nome: "Peixe", precoAdicionalCentavos: 300 },
  ],
};

const grupos = [tamanho, acompanhamentos];

describe("grupos de opções: mínimo e máximo descrevem sozinhos o comportamento", () => {
  it("obrigatório é mínimo ≥ 1 e escolha única é máximo = 1 — sem campo que possa contradizer", () => {
    assert.equal(grupoObrigatorio(tamanho), true);
    assert.equal(grupoDeEscolhaUnica(tamanho), true);
    assert.equal(grupoObrigatorio(acompanhamentos), false);
    assert.equal(grupoDeEscolhaUnica(acompanhamentos), false);
    // Grupo de escolha única e OPCIONAL é legítimo: mínimo 0, máximo 1.
    assert.equal(grupoObrigatorio({ minimoEscolhas: 0 }), false);
    assert.equal(grupoDeEscolhaUnica({ maximoEscolhas: 1 }), true);
  });

  it("variação base é o PRIMEIRO grupo de escolha única, pela ordem da empresa — nunca pelo nome", () => {
    /*
     * É ela que define QUAL versão do item está sendo montada, então a interface mostra o preço
     * FINAL de cada alternativa dela e apenas o acréscimo nos demais grupos. A distinção vem de
     * `maximoEscolhas` + ordem: o domínio não conhece "Tamanho".
     */
    assert.equal(grupoDeVariacaoBase([tamanho, carne, acompanhamentos]), tamanho);
    // Trocada a ordem, a variação base é a outra: quem decide é o cadastro, não um nome no código.
    assert.equal(grupoDeVariacaoBase([carne, tamanho]), carne);
    // Grupo de múltipla escolha nunca é a variação base, mesmo vindo primeiro.
    assert.equal(grupoDeVariacaoBase([acompanhamentos, carne]), carne);
    // Produto sem nenhuma escolha única não tem variação base (e aí nenhum grupo mostra preço final).
    assert.equal(grupoDeVariacaoBase([acompanhamentos]), null);
    assert.equal(grupoDeVariacaoBase([]), null);
  });

  it("o contrato recusa faixa incoerente e grupo que não aceita escolha nenhuma", () => {
    assert.equal(criarGrupoOpcoesEntradaSchema.safeParse({ nome: "X", minimoEscolhas: 3, maximoEscolhas: 2 }).success, false);
    assert.equal(criarGrupoOpcoesEntradaSchema.safeParse({ nome: "X", maximoEscolhas: 0 }).success, false);
    // Padrão: opcional e de escolha única.
    const padrao = criarGrupoOpcoesEntradaSchema.parse({ nome: "  Tamanho  " });
    assert.deepEqual([padrao.nome, padrao.minimoEscolhas, padrao.maximoEscolhas], ["Tamanho", 0, 1]);
  });

  it("acréscimo é inteiro de centavos, nunca fração, string ou negativo", () => {
    assert.equal(criarOpcaoEntradaSchema.parse({ nome: "Grande", precoAdicionalCentavos: 500 }).precoAdicionalCentavos, 500);
    // Sem acréscimo informado = 0 (a opção não muda o preço).
    assert.equal(criarOpcaoEntradaSchema.parse({ nome: "Pequeno" }).precoAdicionalCentavos, 0);
    for (const valor of [5.5, "500", -1]) {
      assert.equal(criarOpcaoEntradaSchema.safeParse({ nome: "X", precoAdicionalCentavos: valor }).success, false, `${valor}`);
    }
  });

  it("grupo público exige ao menos uma opção: um grupo vazio não é oferecido ao cliente", () => {
    assert.equal(grupoOpcoesPublicoSchema.safeParse({ ...tamanho, opcoes: [] }).success, false);
  });
});

describe("validarEscolhas", () => {
  it("aceita o que cabe na faixa de cada grupo", () => {
    assert.deepEqual(validarEscolhas(grupos, [uuid(11)]), { valido: true });
    assert.deepEqual(validarEscolhas(grupos, [uuid(11), uuid(20), uuid(21)]), { valido: true });
    // Sem grupo nenhum, não escolher nada é válido (produto comum).
    assert.deepEqual(validarEscolhas([], []), { valido: true });
  });

  it("recusa grupo obrigatório vazio, dizendo qual grupo", () => {
    const resultado = validarEscolhas(grupos, [uuid(20)]);
    assert.equal(resultado.valido, false);
    if (resultado.valido) return;
    assert.equal(resultado.motivo, "faltam-escolhas");
    assert.equal(resultado.grupoNome, "Tamanho");
    assert.equal(resultado.grupoId, tamanho.id);
  });

  it("recusa passar do máximo, inclusive duas opções em grupo de escolha única", () => {
    const demais = validarEscolhas(grupos, [uuid(11), uuid(20), uuid(21), uuid(22)]);
    assert.equal(demais.valido, false);
    if (!demais.valido) assert.equal(demais.grupoNome, "Acompanhamentos");

    const doisTamanhos = validarEscolhas(grupos, [uuid(10), uuid(11)]);
    assert.equal(doisTamanhos.valido, false);
    if (!doisTamanhos.valido) assert.equal(doisTamanhos.grupoNome, "Tamanho");
  });

  it("recusa opção que não pertence a nenhum grupo do produto", () => {
    const resultado = validarEscolhas(grupos, [uuid(11), uuid(99)]);
    assert.equal(resultado.valido, false);
    if (!resultado.valido) assert.equal(resultado.motivo, "opcao-desconhecida");
    // Produto SEM grupos não aceita opção nenhuma.
    assert.equal(validarEscolhas([], [uuid(11)]).valido, false);
  });
});

describe("precoUnitarioComEscolhas", () => {
  it("soma os acréscimos das opções escolhidas ao preço base, em centavos inteiros", () => {
    assert.equal(precoUnitarioComEscolhas(2490, grupos, []), 2490);
    assert.equal(precoUnitarioComEscolhas(2490, grupos, [uuid(10)]), 2490, "opção sem acréscimo não muda nada");
    assert.equal(precoUnitarioComEscolhas(2490, grupos, [uuid(11)]), 2990);
    assert.equal(precoUnitarioComEscolhas(2490, grupos, [uuid(11), uuid(22)]), 3290);
    // Opção desconhecida não entra na conta (quem recusa a tentativa é validarEscolhas).
    assert.equal(precoUnitarioComEscolhas(2490, grupos, [uuid(99)]), 2490);
  });
});
