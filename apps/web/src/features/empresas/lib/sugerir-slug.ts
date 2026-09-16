import { SLUG_EMPRESA_TAMANHO_MAXIMO } from "@jaa/contratos";

// Sugestão de endereço da loja a partir do nome (só conveniência de interface; o servidor valida).
// "Pizzaria São João & Cia" → "pizzaria-sao-joao-cia".
export function sugerirSlug(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_EMPRESA_TAMANHO_MAXIMO)
    .replace(/-+$/g, "");
}
