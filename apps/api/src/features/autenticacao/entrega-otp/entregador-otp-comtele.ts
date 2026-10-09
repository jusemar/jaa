import { ehCelularBrasileiroNormalizado } from "../lib/telefone.js";
import type { EntregadorOtp } from "./entregador-otp.js";
import { ErroEntregaOtp } from "./erro-entrega-otp.js";

/**
 * COMTELE — entrega do código por SMS (API do Painel Novo: api.comtele.com.br, cabeçalho `x-api-key`).
 *
 * Só ENTREGA: o código chega pronto do Better Auth, que continua dono de geração, expiração,
 * tentativas e validação. Os recursos de token/OTP da própria Comtele não são usados.
 *
 * Contrato (developers.comtele.com.br, "Send SMS Message"): POST /messages/sms/send com
 * `receivers`, `contactGroups`, `message`, `route`, `tag`, `custom` e `scheduleDate`; resposta
 * `{ hasError, message, errors, ... }`. A ROTA é um id da conta contratada (GET /routes), por isso
 * vem da configuração e não do código.
 *
 * Nada daqui vai para log ou mensagem de erro: nem a chave, nem o código, nem o telefone.
 */
export interface ConfiguracaoComtele {
  chaveApi: string;
  rota: number;
  /** Base alternativa (testes). Por padrão, a API de produção da Comtele. */
  urlBase?: string | undefined;
  buscar?: typeof fetch;
  timeoutMs?: number;
}

const COMTELE_URL_PADRAO = "https://api.comtele.com.br";
// O pedido de código fica esperando esta chamada: timeout curto para não prender a requisição.
const TIMEOUT_PADRAO_MS = 8_000;
// Etiqueta do envio nos relatórios da Comtele.
const ETIQUETA_ENVIO = "jaaa-otp";

/** Acima disto a Comtele cobra mais de um crédito (e algumas operadoras entregam em pedaços). */
export const TAMANHO_MAXIMO_SMS = 160;

/**
 * Texto do SMS. Sem acentos de propósito: fora do alfabeto básico do SMS a mensagem pode ser
 * cobrada/entregue em mais de uma parte. O código vai exatamente como o Better Auth gerou.
 */
export function mensagemSmsOtp(codigo: string): string {
  return `Jaaa: seu codigo de verificacao e ${codigo}. Nao compartilhe com ninguem.`;
}

export { ErroEntregaOtp, type MotivoFalhaEntregaOtp } from "./erro-entrega-otp.js";

// O texto devolvido pelo provedor ajuda a diagnosticar ("saldo insuficiente"), mas poderia ecoar o
// conteúdo enviado: segredos conhecidos e qualquer sequência longa de dígitos saem antes de virar erro.
function detalheSeguro(corpo: unknown, segredos: string[]): string {
  if (typeof corpo !== "object" || corpo === null) return "";
  const partes: string[] = [];
  if ("message" in corpo && typeof corpo.message === "string") partes.push(corpo.message);
  if ("errors" in corpo && Array.isArray(corpo.errors)) partes.push(...corpo.errors.filter((erro): erro is string => typeof erro === "string"));
  let texto = partes.join(" | ");
  for (const segredo of segredos) texto = texto.split(segredo).join("•••");
  texto = texto.replace(/\d{4,}/g, "•••").trim().slice(0, 200);
  return texto ? ` Detalhe: ${texto}` : "";
}

export function criarEntregadorOtpComtele({ chaveApi, rota, urlBase = COMTELE_URL_PADRAO, buscar, timeoutMs = TIMEOUT_PADRAO_MS }: ConfiguracaoComtele): EntregadorOtp {
  const requisitar = buscar ?? ((url, opcoes) => fetch(url, opcoes));
  const url = `${urlBase.replace(/\/+$/, "")}/messages/sms/send`;

  return {
    async enviar({ telefone, codigo }) {
      // Mesma regra do cadastro (celular brasileiro em E.164); aqui só muda o formato final.
      if (!ehCelularBrasileiroNormalizado(telefone)) {
        throw new ErroEntregaOtp("telefone_invalido", "Comtele: telefone fora do formato esperado; nada foi enviado.");
      }
      // A Comtele recebe o número internacional só com dígitos: 55 + DDD + número, sem "+".
      const destinatario = telefone.slice(1);
      const segredos = [chaveApi, codigo, destinatario, destinatario.slice(2)];

      const controle = new AbortController();
      const expirar = setTimeout(() => controle.abort(), timeoutMs);
      let resposta: Response;
      try {
        resposta = await requisitar(url, {
          method: "POST",
          // A chave entra só aqui, na hora da chamada.
          headers: { "x-api-key": chaveApi, "content-type": "application/json" },
          body: JSON.stringify({
            receivers: [destinatario],
            contactGroups: [],
            message: mensagemSmsOtp(codigo),
            route: rota,
            tag: ETIQUETA_ENVIO,
            custom: ETIQUETA_ENVIO,
            scheduleDate: null,
          }),
          signal: controle.signal,
        });
      } catch {
        // O erro original não é repassado: ele pode carregar a requisição inteira.
        if (controle.signal.aborted) throw new ErroEntregaOtp("tempo_esgotado", `Comtele não respondeu em ${timeoutMs} ms.`);
        throw new ErroEntregaOtp("rede", "Falha de rede ao chamar a Comtele.");
      } finally {
        clearTimeout(expirar);
      }

      const corpo: unknown = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        throw new ErroEntregaOtp("http", `Comtele respondeu ${resposta.status}.${detalheSeguro(corpo, segredos)}`, resposta.status);
      }
      // Só é entrega aceita com a confirmação explícita do provedor; 200 sem ela não conta.
      if (typeof corpo !== "object" || corpo === null || !("hasError" in corpo) || typeof corpo.hasError !== "boolean") {
        throw new ErroEntregaOtp("resposta_invalida", "Comtele devolveu uma resposta que não confirma o envio.", resposta.status);
      }
      if (corpo.hasError) {
        throw new ErroEntregaOtp("recusado", `Comtele recusou o envio.${detalheSeguro(corpo, segredos)}`, resposta.status);
      }
    },
  };
}
