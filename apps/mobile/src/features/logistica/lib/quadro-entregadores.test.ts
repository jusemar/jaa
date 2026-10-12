import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/*
 * Logística → Entregadores no app: uma SITUAÇÃO por vez. A classificação é a de `@jaa/contratos`
 * (`classificarQuadroDeEntregadores`, testada lá); aqui se confere que a tela a usa e não remonta
 * as listas todas uma embaixo da outra.
 */
const tela = readFileSync(new URL("../components/aba-entregadores.tsx", import.meta.url), "utf8");

describe("Logística → Entregadores (app): abas por situação", () => {
  it("a tela mostra SÓ o grupo escolhido, pela classificação compartilhada", () => {
    assert.ok(tela.includes("classificarQuadroDeEntregadores(entregadores, painel)"));
    assert.ok(tela.includes("quadro.grupos[grupo.id]"));
    assert.ok(tela.includes("useState<AbaDoQuadroDeEntregadores>(ABA_INICIAL_DO_QUADRO_DE_ENTREGADORES)"));
    // As opções ficam numa faixa horizontal rolável, com a escolhida marcada.
    assert.ok(tela.includes('<ScrollView horizontal') && tela.includes('accessibilityRole="tab"') && tela.includes("accessibilityState={{ selected: marcada }}"));
    // Nada de estado operacional decidido na tela.
    for (const regraLocal of ['estado !== "indisponivel"', 'estado === "indisponivel"', "empresaPodeAlternarVinculo("]) assert.equal(tela.includes(regraLocal), false, regraLocal);
  });

  it("trocar de opção só troca o que se vê: não consulta nem grava nada", () => {
    assert.ok(tela.includes("onPress={() => setAba(item.id)}"));
    assert.equal(/setAba\([^)]*\)[^\n]*(listar|obter|alterar|convidar)/.test(tela), false);
  });

  it("Operação da base é uma opção própria e mantém endereço, raio, mapa e a fila", () => {
    assert.ok(tela.includes("{aba === ABA_OPERACAO_DA_BASE ? ("));
    assert.equal((tela.match(/<OperacaoDaBase /g) ?? []).length, 1);
    for (const preservado of ["Editar base", "Ajustar ponto no mapa", "Confirmar ponto no mapa", "Raio da base (m)", "raio de ${base.raioMetros} m", "<ConfirmarPontoDaBase", "<QuadroDaFila painel={painel} />", "Na base — fila", "Ninguém na base agora."]) assert.ok(tela.includes(preservado), preservado);
    // Dentro dela só a fila: os outros grupos saíram de lá.
    for (const removido of ['titulo="Fora da base"', 'titulo="Com rota"', 'titulo="Não aceitando entregas"']) assert.equal(tela.includes(removido), false, removido);
  });

  it("um ÚNICO fluxo de convite, com a busca por nome ou @usuario e os pendentes junto dele", () => {
    assert.equal((tela.match(/"Convidar entregador"/g) ?? []).length, 2, "o rótulo do botão e o do cartão que ele abre");
    assert.equal((tela.match(/<ConviteDeEntregador/g) ?? []).length, 1);
    assert.equal((tela.match(/rotulo="Nome ou @usuario"/g) ?? []).length, 1);
    assert.equal((tela.match(/rotulo="Enviar convite"/g) ?? []).length, 1);
    assert.ok(tela.includes("Aguardando aceite"));
    assert.equal(tela.includes("Recusar"), false);
  });
});
