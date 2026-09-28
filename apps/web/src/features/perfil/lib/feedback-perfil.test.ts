import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Avisador } from "@/components/ui/avisos";
import { executarComFeedback } from "@/features/profissional/lib/feedback";
import type { ResultadoApi } from "@/lib/api";

/*
 * "Salvar perfil" (Perfil pessoal) passa pelo MESMO feedback do resto do Jaa. A resposta segue
 * intacta para a tela: o salvamento e o erro inline de sempre continuam funcionando.
 */
const perfilSalvo = { nomeExibicao: "Ana", fraseStatus: null } as const;

function avisadorDeTeste() {
  const avisos: string[] = [];
  const avisador: Avisador = {
    sucesso: (mensagem) => avisos.push(`sucesso: ${mensagem}`),
    erro: (mensagem) => avisos.push(`erro: ${mensagem}`),
    alerta: (mensagem) => avisos.push(`alerta: ${mensagem}`),
    informacao: (mensagem) => avisos.push(`informacao: ${mensagem}`),
  };
  return { avisos, avisador };
}

describe("Perfil pessoal: feedback de 'Salvar perfil'", () => {
  it("sucesso mostra 'Perfil salvo' e entrega o perfil salvo à tela", async () => {
    const { avisos, avisador } = avisadorDeTeste();
    const resposta: ResultadoApi<typeof perfilSalvo> = { ok: true, status: 200, dados: perfilSalvo };
    const recebida = await executarComFeedback(Promise.resolve(resposta), "Perfil salvo", avisador);
    assert.deepEqual(avisos, ["sucesso: Perfil salvo"]);
    assert.deepEqual(recebida, resposta);
  });

  it("erro mostra toast de erro e a tela ainda recebe o erro (aviso inline preservado)", async () => {
    const { avisos, avisador } = avisadorDeTeste();
    const resposta: ResultadoApi<typeof perfilSalvo> = { ok: false, status: 400, codigo: "DADOS_INVALIDOS", mensagem: "Nome muito longo." };
    const recebida = await executarComFeedback(Promise.resolve(resposta), "Perfil salvo", avisador);
    assert.deepEqual(avisos, ["erro: Nome muito longo."]);
    assert.equal(recebida.ok, false);
    assert.equal(recebida.ok === false && recebida.mensagem, "Nome muito longo.");
  });
});
