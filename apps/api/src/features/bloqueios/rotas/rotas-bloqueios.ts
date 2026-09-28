import type { Banco } from "@jaa/banco";
import type { ErroApi } from "@jaa/contratos";
import type { FastifyInstance, FastifyReply } from "fastify";
import * as z from "zod";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import { exigirIdentidadeAtuante, obterIdentidadeExigida } from "../../autenticacao/lib/exigir-identidade-autenticada.js";
import type { CanalEventosMensagens } from "../../mensagens/lib/eventos-mensagens.js";
import { bloquearIdentidade, desbloquearIdentidade, lerSituacaoBloqueio, type ResultadoBloqueio } from "../casos-de-uso/gerir-bloqueios.js";

const parametros = z.object({ identidadeId: z.uuid() });

const ERROS: Record<Exclude<ResultadoBloqueio["tipo"], "ok">, { status: number; erro: ErroApi }> = {
  "dados-invalidos": { status: 400, erro: { codigo: "DADOS_INVALIDOS", mensagem: "Informe quem será bloqueado." } },
  "identidade-nao-autorizada": { status: 403, erro: { codigo: "IDENTIDADE_NAO_AUTORIZADA", mensagem: "Bloqueio é entre pessoas: use sua conta pessoal." } },
  "identidade-nao-encontrada": { status: 404, erro: { codigo: "IDENTIDADE_NAO_ENCONTRADA", mensagem: "Usuário não encontrado." } },
  "bloqueio-invalido": { status: 400, erro: { codigo: "BLOQUEIO_INVALIDO", mensagem: "Só é possível bloquear outra pessoa." } },
};

function concluir(resposta: FastifyReply, resultado: ResultadoBloqueio) {
  if (resultado.tipo === "ok") return resultado.situacao;
  const { status, erro } = ERROS[resultado.tipo];
  return resposta.code(status).send(erro);
}

/** Bloqueio de comunicação: sempre em nome da identidade da SESSÃO; o alvo é só o `identidadeId`. */
export function registrarRotasBloqueios(
  servidor: FastifyInstance,
  dependencias: { banco: Banco; autenticacao: Autenticacao; eventosMensagens: CanalEventosMensagens },
) {
  const preHandler = exigirIdentidadeAtuante(dependencias);

  servidor.get("/bloqueios/:identidadeId", { preHandler }, async (requisicao, resposta) => {
    const lidos = parametros.safeParse(requisicao.params);
    if (!lidos.success) return concluir(resposta, { tipo: "dados-invalidos" });
    const { identidadeId, tipoIdentidade } = obterIdentidadeExigida(requisicao);
    const situacao = await lerSituacaoBloqueio(dependencias.banco, { identidadeId, tipoIdentidade }, lidos.data.identidadeId);
    return situacao ?? concluir(resposta, { tipo: "identidade-nao-encontrada" });
  });

  servidor.post("/bloqueios", { preHandler }, async (requisicao, resposta) => {
    const { identidadeId, tipoIdentidade } = obterIdentidadeExigida(requisicao);
    return concluir(resposta, await bloquearIdentidade(dependencias, { identidadeId, tipoIdentidade }, requisicao.body));
  });

  servidor.delete("/bloqueios/:identidadeId", { preHandler }, async (requisicao, resposta) => {
    const lidos = parametros.safeParse(requisicao.params);
    if (!lidos.success) return concluir(resposta, { tipo: "dados-invalidos" });
    const { identidadeId, tipoIdentidade } = obterIdentidadeExigida(requisicao);
    return concluir(resposta, await desbloquearIdentidade(dependencias, { identidadeId, tipoIdentidade }, lidos.data.identidadeId));
  });
}
