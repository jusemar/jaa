import { INTERVALO_RENOVACAO_DIGITANDO_MS, PAUSA_PARA_PARAR_DIGITANDO_MS } from "@jaa/contratos";

/**
 * Lado de quem DIGITA: transforma teclas em poucos avisos.
 * - primeira tecla com texto → `true`; renova no máximo a cada INTERVALO_RENOVACAO (não a cada tecla);
 * - sem tecla por PAUSA_PARA_PARAR, texto apagado, envio ou saída da conversa → `false` imediato;
 * - `redefinir` (conexão caiu): esquece o estado sem avisar; o servidor já encerrou o digitando da conexão.
 */
export function criarControleDigitacao({
  emitir,
  intervaloRenovacaoMs = INTERVALO_RENOVACAO_DIGITANDO_MS,
  pausaMs = PAUSA_PARA_PARAR_DIGITANDO_MS,
  agora = () => Date.now(),
}: {
  emitir: (digitando: boolean) => void;
  intervaloRenovacaoMs?: number;
  pausaMs?: number;
  agora?: () => number;
}) {
  let digitando = false;
  let ultimoAvisoEm = 0;
  let pausa: ReturnType<typeof setTimeout> | null = null;

  function cancelarPausa() {
    if (pausa !== null) clearTimeout(pausa);
    pausa = null;
  }

  function parar() {
    cancelarPausa();
    if (!digitando) return;
    digitando = false;
    emitir(false);
  }

  return {
    aoAlterarTexto(texto: string) {
      if (texto.trim() === "") {
        parar();
        return;
      }
      const instante = agora();
      if (!digitando || instante - ultimoAvisoEm >= intervaloRenovacaoMs) {
        digitando = true;
        ultimoAvisoEm = instante;
        emitir(true);
      }
      cancelarPausa();
      pausa = setTimeout(parar, pausaMs);
    },
    parar,
    redefinir() {
      cancelarPausa();
      digitando = false;
    },
  };
}

/**
 * Lado de quem RECEBE: mostra "digitando..." enquanto houver aviso válido. Sem renovação dentro da
 * validade (aviso final perdido), some sozinho: o indicador nunca fica preso.
 */
export function criarIndicadorDigitando({ validadeMs, aoMudar }: { validadeMs: number; aoMudar: (digitando: boolean) => void }) {
  let ativo = false;
  let expiracao: ReturnType<typeof setTimeout> | null = null;

  function definir(valor: boolean) {
    if (valor === ativo) return;
    ativo = valor;
    aoMudar(valor);
  }

  function limpar() {
    if (expiracao !== null) clearTimeout(expiracao);
    expiracao = null;
    definir(false);
  }

  return {
    receber(digitando: boolean) {
      if (!digitando) {
        limpar();
        return;
      }
      if (expiracao !== null) clearTimeout(expiracao);
      expiracao = setTimeout(limpar, validadeMs);
      definir(true);
    },
    limpar,
  };
}
