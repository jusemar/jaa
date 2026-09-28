import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Avisador } from "@/components/ui/avisos";
import { executarComFeedback } from "./feedback";

function avisadorDeTeste() {
  const avisos: Array<[string, string]> = [];
  const avisador: Avisador = {
    sucesso: (mensagem) => avisos.push(["sucesso", mensagem]),
    erro: (mensagem) => avisos.push(["erro", mensagem]),
    alerta: (mensagem) => avisos.push(["alerta", mensagem]),
    informacao: (mensagem) => avisos.push(["informacao", mensagem]),
  };
  return { avisos, avisador };
}

describe("feedback das ações (toast)", () => {
  it("sucesso com mensagem avisa; sem mensagem não avisa (nada de toast para tudo)", async () => {
    const { avisos, avisador } = avisadorDeTeste();
    await executarComFeedback(Promise.resolve({ ok: true as const, status: 200, dados: 1 }), "Horários salvos", avisador);
    await executarComFeedback(Promise.resolve({ ok: true as const, status: 200, dados: 1 }), undefined, avisador);
    assert.deepEqual(avisos, [["sucesso", "Horários salvos"]]);
  });

  it("erro da API sempre avisa com a mensagem do servidor; sem resposta, diz que é conexão", async () => {
    const { avisos, avisador } = avisadorDeTeste();
    const recusa = await executarComFeedback(Promise.resolve({ ok: false as const, status: 409, codigo: "LIMITE_DE_AREAS_ATINGIDO" as const, mensagem: "Máximo de 5 áreas ativas." }), "Área adicionada", avisador);
    await executarComFeedback(Promise.resolve({ ok: false as const, status: 0, codigo: null, mensagem: "Sem conexão com o servidor." }), "Endereço salvo", avisador);
    assert.equal(recusa.ok, false);
    assert.deepEqual(avisos, [
      ["erro", "Máximo de 5 áreas ativas."],
      ["erro", "Sem conexão. Tente de novo."],
    ]);
  });
});
