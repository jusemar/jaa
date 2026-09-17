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
    /*
     * Geocodificação (endereço textual → coordenada SUGERIDA para abrir o mapa). OPCIONAL: sem a URL,
     * nenhum serviço externo é chamado e o cliente confirma o ponto do mesmo jeito. Espera-se uma API
     * compatível com a busca do Nominatim/OpenStreetMap, que não exige chave nem cobrança.
     */
    GEOCODIFICACAO_URL: z.url().optional(),
    // Identificação do aplicativo exigida pela política de uso do Nominatim.
    GEOCODIFICACAO_CONTATO: z.string().min(1).optional(),
    /*
     * Roteamento real (sequência sugerida + percurso pelas ruas). OPCIONAL: sem o token, o Jaa não
     * chama serviço nenhum e a operação segue com a aproximação local determinística.
     * O token é SEGREDO DE SERVIDOR — nunca vai para o Web nem para o Mobile.
     */
    MAPBOX_TOKEN: z.string().min(1).optional(),
    // Base da API (permite apontar para um ambiente próprio/homologação sem tocar no código).
    MAPBOX_URL: z.url().optional(),
    /*
     * ARMAZENAMENTO DE ARQUIVOS (fotos de perfil, logo da empresa, imagens de produto) no Cloudflare
     * R2. TODAS OPCIONAIS e SEGREDO DE SERVIDOR: sem elas o Jaa não inventa bucket nem URL — o upload
     * é recusado com aviso claro e o resto do produto continua funcionando.
     * A chave secreta NUNCA vai para o Web nem para o Mobile: o upload passa sempre pela API.
     */
    R2_CONTA_ID: z.string().min(1).optional(),
    R2_BUCKET: z.string().min(1).optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    // Domínio público de leitura do bucket (r2.dev ou domínio próprio).
    R2_URL_PUBLICA: z.url().optional(),
    // Endpoint alternativo; por padrão o da conta (https://<conta>.r2.cloudflarestorage.com).
    R2_ENDPOINT: z.url().optional(),
  })
  .superRefine((ambiente, contexto) => {
    // Configuração pela metade é pior que nenhuma: falha no primeiro upload, em produção.
    const r2 = [ambiente.R2_CONTA_ID, ambiente.R2_BUCKET, ambiente.R2_ACCESS_KEY_ID, ambiente.R2_SECRET_ACCESS_KEY];
    if (r2.some(Boolean) && !r2.every(Boolean)) {
      contexto.addIssue({
        code: "custom",
        path: ["R2_BUCKET"],
        message: "Configure R2_CONTA_ID, R2_BUCKET, R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY juntas (ou nenhuma).",
      });
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
