import * as z from "zod";
import { DOMINIO_EMAIL_TECNICO } from "./conta-tecnica.js";

// Limite do endereço inteiro (RFC 5321).
const TAMANHO_MAXIMO_EMAIL = 254;

const SUFIXO_TECNICO = `@${DOMINIO_EMAIL_TECNICO}`;

/** O e-mail técnico opaco criado no cadastro por telefone não é um endereço da pessoa. */
export function ehEmailTecnico(email: string): boolean {
  return email.toLowerCase().endsWith(SUFIXO_TECNICO);
}

/**
 * E-mail REAL em forma canônica (sem espaços nas pontas, minúsculas) ou null se não for um endereço
 * válido. É a única regra de e-mail do Jaa: o que passa aqui é o que o Better Auth grava e procura.
 * O domínio técnico interno nunca é aceito como e-mail de alguém.
 */
export function normalizarEmail(entrada: string): string | null {
  const email = entrada.trim().toLowerCase();
  if (email.length === 0 || email.length > TAMANHO_MAXIMO_EMAIL) return null;
  if (!z.email().safeParse(email).success || ehEmailTecnico(email)) return null;
  return email;
}

// E-mail é dado privado: em log/terminal aparecem só a primeira letra e o domínio.
export function mascararEmail(email: string): string {
  const arroba = email.lastIndexOf("@");
  if (arroba < 1) return "•••";
  return `${email[0]}•••${email.slice(arroba)}`;
}
