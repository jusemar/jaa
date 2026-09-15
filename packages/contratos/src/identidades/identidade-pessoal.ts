import * as z from "zod";

export const NOME_USUARIO_TAMANHO_MINIMO = 3;
export const NOME_USUARIO_TAMANHO_MAXIMO = 30;

// Forma canônica: começa com letra; depois letras minúsculas, dígitos ou "_".
// Mantida em sincronia com a constraint `identidades_nome_usuario_formato` do banco.
export const NOME_USUARIO_FORMATO = /^[a-z][a-z0-9_]{2,29}$/;

export const NOME_EXIBICAO_TAMANHO_MAXIMO = 50;

// Lista CENTRAL de @usuario reservados do Jaa (forma canônica). Não podem ser usados por contas comuns.
// Comparação exata após normalização: "@JAA", " Suporte " etc. também são recusados.
export const NOMES_USUARIO_RESERVADOS: ReadonlySet<string> = new Set([
  "jaa",
  "admin",
  "administrador",
  "suporte",
  "sistema",
  "system",
  "api",
  "oficial",
  "ajuda",
  "seguranca",
  "security",
]);

export function ehNomeUsuarioReservado(nomeUsuario: string): boolean {
  return NOMES_USUARIO_RESERVADOS.has(normalizarNomeUsuario(nomeUsuario));
}

// "@Junior " e "junior" representam o mesmo @usuario: unicidade nunca depende de maiúsculas.
export function normalizarNomeUsuario(valor: string): string {
  return valor.trim().replace(/^@/, "").normalize("NFKC").toLowerCase();
}

export function normalizarNomeExibicao(valor: string): string {
  return valor.normalize("NFC").replace(/\s+/g, " ").trim();
}

export const nomeUsuarioSchema = z
  .string()
  .transform(normalizarNomeUsuario)
  .pipe(
    z
      .string()
      .min(NOME_USUARIO_TAMANHO_MINIMO, "O @usuario deve ter pelo menos 3 caracteres.")
      .max(NOME_USUARIO_TAMANHO_MAXIMO, "O @usuario deve ter no máximo 30 caracteres.")
      .regex(
        NOME_USUARIO_FORMATO,
        "Use letras sem acento, números ou _, começando com uma letra.",
      )
      .refine((valor) => !NOMES_USUARIO_RESERVADOS.has(valor), "Este @usuario não está disponível."),
  );

export const nomeExibicaoSchema = z
  .string()
  .transform(normalizarNomeExibicao)
  .pipe(
    z
      .string()
      .min(1, "Informe seu nome.")
      .refine(
        (valor) => [...valor].length <= NOME_EXIBICAO_TAMANHO_MAXIMO,
        "O nome deve ter no máximo 50 caracteres.",
      )
      .refine((valor) => !/\p{Cc}/u.test(valor), "O nome contém caracteres inválidos."),
  );

export const criarIdentidadePessoalEntradaSchema = z.object({
  nomeExibicao: nomeExibicaoSchema,
  nomeUsuario: nomeUsuarioSchema,
});

export type CriarIdentidadePessoalEntrada = z.input<typeof criarIdentidadePessoalEntradaSchema>;

export const identidadePessoalSchema = z.object({
  id: z.uuid(),
  nomeExibicao: z.string(),
  nomeUsuario: z.string(),
  criadoEm: z.iso.datetime(),
});

export type IdentidadePessoal = z.infer<typeof identidadePessoalSchema>;
