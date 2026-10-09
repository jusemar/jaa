import * as z from "zod";

/*
 * PIN DO DISPOSITIVO AUTORIZADO.
 *
 * O PIN não é uma senha da conta: ele só vale junto com a credencial que o próprio dispositivo guarda
 * (cookie protegido no navegador; armazenamento seguro no aplicativo). Em outro aparelho, o PIN
 * sozinho não serve para nada — lá a entrada é pelo código (SMS ou e-mail).
 *
 * Quem decide TUDO é o servidor: se o dispositivo está autorizado, se o PIN confere, quantas
 * tentativas restam e de quem é a conta. O cliente nunca envia usuário, e-mail ou telefone aqui.
 */

export const TAMANHO_PIN = 6;

export const pinSchema = z.string().regex(/^\d{6}$/, `O PIN deve ter exatamente ${TAMANHO_PIN} números.`);

export const criarPinEntradaSchema = z
  .object({ pin: pinSchema, confirmacao: z.string() })
  .refine((entrada) => entrada.pin === entrada.confirmacao, { path: ["confirmacao"], message: "Os dois PINs não são iguais." });
export type CriarPinEntrada = z.input<typeof criarPinEntradaSchema>;

/*
 * `credencial`: só o APLICATIVO a envia (ele a guarda no armazenamento seguro do aparelho). No
 * navegador ela vive em cookie HttpOnly, fora do alcance do JavaScript, e nunca passa pelo corpo.
 */
const credencialDoDispositivoSchema = z.string().min(20).max(200);

export const entrarComPinEntradaSchema = z.object({ pin: pinSchema, credencial: credencialDoDispositivoSchema.optional() });
export type EntrarComPinEntrada = z.input<typeof entrarComPinEntradaSchema>;

export const dispositivoDoPinEntradaSchema = z.object({ credencial: credencialDoDispositivoSchema.optional() });

/**
 * Este dispositivo pode oferecer "Entrar com PIN"? Não diz de quem é a conta nem se há bloqueio.
 * `biometria`: o servidor tem uma credencial biométrica ativa para este dispositivo (só acontece no
 * aplicativo; no navegador é sempre `false`).
 */
export const situacaoPinSchema = z.object({ autorizado: z.boolean(), biometria: z.boolean() });
export type SituacaoPin = z.infer<typeof situacaoPinSchema>;

/** Resposta de criar o PIN. `credencial` só vem para o aplicativo, uma única vez, para ser guardada. */
export const pinCriadoSchema = z.object({ autorizado: z.literal(true), credencial: z.string().optional() });
export type PinCriado = z.infer<typeof pinCriadoSchema>;

/*
 * BIOMETRIA DO APARELHO (só no aplicativo).
 *
 * Nenhum dado biométrico sai do aparelho: quem confere a digital ou o rosto é o sistema. O que o
 * servidor conhece é um SEGUNDO segredo aleatório daquele dispositivo, que o aparelho só consegue ler
 * depois de a biometria do sistema liberar. Entrar exige os dois: a credencial do dispositivo e esse
 * segredo. O PIN continua sendo um caminho independente.
 */
const segredoDaBiometriaSchema = z.string().min(20).max(200);

export const dispositivoObrigatorioEntradaSchema = z.object({ credencial: credencialDoDispositivoSchema });

export const entrarComBiometriaEntradaSchema = z.object({ credencial: credencialDoDispositivoSchema, segredo: segredoDaBiometriaSchema });
export type EntrarComBiometriaEntrada = z.input<typeof entrarComBiometriaEntradaSchema>;

/** Resposta de ativar a biometria: o segredo vem UMA vez, para o armazenamento protegido do aparelho. */
export const biometriaAtivadaSchema = z.object({ segredo: segredoDaBiometriaSchema });
export type BiometriaAtivada = z.infer<typeof biometriaAtivadaSchema>;

/** Só dígitos, no máximo 6: o que o campo de PIN aceita enquanto a pessoa digita. */
export function somenteDigitosDoPin(texto: string): string {
  return texto.replace(/\D/g, "").slice(0, TAMANHO_PIN);
}
