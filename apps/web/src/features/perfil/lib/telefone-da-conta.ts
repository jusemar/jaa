/*
 * TELEFONE DA CONTA no Perfil — a parte PURA, testada com `node:test`. Mesmas regras de tela do
 * aplicativo (os apps não importam código um do outro; mudou lá, muda aqui).
 *
 * É um dado da CONTA (Conta e segurança) — não tem relação com a preferência de privacidade "deixar
 * que me encontrem pelo meu celular". Quem valida o número, confere se ele já é de outra conta, envia o
 * código e grava é o servidor; aqui só se prepara o que a pessoa digitou e se escolhe o texto da tela.
 */

export const SEM_TELEFONE = "Nenhum telefone cadastrado";

/** Textos da linha conforme a conta já tenha, ou não, um telefone. */
export function textosDoTelefone(telefoneAtual: string | null): { valor: string; acao: string; campo: string } {
  return telefoneAtual ? { valor: telefoneAtual, acao: "Alterar telefone", campo: "Novo telefone" } : { valor: SEM_TELEFONE, acao: "Cadastrar telefone", campo: "Telefone" };
}

const digitosDe = (texto: string) => {
  const digitos = texto.replace(/\D/g, "");
  // "+55 31 9…" colado: o código do país não faz parte do número nacional.
  return digitos.length > 11 && digitos.startsWith("55") ? digitos.slice(2) : digitos;
};

export type NovoTelefone = { ok: true; telefone: string } | { ok: false; mensagem: string | null };

/**
 * O número digitado pode ser enviado? Só o que dá para saber sem o servidor: DDD + celular (11
 * dígitos) e não ser o número de hoje — para não pedir um código à toa. `mensagem: null` = ainda
 * incompleto, sem erro.
 */
export function prepararNovoTelefone(digitado: string, telefoneAtual: string | null): NovoTelefone {
  const digitos = digitosDe(digitado);
  if (digitos.length < 11) return { ok: false, mensagem: null };
  if (digitos.length > 11) return { ok: false, mensagem: "Número de celular inválido." };
  if (telefoneAtual && digitosDe(telefoneAtual) === digitos) return { ok: false, mensagem: "Este já é o telefone da sua conta." };
  return { ok: true, telefone: digitos };
}
