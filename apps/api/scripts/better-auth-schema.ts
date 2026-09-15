import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { phoneNumber } from "better-auth/plugins";

// Usado SOMENTE pela CLI do Better Auth para gerar packages/banco/src/tabelas/autenticacao/better-auth.ts.
// Deve refletir as opções de src/features/autenticacao/autenticacao.ts que afetam tabelas
// (adapter/usePlural, rateLimit.storage e plugins). Se divergir, a API registra
// "Drizzle schema mismatch" ao iniciar.
export const auth = betterAuth({
  database: drizzleAdapter({}, { provider: "pg", usePlural: true }),
  rateLimit: { storage: "database" },
  plugins: [phoneNumber({ sendOTP: () => {} })],
});
