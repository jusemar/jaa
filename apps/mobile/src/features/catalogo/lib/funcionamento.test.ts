import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { calcularFuncionamento, type DiaSemana, type FuncionamentoPublico, type PeriodoFuncionamento } from "@jaa/contratos";
import { acaoOuExplicacao, ehEmpresaFechada, motivoDoBloqueio, selo, semanaDeFuncionamento } from "./funcionamento.ts";

/*
 * Aberto/fechado no app. Os estados são produzidos pela MESMA regra do servidor
 * (`calcularFuncionamento`, com instante fixo) — o Mobile só decide o que mostrar com o que recebe.
 */
const fonte = (arquivo: string) => readFileSync(new URL(arquivo, import.meta.url), "utf8");
const semComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
const p = (diaSemana: number, inicio: string, fim: string): PeriodoFuncionamento => ({ diaSemana: diaSemana as DiaSemana, inicio, fim });
// Segunda em dois períodos, terça direto, quarta fechada, sábado passando da meia-noite.
const SEMANA = [p(1, "08:00", "14:00"), p(1, "18:00", "23:00"), p(2, "08:00", "23:00"), p(6, "18:00", "02:00")];
// 05/10/2026 é segunda; São Paulo = UTC−3. É o que o SERVIDOR devolveria nesse instante.
const doServidor = (dia: number, hora: string, ativo = true): FuncionamentoPublico => {
  const { estado, hoje } = calcularFuncionamento({ ativo, periodos: SEMANA }, new Date(`2026-10-${String(4 + dia).padStart(2, "0")}T${hora}:00-03:00`), "America/Sao_Paulo");
  return { estado, hoje, semana: ativo ? SEMANA : [] };
};

describe("selo no topo do cardápio", () => {
  it("aberta: 'Aberto agora · até 14:00'", () => {
    assert.deepEqual(selo(doServidor(1, "10:00")), { aberto: true, texto: "Aberto agora · até 14:00" });
  });

  it("fechada com próxima abertura HOJE (ainda não abriu)", () => {
    assert.deepEqual(selo(doServidor(1, "06:00")), { aberto: false, texto: "Fechado · abre hoje às 08:00" });
  });

  it("fechada no intervalo entre dois períodos do dia", () => {
    assert.deepEqual(selo(doServidor(1, "15:00")), { aberto: false, texto: "Fechado · abre hoje às 18:00" });
    assert.equal(selo(doServidor(1, "19:00"))?.texto, "Aberto agora · até 23:00", "o segundo período do dia abre de novo");
  });

  it("fechada com próxima abertura AMANHÃ", () => {
    assert.deepEqual(selo(doServidor(1, "23:30")), { aberto: false, texto: "Fechado · abre amanhã às 08:00" });
  });

  it("dia fechado: aponta o próximo dia com período, pelo nome", () => {
    assert.deepEqual(selo(doServidor(3, "12:00")), { aberto: false, texto: "Fechado · abre sábado às 18:00" });
  });

  it("empresa que não controla horário, ou estado ainda desconhecido: nada a mostrar", () => {
    assert.equal(selo(doServidor(3, "12:00", false)), null);
    assert.equal(selo(null), null);
    assert.equal(selo(undefined), null);
  });
});

describe("horários da semana", () => {
  it("Segunda a Domingo, com os períodos do dia ou 'Fechado', e hoje marcado", () => {
    const linhas = semanaDeFuncionamento(doServidor(1, "10:00"));
    assert.deepEqual(linhas.map((linha) => linha.rotulo), ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]);
    assert.deepEqual(linhas.map((linha) => linha.horarios), ["08:00–14:00 · 18:00–23:00", "08:00–23:00", "Fechado", "Fechado", "Fechado", "18:00–02:00", "Fechado"]);
    assert.deepEqual(linhas.filter((linha) => linha.hoje).map((linha) => linha.dia), [1]);
    assert.deepEqual(linhas.filter((linha) => linha.fechado).map((linha) => linha.dia), [3, 4, 5, 7]);
  });

  it("'hoje' é o dia que o SERVIDOR informou (fuso da empresa), não o do aparelho", () => {
    assert.deepEqual(semanaDeFuncionamento(doServidor(6, "20:00")).filter((linha) => linha.hoje).map((linha) => linha.rotulo), ["Sábado"]);
  });
});

