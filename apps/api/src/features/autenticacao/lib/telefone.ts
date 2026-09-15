import { parsePhoneNumberFromString } from "libphonenumber-js/max";

const TAMANHO_MAXIMO_ENTRADA = 32;

/**
 * Nesta fase o Jaa é exclusivo para celulares BRASILEIROS.
 * O usuário digita apenas DDD + número ("(31) 98765-4321"); o +55 é assumido aqui, no servidor.
 * Um número brasileiro colado com "+55" também é aceito. Números de outros países são recusados.
 *
 * Retorna o celular em E.164 ("+5531987654321") ou null se não for celular brasileiro válido.
 * A validação usa os metadados completos do libphonenumber (DDD e faixa de celular), não só a contagem de dígitos.
 */
export function normalizarCelularBrasileiro(entrada: string): string | null {
  if (entrada.length > TAMANHO_MAXIMO_ENTRADA) {
    return null;
  }

  const numero = parsePhoneNumberFromString(entrada, "BR");

  if (!numero || numero.country !== "BR" || !numero.isValid() || numero.getType() !== "MOBILE") {
    return null;
  }

  return numero.number;
}

export function ehCelularBrasileiroNormalizado(valor: string): boolean {
  return normalizarCelularBrasileiro(valor) === valor;
}

// Telefone é dado privado: exibir somente DDD e 4 últimos dígitos, no formato nacional e sem +55.
export function mascararTelefone(telefoneE164: string): string {
  const numero = parsePhoneNumberFromString(telefoneE164);

  if (!numero) {
    return "••••";
  }

  const nacional = numero.nationalNumber;
  const meio = "•".repeat(Math.max(nacional.length - 6, 0));
  return `(${nacional.slice(0, 2)}) ${meio}-${nacional.slice(-4)}`;
}
