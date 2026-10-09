/*
 * E-MAIL DA CONTA no Perfil — a parte PURA, testada com `node:test`. Mesmas regras de tela do
 * aplicativo (os apps não importam código um do outro; mudou lá, muda aqui).
 *
 * Quem decide tudo é o servidor: qual é o e-mail real da conta (`GET /conta/email`), se o endereço
 * novo é válido, se o código confere e se o e-mail pode ser gravado. Aqui só se prepara o que a pessoa
 * digitou e se escolhe o texto da tela.
 */

// Endereço interno criado no cadastro por celular: não é o e-mail de ninguém e nunca aparece.
const DOMINIO_TECNICO = "@email-tecnico.jaa.invalid";

/**
 * O e-mail que PODE ser mostrado: o real, ou null. O servidor já não devolve o endereço técnico; esta
 * é a segunda barreira — se um dia ele chegar aqui, a tela mostra "sem e-mail" em vez de exibi-lo.
 */
export function emailVisivel(email: string | null | undefined): string | null {
  if (!email) return null;
  const limpo = email.trim().toLowerCase();
  if (limpo === "" || limpo.endsWith(DOMINIO_TECNICO) || limpo.endsWith(".invalid")) return null;
  return limpo;
}

export const SEM_EMAIL = "Nenhum e-mail cadastrado";

/** Textos do cartão conforme a conta já tenha, ou não, um e-mail real. */
export function textosDoEmail(emailAtual: string | null): { valor: string; acao: string; campo: string } {
  return emailAtual ? { valor: emailAtual, acao: "Alterar e-mail", campo: "Novo e-mail" } : { valor: SEM_EMAIL, acao: "Cadastrar e-mail", campo: "E-mail" };
}

export type NovoEmail = { ok: true; email: string } | { ok: false; mensagem: string | null };

/**
 * O endereço digitado pode ser enviado? Só confere o que dá para saber sem o servidor (formato básico
 * e se é o mesmo de hoje) — a validação de verdade é dele. `mensagem: null` = ainda incompleto, sem erro.
 */
export function prepararNovoEmail(digitado: string, emailAtual: string | null): NovoEmail {
  const email = digitado.trim().toLowerCase();
  if (email === "") return { ok: false, mensagem: null };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { ok: false, mensagem: null };
  if (emailVisivel(email) === null) return { ok: false, mensagem: "E-mail inválido." };
  if (emailAtual && email === emailAtual) return { ok: false, mensagem: "Este já é o e-mail da sua conta." };
  return { ok: true, email };
}

/** Código de 6 números: só dígitos, no máximo 6. */
export function somenteDigitosDoCodigo(texto: string): string {
  return texto.replace(/\D/g, "").slice(0, 6);
}
