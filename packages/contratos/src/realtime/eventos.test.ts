import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eventoNotificacaoNovaMensagemSchema } from "./eventos.ts";

const uuid = "01a0a394-6225-75f2-b809-b2690993c512";

describe("notificação de nova mensagem", () => {
  const valida = {
    conversaId: uuid,
    mensagemId: uuid,
    remetente: { identidadeId: uuid, tipo: "empresarial", nomeExibicao: "Mateus", nomeUsuario: "mateus" },
    previaConteudo: "Oi",
    conteudoTruncado: false,
    criadoEm: "2026-09-15T12:00:00.000Z",
  };

  it("aceita notificação completa e descarta dados privados do remetente", () => {
    const resultado = eventoNotificacaoNovaMensagemSchema.parse({ ...valida, remetente: { ...valida.remetente, telefone: "+5531987654321", usuarioId: "u1" } });
    assert.deepEqual(Object.keys(resultado.remetente).sort(), ["identidadeId", "nomeExibicao", "nomeUsuario", "tipo"]);
  });

  it("exige mensagem, conversa, remetente e horário", () => {
    for (const campo of ["conversaId", "mensagemId", "remetente", "criadoEm"] as const) {
      const { [campo]: _removido, ...incompleta } = valida;
      assert.equal(eventoNotificacaoNovaMensagemSchema.safeParse(incompleta).success, false, campo);
    }
  });
});
