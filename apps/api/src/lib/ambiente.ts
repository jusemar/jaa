import * as z from "zod";

const listaDeOrigens = z
  .string()
  .transform((valor) =>
    valor
      .split(",")
      .map((origem) => origem.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.url()).min(1));

const ambienteSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]),
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET deve ter pelo menos 32 caracteres."),
    BETTER_AUTH_URL: z.url(),
    ORIGENS_WEB_PERMITIDAS: listaDeOrigens,
    // Único mecanismo disponível hoje. Um provedor de SMS real entrará como nova opção.
    OTP_ENTREGA: z.enum(["desenvolvimento"]),
  })
  .superRefine((ambiente, contexto) => {
    // Segurança: a entrega de desenvolvimento exibe o código no terminal e nunca pode ir para produção.
    if (ambiente.OTP_ENTREGA === "desenvolvimento" && ambiente.NODE_ENV === "production") {
      contexto.addIssue({
        code: "custom",
        path: ["OTP_ENTREGA"],
        message: "OTP_ENTREGA=desenvolvimento é proibido com NODE_ENV=production.",
      });
    }
  });

export type Ambiente = z.infer<typeof ambienteSchema>;

export function carregarAmbiente(variaveis: NodeJS.ProcessEnv = process.env): Ambiente {
  const resultado = ambienteSchema.safeParse(variaveis);

  if (!resultado.success) {
    // Lista apenas nomes e motivos; nunca valores, que podem conter segredos.
    const problemas = resultado.error.issues
      .map((problema) => `- ${problema.path.join(".")}: ${problema.message}`)
      .join("\n");
    throw new Error(`Variáveis de ambiente inválidas (veja apps/api/.env.example):\n${problemas}`);
  }

  return resultado.data;
}
