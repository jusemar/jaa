import * as z from "zod";

/*
 * PERFIL E PRIVACIDADE da identidade.
 *
 * Três coisas diferentes que o produto costuma confundir e aqui não se confundem:
 *
 * 1. PRESENÇA (técnica)  — existe conexão realtime aberta? É derivada, efêmera e o servidor calcula.
 * 2. STATUS (escolhido)  — a pessoa diz como está: disponível, ocupado, ausente ou invisível.
 * 3. FRASE DE STATUS     — texto livre curto ("Entrego até 22h"), que não muda regra nenhuma.
 *
 * Nada aqui autoriza nada: privacidade decide o que APARECE, nunca quem pode conversar.
 */

export const FRASE_STATUS_TAMANHO_MAXIMO = 140;
export const CIDADE_PERFIL_TAMANHO_MAXIMO = 80;
export const SOBRE_TAMANHO_MAXIMO = 500;

export const statusEscolhidoSchema = z.enum(["disponivel", "ocupado", "ausente", "invisivel"]);
export type StatusEscolhido = z.infer<typeof statusEscolhidoSchema>;

export const ROTULO_STATUS: Record<StatusEscolhido, string> = {
  disponivel: "Disponível",
  ocupado: "Ocupado",
  ausente: "Ausente",
  invisivel: "Invisível",
};

export const visibilidadePerfilSchema = z.enum(["todos", "contatos", "ninguem"]);
export type VisibilidadePerfil = z.infer<typeof visibilidadePerfilSchema>;

export const ROTULO_VISIBILIDADE: Record<VisibilidadePerfil, string> = {
  todos: "Todos",
  contatos: "Somente meus contatos",
  ninguem: "Ninguém",
};

export const decisaoPrivacidadeSchema = z.enum(["permitir", "bloquear"]);
export type DecisaoPrivacidade = z.infer<typeof decisaoPrivacidadeSchema>;

// Texto opcional: vazio ou só espaços vira null (o banco não guarda string vazia).
function textoOpcional(maximo: number, rotulo: string) {
  return z
    .string()
    .transform((valor) => {
      const limpo = valor.normalize("NFC").replace(/\s+/g, " ").trim();
      return limpo === "" ? null : limpo;
    })
    .pipe(
      z
        .string()
        .max(maximo, `${rotulo} deve ter no máximo ${maximo} caracteres.`)
        .nullable(),
    )
    .nullable();
}

export const fraseStatusSchema = textoOpcional(FRASE_STATUS_TAMANHO_MAXIMO, "A frase de status");
export const cidadeSchema = textoOpcional(CIDADE_PERFIL_TAMANHO_MAXIMO, "A cidade");
export const sobreSchema = textoOpcional(SOBRE_TAMANHO_MAXIMO, "O texto sobre você");

/**
 * PERFIL PÚBLICO — o que UMA identidade vê de OUTRA. Os campos escondidos pela privacidade chegam
 * como `null`, nunca como "escondido": o cliente não tem como distinguir "não preencheu" de
 * "não mostra para você", e isso é proposital.
 *
 * Telefone e e-mail NUNCA fazem parte deste contrato.
 */
export const perfilPublicoSchema = z.object({
  identidadeId: z.uuid(),
  tipo: z.enum(["pessoal", "empresarial"]),
  nomeExibicao: z.string(),
  nomeUsuario: z.string(),
  fotoUrl: z.url().nullable(),
  fraseStatus: z.string().nullable(),
  cidade: z.string().nullable(),
  sobre: z.string().nullable(),
  // Status escolhido, quando a privacidade permite. "invisivel" jamais é revelado a terceiros:
  // para eles a identidade simplesmente aparece sem status.
  status: statusEscolhidoSchema.nullable(),
  ehContato: z.boolean(),
});

export type PerfilPublico = z.infer<typeof perfilPublicoSchema>;

/** PERFIL PRÓPRIO: inclui o que só o dono vê (as próprias preferências). */
export const meuPerfilSchema = perfilPublicoSchema.omit({ ehContato: true }).extend({
  privacidade: z.object({
    buscavelPorTelefone: z.boolean(),
    visibilidadeFoto: visibilidadePerfilSchema,
    visibilidadeStatus: visibilidadePerfilSchema,
    visibilidadePresenca: visibilidadePerfilSchema,
  }),
  // O dono sempre vê o próprio status, inclusive "invisivel".
  statusEscolhido: statusEscolhidoSchema,
});

export type MeuPerfil = z.infer<typeof meuPerfilSchema>;

export const atualizarPerfilEntradaSchema = z
  .object({
    nomeExibicao: z.string().trim().min(1, "Informe o nome.").max(50, "O nome deve ter no máximo 50 caracteres.").optional(),
    fraseStatus: fraseStatusSchema.optional(),
    cidade: cidadeSchema.optional(),
    sobre: sobreSchema.optional(),
  })
  .refine((entrada) => Object.values(entrada).some((valor) => valor !== undefined), "Informe ao menos um campo para alterar.");

export type AtualizarPerfilEntrada = z.input<typeof atualizarPerfilEntradaSchema>;

export const atualizarPrivacidadeEntradaSchema = z
  .object({
    statusEscolhido: statusEscolhidoSchema.optional(),
    buscavelPorTelefone: z.boolean().optional(),
    visibilidadeFoto: visibilidadePerfilSchema.optional(),
    visibilidadeStatus: visibilidadePerfilSchema.optional(),
    visibilidadePresenca: visibilidadePerfilSchema.optional(),
  })
  .refine((entrada) => Object.values(entrada).some((valor) => valor !== undefined), "Informe ao menos um campo para alterar.");

export type AtualizarPrivacidadeEntrada = z.input<typeof atualizarPrivacidadeEntradaSchema>;

export const excecaoPrivacidadeSchema = z.object({
  identidade: z.object({ identidadeId: z.uuid(), nomeExibicao: z.string(), nomeUsuario: z.string(), tipo: z.enum(["pessoal", "empresarial"]) }),
  decisao: decisaoPrivacidadeSchema,
});

export type ExcecaoPrivacidade = z.infer<typeof excecaoPrivacidadeSchema>;

export const listaExcecoesPrivacidadeSchema = z.object({ excecoes: z.array(excecaoPrivacidadeSchema) });
export type ListaExcecoesPrivacidade = z.infer<typeof listaExcecoesPrivacidadeSchema>;

export const salvarExcecaoPrivacidadeEntradaSchema = z.object({
  identidadeId: z.uuid(),
  decisao: decisaoPrivacidadeSchema,
});

/**
 * Regra ÚNICA de visibilidade, compartilhada por API e clientes (o servidor é quem decide; o cliente
 * usa só para explicar a escolha ao usuário). A exceção sempre vence a regra geral — é o caso
 * específico que a pessoa configurou de propósito.
 */
export function podeVer({
  visibilidade,
  ehContato,
  excecao,
}: {
  visibilidade: VisibilidadePerfil;
  ehContato: boolean;
  excecao?: DecisaoPrivacidade | null;
}): boolean {
  if (excecao === "permitir") return true;
  if (excecao === "bloquear") return false;
  if (visibilidade === "todos") return true;
  if (visibilidade === "ninguem") return false;
  return ehContato;
}
