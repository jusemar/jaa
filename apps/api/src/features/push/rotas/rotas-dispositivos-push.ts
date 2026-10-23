import type { Banco } from "@jaa/banco";
import { registrarDispositivoPushEntradaSchema, removerDispositivoPushParametrosSchema, type ErroApi } from "@jaa/contratos";
import type { FastifyInstance } from "fastify";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import { exigirIdentidadeAutenticada, obterIdentidadeExigida } from "../../autenticacao/lib/exigir-identidade-autenticada.js";
import { exigirSessao, obterSessaoExigida } from "../../autenticacao/lib/exigir-sessao.js";
import { registrarDispositivoPush, removerDispositivoPush } from "../repositorios/repositorio-dispositivos-push.js";

/**
 * DISPOSITIVOS PARA PUSH — da CONTA da sessão (nunca de um `usuarioId` do corpo, nem da identidade
 * selecionada). Exige conta com cadastro completo: visitante não recebe push.
 * - `PUT /dispositivos-push` `{ instalacaoId, token, plataforma }`: registra/atualiza esta instalação;
 * - `DELETE /dispositivos-push/:instalacaoId`: logout — só apaga se a instalação for desta conta.
 * As duas respondem 204 sem dizer se a instalação existia (nada a descobrir sobre aparelhos alheios).
 */
export function registrarRotasDispositivosPush(servidor: FastifyInstance, dependencias: { banco: Banco; autenticacao: Autenticacao }) {
  servidor.put("/dispositivos-push", { preHandler: exigirIdentidadeAutenticada(dependencias) }, async (requisicao, resposta) => {
    const entrada = registrarDispositivoPushEntradaSchema.safeParse(requisicao.body);
    if (!entrada.success) {
      const erro: ErroApi = { codigo: "DADOS_INVALIDOS", mensagem: entrada.error.issues[0]?.message ?? "Dados inválidos." };
      return resposta.code(400).send(erro);
    }
    const { usuarioId, sessaoId } = obterIdentidadeExigida(requisicao);
    await registrarDispositivoPush(dependencias.banco, { ...entrada.data, usuarioId, sessaoId });
    return resposta.code(204).send();
  });

  // Só a SESSÃO: sair precisa funcionar em qualquer estado do cadastro.
  servidor.delete("/dispositivos-push/:instalacaoId", { preHandler: exigirSessao(dependencias.autenticacao) }, async (requisicao, resposta) => {
    const parametros = removerDispositivoPushParametrosSchema.safeParse(requisicao.params);
    if (!parametros.success) {
      const erro: ErroApi = { codigo: "DADOS_INVALIDOS", mensagem: "Instalação inválida." };
      return resposta.code(400).send(erro);
    }
    await removerDispositivoPush(dependencias.banco, obterSessaoExigida(requisicao).user.id, parametros.data.instalacaoId);
    return resposta.code(204).send();
  });
}
