import type { Banco } from "@jaa/banco";
import { bloquearIdentidadeEntradaSchema, type SituacaoBloqueio } from "@jaa/contratos";
import type { CanalEventosMensagens } from "../../mensagens/lib/eventos-mensagens.js";
import { apagarBloqueio, gravarBloqueio, situacaoEntre, tipoDaIdentidade, travarPar } from "../repositorios/repositorio-bloqueios.js";

/*
 * BLOQUEIO DE COMUNICAÇÃO entre pessoas. Quem bloqueia/desbloqueia é SEMPRE a identidade da sessão
 * (nunca um id vindo do corpo), e só PESSOA bloqueia PESSOA nesta etapa: agindo como empresa, ou
 * mirando uma empresa, não há bloqueio — isso é decisão de produto ainda aberta.
 */

export interface ContextoBloqueio {
  identidadeId: string;
  tipoIdentidade: "pessoal" | "empresarial";
}

const SEM_BLOQUEIO: SituacaoBloqueio = { podeBloquear: false, euBloqueei: false, fuiBloqueado: false };

export async function lerSituacaoBloqueio(banco: Banco, contexto: ContextoBloqueio, alvoIdentidadeId: string): Promise<SituacaoBloqueio | null> {
  const tipoAlvo = await tipoDaIdentidade(banco, alvoIdentidadeId);
  if (!tipoAlvo) return null;
  if (contexto.tipoIdentidade !== "pessoal" || tipoAlvo !== "pessoal" || alvoIdentidadeId === contexto.identidadeId) return SEM_BLOQUEIO;
  return { podeBloquear: true, ...(await situacaoEntre(banco, contexto.identidadeId, alvoIdentidadeId)) };
}

export type ResultadoBloqueio =
  | { tipo: "ok"; situacao: SituacaoBloqueio }
  | { tipo: "dados-invalidos" }
  | { tipo: "identidade-nao-autorizada" }
  | { tipo: "identidade-nao-encontrada" }
  | { tipo: "bloqueio-invalido" };

async function validar(banco: Banco, contexto: ContextoBloqueio, alvoIdentidadeId: string): Promise<Exclude<ResultadoBloqueio, { tipo: "ok" }> | null> {
  if (contexto.tipoIdentidade !== "pessoal") return { tipo: "identidade-nao-autorizada" };
  const tipoAlvo = await tipoDaIdentidade(banco, alvoIdentidadeId);
  if (!tipoAlvo) return { tipo: "identidade-nao-encontrada" };
  if (tipoAlvo !== "pessoal" || alvoIdentidadeId === contexto.identidadeId) return { tipo: "bloqueio-invalido" };
  return null;
}

function avisarAsDuas(eventosMensagens: CanalEventosMensagens, a: string, b: string) {
  eventosMensagens.publicar({ tipo: "bloqueio-atualizado", destinatariosIdentidadeIds: [a], identidadeId: b });
  eventosMensagens.publicar({ tipo: "bloqueio-atualizado", destinatariosIdentidadeIds: [b], identidadeId: a });
}

/** Bloqueia (idempotente). Mesma trava do envio: nenhuma mensagem "escapa" durante a gravação. */
export async function bloquearIdentidade(
  { banco, eventosMensagens }: { banco: Banco; eventosMensagens: CanalEventosMensagens },
  contexto: ContextoBloqueio,
  entrada: unknown,
): Promise<ResultadoBloqueio> {
  const dados = bloquearIdentidadeEntradaSchema.safeParse(entrada);
  if (!dados.success) return { tipo: "dados-invalidos" };
  const alvo = dados.data.identidadeId;
  const recusa = await validar(banco, contexto, alvo);
  if (recusa) return recusa;

  const situacao = await banco.transaction(async (transacao) => {
    await travarPar(transacao, contexto.identidadeId, alvo);
    await gravarBloqueio(transacao, contexto.identidadeId, alvo);
    return situacaoEntre(transacao, contexto.identidadeId, alvo);
  });
  avisarAsDuas(eventosMensagens, contexto.identidadeId, alvo);
  return { tipo: "ok", situacao: { podeBloquear: true, ...situacao } };
}

/** Desfaz SÓ o bloqueio que a própria pessoa criou; o do outro sentido continua valendo. */
export async function desbloquearIdentidade(
  { banco, eventosMensagens }: { banco: Banco; eventosMensagens: CanalEventosMensagens },
  contexto: ContextoBloqueio,
  alvoIdentidadeId: string,
): Promise<ResultadoBloqueio> {
  const recusa = await validar(banco, contexto, alvoIdentidadeId);
  if (recusa) return recusa;
  const removido = await apagarBloqueio(banco, contexto.identidadeId, alvoIdentidadeId);
  if (removido) avisarAsDuas(eventosMensagens, contexto.identidadeId, alvoIdentidadeId);
  return { tipo: "ok", situacao: { podeBloquear: true, ...(await situacaoEntre(banco, contexto.identidadeId, alvoIdentidadeId)) } };
}
