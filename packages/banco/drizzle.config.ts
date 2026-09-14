import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Executado via scripts do workspace, com diretório atual em packages/banco.
// Variáveis já definidas no ambiente têm prioridade sobre o arquivo .env.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL não definida. Copie packages/banco/.env.example para packages/banco/.env.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  // Código em camelCase (criadoEm) e banco em snake_case (criado_em), conforme CLAUDE.md.
  casing: "snake_case",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
