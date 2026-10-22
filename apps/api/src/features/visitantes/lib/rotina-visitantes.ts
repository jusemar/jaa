import type { Banco } from "@jaa/banco";
import type { AvisoSessoesEncerradas } from "../../autenticacao/lib/sessoes-encerradas.js";
import { expirarVisitantes } from "../casos-de-uso/expirar-visitantes.js";

/*
 * Limpeza periódica dos visitantes inativos. Como no despacho, o prazo vive no BANCO: a rotina só
 * pergunta "quem passou de 24 h sem atividade?". Reiniciar a API não perde nada, e a sessão de um
 * visitante vencido já é recusada na hora (autenticar-identidade) mesmo antes desta volta passar.
 */
const INTERVALO_PADRAO_MS = 10 * 60 * 1000;

export function iniciarRotinaVisitantes(
  dependencias: { banco: Banco; sessoesEncerradas: AvisoSessoesEncerradas; aoFalhar?: (erro: unknown) => void },
  intervaloMs = INTERVALO_PADRAO_MS,
) {
  let rodando = false;

  const executarAgora = async () => {
    if (rodando) return;
    rodando = true;
    try {
      const { sessoesEncerradas } = await expirarVisitantes(dependencias.banco);
      // Derruba as conexões realtime das sessões que deixaram de existir (só o id, nunca o token).
      for (const sessaoId of sessoesEncerradas) dependencias.sessoesEncerradas.notificar(sessaoId);
    } catch (erro) {
      dependencias.aoFalhar?.(erro);
    } finally {
      rodando = false;
    }
  };

  const temporizador = setInterval(() => void executarAgora(), intervaloMs);
  temporizador.unref?.();

  return {
    executarAgora,
    encerrar() {
      clearInterval(temporizador);
    },
  };
}
