import { processarFormacoesVencidas, publicarDespacho, type DependenciasDespacho } from "../casos-de-uso/despacho-automatico.js";
import { listarEmpresasComSaidaPendente } from "../repositorios/repositorio-despacho.js";
import { despacharPendentes } from "../casos-de-uso/despacho-automatico.js";

/**
 * FECHAMENTO POR TEMPO, do lado do SERVIDOR.
 *
 * O prazo de cada formação está PERSISTIDO no banco, então esta rotina não é a dona do tempo: ela só
 * pergunta, de tempos em tempos, "o que já venceu?". Consequências disso, todas intencionais:
 * - nada depende do navegador do gestor, de `setTimeout` na tela ou de alguém dar F5;
 * - reiniciar a API não perde vencimento nenhum: na primeira volta, o que passou do prazo é fechado;
 * - não foi preciso introduzir fila, worker ou agendador externo nesta etapa (seção 22 do CLAUDE.md).
 *
 * Com várias instâncias da API, cada uma roda a rotina; a trava por empresa dentro da transação de
 * despacho garante que só uma atribua cada saída.
 */
const INTERVALO_PADRAO_MS = 15_000;

export interface RotinaDespacho {
  // Executa uma volta agora (usada no start e pelos testes, sem esperar o intervalo).
  executarAgora(): Promise<void>;
  encerrar(): void;
}

export function iniciarRotinaDespacho(dependencias: DependenciasDespacho, intervaloMs = INTERVALO_PADRAO_MS): RotinaDespacho {
  let rodando = false;

  const executarAgora = async () => {
    // Uma volta por vez: se a anterior demorou, não empilhamos processamento concorrente.
    if (rodando) return;
    rodando = true;
    try {
      const fechadas = await processarFormacoesVencidas(dependencias);
      // Saídas que já estavam esperando alguém: um entregador pode ter ficado elegível no intervalo.
      for (const empresaId of await listarEmpresasComSaidaPendente(dependencias.banco)) {
        const despachadas = await despacharPendentes(dependencias, empresaId);
        if (despachadas.length > 0 || fechadas.length > 0) await publicarDespacho(dependencias, empresaId);
      }
    } catch {
      // Falha aqui não perde nada: o prazo continua no banco e a próxima volta tenta de novo.
    } finally {
      rodando = false;
    }
  };

  const temporizador = setInterval(() => void executarAgora(), intervaloMs);
  // Não segura o processo aberto: é trabalho de manutenção, não a razão de a API existir.
  temporizador.unref?.();

  return {
    executarAgora,
    encerrar() {
      clearInterval(temporizador);
    },
  };
}
