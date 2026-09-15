const DIGITOS_CELULAR = 11; // DDD (2) + celular (9)

/**
 * Máscara VISUAL de celular brasileiro durante a digitação: "(31) 98765-4321".
 * Apenas apresentação; a validação e a normalização para E.164 acontecem na API.
 * Se o usuário colar um número com +55, o código do país é descartado da exibição.
 */
export function formatarCelularDigitado(valor: string): string {
  let digitos = valor.replace(/\D/g, "");

  if (digitos.length > DIGITOS_CELULAR && digitos.startsWith("55")) {
    digitos = digitos.slice(2);
  }
  digitos = digitos.slice(0, DIGITOS_CELULAR);

  if (digitos.length === 0) return "";
  if (digitos.length <= 2) return `(${digitos}`;

  const ddd = digitos.slice(0, 2);
  const numero = digitos.slice(2);

  if (numero.length <= 5) return `(${ddd}) ${numero}`;
  return `(${ddd}) ${numero.slice(0, 5)}-${numero.slice(5)}`;
}
