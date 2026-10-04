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

// Linha presente e vazia no .env (ex.: `R2_CONTA_ID=`) vale como AUSENTE, não como valor inválido:
// assim o .env pode listar as variáveis antes de alguém colar os segredos.
const opcional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((valor) => (typeof valor === "string" && valor.trim() === "" ? undefined : valor), schema.optional());

const ambienteSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]),
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET deve ter pelo menos 32 caracteres."),
    BETTER_AUTH_URL: z.url(),
    ORIGENS_WEB_PERMITIDAS: listaDeOrigens,
    // Único mecanismo disponível hoje. Um provedor de SMS real entrará como nova opção.
    OTP_ENTREGA: z.enum(["desenvolvimento"]),
    /*
     * Roteamento real (sequência sugerida + percurso pelas ruas). OPCIONAL: sem o token, o Jaa não
     * chama serviço nenhum e a operação segue com a aproximação local determinística.
     * O token é SEGREDO DE SERVIDOR — nunca vai para o Web nem para o Mobile.
     */
    MAPBOX_TOKEN: z.string().min(1).optional(),
    // Base compartilhada pelas APIs Mapbox de rotas e geocodificação (útil em testes/homologação).
    MAPBOX_URL: z.url().optional(),
    /*
     * ARMAZENAMENTO DE ARQUIVOS no Cloudflare R2, em DOIS buckets da mesma conta:
     * - PÚBLICO (fotos de perfil, logo da empresa, imagens de produto), lido por URL pública;
     * - PRIVADO (futuras mídias de conversa), sem URL pública: só URL assinada de curta duração,
     *   gerada pela API depois de autorizar quem pede.
     * TODAS OPCIONAIS e SEGREDO DE SERVIDOR: sem elas o Jaa não inventa bucket nem URL — o envio é
     * recusado com aviso claro e o resto do produto continua funcionando. Nenhuma chave vai para o
     * Web ou o Mobile: todo arquivo passa pela API.
     */
    // COMPARTILHADAS pelos dois buckets.
    R2_CONTA_ID: opcional(z.string().min(1)),
    // Endpoint alternativo; por padrão o da conta (https://<conta>.r2.cloudflarestorage.com).
    R2_ENDPOINT: opcional(z.url()),
    // PÚBLICO.
    R2_BUCKET: opcional(z.string().min(1)),
    R2_ACCESS_KEY_ID: opcional(z.string().min(1)),
    R2_SECRET_ACCESS_KEY: opcional(z.string().min(1)),
    // Domínio público de leitura do bucket (r2.dev ou domínio próprio).
    R2_URL_PUBLICA: opcional(z.url()),
    // PRIVADO: token próprio, restrito a este bucket. Não existe URL pública para ele.
    R2_BUCKET_PRIVADO: opcional(z.string().min(1)),
    R2_ACCESS_KEY_ID_PRIVADO: opcional(z.string().min(1)),
    R2_SECRET_ACCESS_KEY_PRIVADO: opcional(z.string().min(1)),
  })
  .superRefine((ambiente, contexto) => {
    // Configuração pela metade é pior que nenhuma: em PRODUÇÃO ela falharia no primeiro upload, então
    // a API nem sobe. Fora dela é o estado normal enquanto os segredos não foram colados no .env: o
    // armazenamento fica indisponível (upload recusado com 503) e o servidor avisa no log.
    // Cada bucket é avaliado sozinho: um configurado não exige o outro.
    if (ambiente.NODE_ENV === "production") {
      if (situacaoArmazenamentoPublico(ambiente) === "parcial") {
        contexto.addIssue({ code: "custom", path: ["R2_BUCKET"], message: `Armazenamento público incompleto: configure ${VARIAVEIS_PUBLICO.join(", ")} juntas (ou nenhuma).` });
      }
      if (situacaoArmazenamentoPrivado(ambiente) === "parcial") {
        contexto.addIssue({ code: "custom", path: ["R2_BUCKET_PRIVADO"], message: `Armazenamento privado incompleto: configure ${VARIAVEIS_PRIVADO.join(", ")} juntas (ou nenhuma).` });
      }
    }

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

/*
 * Situação de cada bucket. `R2_CONTA_ID` (e `R2_ENDPOINT`) são COMPARTILHADOS: sozinhos não
 * "iniciam" a configuração de nenhum bucket, mas cada bucket só fica completo com a conta.
 * - ausente: nenhuma variável própria do bucket preenchida (armazenamento indisponível, sem erro);
 * - parcial: algumas, não todas (ou falta a conta) — proibido em produção;
 * - completo: todas as próprias + a conta.
 */
export type SituacaoArmazenamento = "ausente" | "parcial" | "completo";

const VARIAVEIS_PUBLICO = ["R2_CONTA_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_URL_PUBLICA"] as const;
const VARIAVEIS_PRIVADO = ["R2_CONTA_ID", "R2_BUCKET_PRIVADO", "R2_ACCESS_KEY_ID_PRIVADO", "R2_SECRET_ACCESS_KEY_PRIVADO"] as const;

type VariaveisR2 = Partial<Pick<Ambiente, (typeof VARIAVEIS_PUBLICO)[number] | (typeof VARIAVEIS_PRIVADO)[number]>>;

function situacao(contaId: string | undefined, proprias: (string | undefined)[]): SituacaoArmazenamento {
  if (!proprias.some(Boolean)) return "ausente";
  return contaId && proprias.every(Boolean) ? "completo" : "parcial";
}

// A URL pública faz parte do público: sem ela, os arquivos gravados não teriam endereço de leitura.
export function situacaoArmazenamentoPublico(ambiente: VariaveisR2): SituacaoArmazenamento {
  return situacao(ambiente.R2_CONTA_ID, [ambiente.R2_BUCKET, ambiente.R2_ACCESS_KEY_ID, ambiente.R2_SECRET_ACCESS_KEY, ambiente.R2_URL_PUBLICA]);
}

export function situacaoArmazenamentoPrivado(ambiente: VariaveisR2): SituacaoArmazenamento {
  return situacao(ambiente.R2_CONTA_ID, [ambiente.R2_BUCKET_PRIVADO, ambiente.R2_ACCESS_KEY_ID_PRIVADO, ambiente.R2_SECRET_ACCESS_KEY_PRIVADO]);
}

/** Só NOMES das variáveis de cada bucket (para avisos de log; valores nunca). */
export const NOMES_VARIAVEIS_ARMAZENAMENTO = { publico: VARIAVEIS_PUBLICO, privado: VARIAVEIS_PRIVADO } as const;

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