describe("pedir com a empresa fechada", () => {
  it("o motivo é o texto do servidor, com a próxima abertura", () => {
    assert.equal(motivoDoBloqueio(doServidor(1, "23:30")), "Esta empresa está fechada agora. Abre amanhã às 08:00.");
    assert.equal(motivoDoBloqueio(doServidor(1, "15:00")), "Esta empresa está fechada agora. Abre novamente hoje às 18:00.");
  });

  it("aberta, sem controle de horário ou ainda sem resposta: não há bloqueio", () => {
    assert.equal(motivoDoBloqueio(doServidor(1, "10:00")), null);
    assert.equal(motivoDoBloqueio(doServidor(3, "12:00", false)), null);
    assert.equal(motivoDoBloqueio(null), null);
  });

  it("tocar na ação indisponível EXPLICA e não executa; aberta, executa normalmente", () => {
    let explicou = 0;
    let pediu = 0;
    acaoOuExplicacao({ motivo: "Fechada", aoExplicar: () => (explicou += 1) }, () => (pediu += 1))();
    assert.deepEqual([explicou, pediu], [1, 0]);
    acaoOuExplicacao(undefined, () => (pediu += 1))();
    assert.deepEqual([explicou, pediu], [1, 1], "pedido normal quando aberta");
  });

  it("os botões de pedir não ficam `disabled` quando fechada: parecem indisponíveis e continuam tocáveis", () => {
    const montagem = semComentarios(fonte("../components/montagem-produto.tsx"));
    assert.ok(montagem.includes("disabled={!bloqueio && !validacao.valido}") && montagem.includes("onPress={acaoOuExplicacao(bloqueio, adicionar)}"));
    const cardapio = semComentarios(fonte("../components/catalogo-apresentacao.tsx"));
    assert.equal([...cardapio.matchAll(/onPress=\{acaoOuExplicacao\(bloqueio,/g)].length, 2, "'+' do card e 'Adicionar ao pedido' do detalhe");
    assert.ok(cardapio.includes("accessibilityState={{ disabled: Boolean(bloqueio) }}") && cardapio.includes("bloqueio && estilos.inativo"));
    const carrinho = semComentarios(fonte("../../carrinho/components/painel-carrinho.tsx"));
    assert.ok(carrinho.includes("disabled={!bloqueio && !podeConfirmar}") && carrinho.includes("onPress={bloqueio ? bloqueio.aoExplicar : confirmar}"));
    assert.ok(carrinho.includes("Seus itens continuam aqui."));
  });

  it("fechada, nada entra no pedido mesmo que algum botão escape", () => {
    assert.ok(semComentarios(fonte("../components/catalogo-da-empresa.tsx")).includes("if (!catalogo || !aoAdicionarAoCarrinho || bloqueio) return;"));
  });
});

describe("empresa fechou entre montar o carrinho e confirmar (409 EMPRESA_FECHADA)", () => {
  it("reconhece a recusa do servidor pelo código", () => {
    assert.equal(ehEmpresaFechada({ ok: false, codigo: "EMPRESA_FECHADA" }), true);
    assert.equal(ehEmpresaFechada({ ok: false, codigo: "ITENS_INVALIDOS" }), false);
    assert.equal(ehEmpresaFechada({ ok: false, codigo: null }), false);
    assert.equal(ehEmpresaFechada({ ok: true }), false);
  });

  it("a mensagem do servidor é mostrada e o carrinho NÃO é limpo: a função sai antes de `limpar()`", () => {
    const tela = semComentarios(fonte("../../conversas/components/tela-conversa.tsx"));
    const inicio = tela.indexOf("if (!resultado.ok) {", tela.indexOf("await criarPedido("));
    const recusa = tela.slice(inicio, tela.indexOf("limpar();", inicio));
    assert.ok(recusa.includes("if (ehEmpresaFechada(resultado)) atualizarFuncionamento();"));
    assert.ok(recusa.includes("resultado.mensagem") && recusa.includes("return;"));
    assert.ok(!recusa.includes("setTentativaPedido(null)"), "a tentativa também fica: dá para confirmar de novo quando abrir");
  });
});

describe("o app não cria regra de horário", () => {
  it("nenhum arquivo do cardápio/carrinho compara horas ou recalcula o funcionamento", () => {
    for (const arquivo of ["./funcionamento.ts", "../hooks/use-funcionamento.ts", "../components/funcionamento-da-empresa.tsx", "../components/catalogo-da-empresa.tsx", "../components/catalogo-apresentacao.tsx", "../../carrinho/components/painel-carrinho.tsx"]) {
      assert.ok(!/new Date\(|Date\.now|getHours|calcularFuncionamento|minutosDoDia/.test(semComentarios(fonte(arquivo))), arquivo);
    }
    assert.ok(semComentarios(fonte("../hooks/use-funcionamento.ts")).includes("obterFuncionamento(identidadeEmpresaId)"));
  });
});
