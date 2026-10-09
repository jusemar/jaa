import { createAuthClient } from "better-auth/client";
import { emailOTPClient, phoneNumberClient } from "better-auth/client/plugins";
import { URL_API } from "@/lib/configuracao";

// Cliente oficial do Better Auth apontando para a API do Jaa.
// A sessão fica em cookie HttpOnly emitido pela API; o web nunca lê nem guarda o token.
export const clienteAutenticacao = createAuthClient({
  baseURL: URL_API,
  basePath: "/api/auth",
  // Código por celular e por e-mail: os dois canais do MESMO Better Auth, com a mesma sessão.
  plugins: [phoneNumberClient(), emailOTPClient()],
});
