import {
  ROTULO_MOTIVO_FALLBACK,
  rotaCobreSequenciaAtual,
  rotaTemPercursoReal,
  rotuloRota,
  type SaidaEntrega,
} from "@jaa/contratos";
import { ATRIBUICAO_TILES } from "@/features/enderecos/mapa/configuracao-mapa";

/*
 * PERCURSO da saída (apresentação pura). Mostra o que o Jaa realmente tem:
 * - com percurso real: distância e duração do TRAJETO, ditas como trajeto — nunca como previsão de
 *   entrega ao cliente (não entram preparo, espera na porta nem a fila de entregas);
 * - em fallback: a sequência continua valendo, mas nenhum número ou traçado é inventado.
 */

/**
 * Exibir o traçado do provedor de rotas sobre os tiles de OUTRO fornecedor esbarra nos termos de uso
 * deles. Por isso o Jaa só desenha a linha quando o mapa é do MESMO provedor que calculou a rota; nos
 * demais casos mostra a sequência e os números, que continuam úteis para a operação.
 */
export function podeDesenharPercurso(provedorDaRota: string | null, atribuicaoDosTiles = ATRIBUICAO_TILES): boolean {
  if (!provedorDaRota) return false;
  return atribuicaoDosTiles.toLowerCase().includes(provedorDaRota.toLowerCase());
}

export function ResumoPercurso({ saida }: { saida: SaidaEntrega }) {
  const { rota } = saida;
  const atualizada = rotaCobreSequenciaAtual(rota, saida.versaoSequencia);

  return (
    <p data-percurso={rota?.estado ?? "sem_rota"} className="text-xs text-zinc-600">
      {rotuloRota(rota, saida.versaoSequencia)}
      {rota && atualizada && rota.estado === "aproximacao_local" && rota.motivoFallback && (
        <span data-percurso-motivo={rota.motivoFallback} className="ml-1 text-zinc-500">
          {ROTULO_MOTIVO_FALLBACK[rota.motivoFallback]}
        </span>
      )}
      {rotaTemPercursoReal(rota) && atualizada && (
        <span className="ml-1 text-zinc-500">(tempo de trajeto, não é previsão de entrega)</span>
      )}
    </p>
  );
}
