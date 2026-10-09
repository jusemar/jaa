/*
 * POLÍTICA DE TENTATIVAS DO PIN — regras puras, sem banco.
 *
 * Um PIN de 6 dígitos tem só 1.000.000 de combinações: o que o protege é o servidor contar os erros
 * de CADA dispositivo autorizado. A conta é de erros SEGUIDOS (um acerto zera):
 *
 *   1º e 2º erro → pode tentar de novo;
 *   3º erro      → bloqueio de 1 minuto;
 *   4º erro      → bloqueio de 5 minutos;
 *   5º erro      → a autorização do dispositivo é REVOGADA.
 *
 * Revogar não tranca ninguém para fora: a pessoa entra pelo código (SMS ou e-mail) e, se quiser, cria
 * um PIN novo. Quem tem o aparelho mas não sabe o PIN ganha no máximo 5 palpites em 1.000.000.
 */
export const POLITICA_PIN = {
  bloqueios: [
    { noErro: 3, segundos: 60 },
    { noErro: 4, segundos: 300 },
  ],
  revogarNoErro: 5,
} as const;

/** Por quanto tempo uma comprovação por código (SMS/e-mail) permite criar o PIN do dispositivo. */
export const JANELA_PARA_CRIAR_PIN_SEGUNDOS = 600;

/** Validade da credencial no navegador (cookie), renovada a cada entrada com PIN. */
export const VALIDADE_CREDENCIAL_WEB_SEGUNDOS = 60 * 60 * 24 * 365;

export type ConsequenciaDoErro = { tipo: "nenhuma" } | { tipo: "bloqueio"; segundos: number } | { tipo: "revogar" };

/** O que acontece depois do N-ésimo erro seguido (N já contando o erro atual). */
export function consequenciaDoErro(errosSeguidos: number): ConsequenciaDoErro {
  if (errosSeguidos >= POLITICA_PIN.revogarNoErro) return { tipo: "revogar" };
  const bloqueio = POLITICA_PIN.bloqueios.findLast((regra) => errosSeguidos >= regra.noErro);
  return bloqueio ? { tipo: "bloqueio", segundos: bloqueio.segundos } : { tipo: "nenhuma" };
}
