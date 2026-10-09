import { normalizarEmail } from "../lib/email.js";
import type { EntregadorOtpEmail } from "./entregador-otp-email.js";
import { ErroEntregaOtp } from "./erro-entrega-otp.js";

/**
 * RESEND — entrega do código por E-MAIL (API REST oficial: POST https://api.resend.com/emails,
 * `Authorization: Bearer <chave>`, corpo `{ from, to, subject, html, text }`, resposta `{ id }`).
 *
 * Só ENTREGA: o código chega pronto do Better Auth, que continua dono de geração, expiração,
 * tentativas e validação. Sem SDK: é uma única chamada HTTP, como nos demais provedores do Jaa.
 *
 * Nada daqui vai para log ou mensagem de erro: nem a chave, nem o código, nem o destinatário.
 */
export interface ConfiguracaoResend {
  chaveApi: string;
  /** Remetente de um domínio verificado no Resend: `Nome <endereco@dominio>` ou só o endereço. */
  remetente: string;
  /** Base alternativa (testes). Por padrão, a API de produção do Resend. */
  urlBase?: string | undefined;
  buscar?: typeof fetch;
  timeoutMs?: number;
}

const RESEND_URL_PADRAO = "https://api.resend.com";
// O pedido de código fica esperando esta chamada: timeout curto para não prender a requisição.
const TIMEOUT_PADRAO_MS = 8_000;

export const ASSUNTO_EMAIL_OTP = "Seu código de verificação Jaaa";

export interface ConteudoEmailOtp {
  assunto: string;
  texto: string;
  html: string;
}

/** Mensagem do código: versão texto e HTML simples. O código vai exatamente como foi gerado. */
export function conteudoEmailOtp(codigo: string, validadeSegundos: number): ConteudoEmailOtp {
  const minutos = Math.round(validadeSegundos / 60);
  const validade = `${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
  const texto = [
    `Seu código de verificação é: ${codigo}`,
    "",
    `Este código expira em ${validade}.`,
    "Não compartilhe este código com ninguém.",
    "",
    "Se você não pediu este código, ignore este e-mail.",
  ].join("\n");
  // O código do Better Auth é só dígitos; ainda assim nada além de dígitos entra no HTML.
  const codigoHtml = codigo.replace(/\D/g, "");
  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1f2933">',
    "<p>Seu código de verificação é:</p>",
    `<p style="font-size:30px;font-weight:bold;letter-spacing:4px;margin:16px 0">${codigoHtml}</p>`,
    `<p>Este código expira em ${validade}.<br>Não compartilhe este código com ninguém.</p>`,
    '<p style="font-size:13px;color:#6b7280">Se você não pediu este código, ignore este e-mail.</p>',
    "</div>",
  ].join("");
  return { assunto: ASSUNTO_EMAIL_OTP, texto, html };
}

export const ASSUNTO_EMAIL_AVISO = "Aviso de segurança do Jaaa";

/** Aviso para o dono de um endereço que outra conta tentou cadastrar. Não leva código nenhum. */
export function conteudoEmailAviso(): ConteudoEmailOtp {
  const linhas = [
    "Alguém tentou cadastrar este e-mail em outra conta do Jaaa.",
    "Este e-mail já pertence a uma conta, então nada foi alterado.",
    "Se foi você, entre no Jaaa usando este e-mail. Se não foi, ignore esta mensagem.",
  ];
  const html = ['<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1f2933">', ...linhas.map((linha) => `<p>${linha}</p>`), "</div>"].join("");
  return { assunto: ASSUNTO_EMAIL_AVISO, texto: linhas.join("\n\n"), html };
}

// O Resend explica o erro em `name` e `message` ("The domain is not verified"), o que ajuda a
// diagnosticar — mas o texto pode ecoar dados do envio: segredos conhecidos saem antes de virar erro.
function detalheSeguro(corpo: unknown, segredos: string[]): string {
  if (typeof corpo !== "object" || corpo === null) return "";
  const partes: string[] = [];
  if ("name" in corpo && typeof corpo.name === "string") partes.push(corpo.name);
  if ("message" in corpo && typeof corpo.message === "string") partes.push(corpo.message);
  let texto = partes.join(": ");
  for (const segredo of segredos) texto = texto.split(segredo).join("•••");
  texto = texto.replace(/[^\s<>"']+@[^\s<>"']+/g, "•••").trim().slice(0, 200);
  return texto ? ` Detalhe: ${texto}` : "";
}

export function criarEntregadorOtpEmailResend({ chaveApi, remetente, urlBase = RESEND_URL_PADRAO, buscar, timeoutMs = TIMEOUT_PADRAO_MS }: ConfiguracaoResend): EntregadorOtpEmail {
  const requisitar = buscar ?? ((url, opcoes) => fetch(url, opcoes));
  const url = `${urlBase.replace(/\/+$/, "")}/emails`;

  async function entregar(email: string, { assunto, texto, html }: ConteudoEmailOtp, segredos: string[]) {
    // Mesma regra da autenticação: só sai e-mail para endereço já canônico e válido.
    if (normalizarEmail(email) !== email) {
      throw new ErroEntregaOtp("email_invalido", "Resend: e-mail fora do formato esperado; nada foi enviado.");
    }

    const controle = new AbortController();
    const expirar = setTimeout(() => controle.abort(), timeoutMs);
    let resposta: Response;
    try {
      resposta = await requisitar(url, {
        method: "POST",
        // A chave entra só aqui, na hora da chamada.
        headers: { authorization: `Bearer ${chaveApi}`, "content-type": "application/json" },
        body: JSON.stringify({ from: remetente, to: [email], subject: assunto, text: texto, html }),
        signal: controle.signal,
      });
    } catch {
      // O erro original não é repassado: ele pode carregar a requisição inteira.
      if (controle.signal.aborted) throw new ErroEntregaOtp("tempo_esgotado", `Resend não respondeu em ${timeoutMs} ms.`);
      throw new ErroEntregaOtp("rede", "Falha de rede ao chamar o Resend.");
    } finally {
      clearTimeout(expirar);
    }

    const corpo: unknown = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      throw new ErroEntregaOtp("http", `Resend respondeu ${resposta.status}.${detalheSeguro(corpo, segredos)}`, resposta.status);
    }
    // Só é envio aceito com o id do e-mail devolvido pelo Resend; 200 sem ele não conta.
    if (typeof corpo !== "object" || corpo === null || !("id" in corpo) || typeof corpo.id !== "string" || corpo.id.length === 0) {
      throw new ErroEntregaOtp("resposta_invalida", "Resend devolveu uma resposta que não confirma o envio.", resposta.status);
    }
  }

  return {
    enviar: ({ email, codigo, validadeSegundos }) => entregar(email, conteudoEmailOtp(codigo, validadeSegundos), [chaveApi, codigo, email]),
    avisarEnderecoJaCadastrado: ({ email }) => entregar(email, conteudoEmailAviso(), [chaveApi, email]),
  };
}
