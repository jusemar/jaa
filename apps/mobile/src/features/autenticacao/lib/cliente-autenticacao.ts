import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import { phoneNumberClient } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";
import { URL_API } from "@/lib/configuracao";

/**
 * MESMA autenticação do Web: Better Auth, conta por CELULAR + OTP, sem senha. O que muda é só onde a
 * sessão fica guardada — no navegador é cookie HttpOnly; aqui, o armazenamento seguro do aparelho.
 *
 * Não existe login paralelo no Mobile: a conta, a identidade pessoal e os vínculos com empresas são
 * exatamente os mesmos (uma pessoa que também entrega continua sendo uma pessoa comum do Jaa).
 */
export const clienteAutenticacao = createAuthClient({
  baseURL: URL_API,
  basePath: "/api/auth",
  plugins: [
    phoneNumberClient(),
    expoClient({
      // Precisa bater com expo.scheme do app.json e com o trustedOrigins da API.
      scheme: "mobile",
      storagePrefix: "jaa",
      storage: SecureStore,
    }),
  ],
});

/**
 * Cabeçalho de sessão para as chamadas do Jaa feitas com `fetch` direto (a API de entregas).
 * O plugin do Expo guarda o cookie da sessão; aqui ele é reaproveitado, nunca recriado.
 */
export async function cabecalhoSessao(): Promise<Record<string, string>> {
  const cookie = await clienteAutenticacao.getCookie();
  return cookie ? { Cookie: cookie } : {};
}
