/*
 * Os DOIS ambientes do Jaa e as regras que dependem deles. Módulo PURO (sem React Native): é lido pela
 * configuração do Expo (`app.config.ts`), pelo script de distribuição, pelo app e pelos testes.
 *
 * - development: "Jaa Dev" — nós e os testadores; API e banco de desenvolvimento;
 * - production: "Jaa" — usuários reais.
 *
 * São dois aplicativos Android diferentes (pacotes diferentes), que nunca compartilham sessão, canal de
 * update nem API. Não existe terceiro ambiente.
 */
export const VARIANTES = ["development", "production"] as const;
export type Variante = (typeof VARIANTES)[number];

export const IDENTIDADE_DA_VARIANTE = {
  development: { nome: "Jaa Dev", pacote: "com.jaa.app.dev", scheme: "jaa-dev", canal: "development" },
  production: { nome: "Jaa", pacote: "com.jaa.app", scheme: "jaa", canal: "production" },
} as const satisfies Record<Variante, { nome: string; pacote: string; scheme: string; canal: Variante }>;

function ehVariante(valor: unknown): valor is Variante {
  return typeof valor === "string" && (VARIANTES as readonly string[]).includes(valor);
}

/**
 * Lê `APP_VARIANT`. Ausente = development (o dia a dia local: Metro, `jaa-android`); produção nunca é
 * o padrão. Qualquer outro valor é erro — não existe "preview", "staging" ou "homologação".
 */
export function lerVariante(valor: string | undefined): Variante {
  if (valor === undefined || valor === "") return "development";
  if (ehVariante(valor)) return valor;
  throw new Error(`APP_VARIANT inválida: "${valor}". Use "development" ou "production".`);
}

/** Variante do BINÁRIO instalado, pelo pacote Android — a única fonte que um update OTA não altera. */
export function varianteDoPacote(pacote: string | null | undefined): Variante | null {
  return VARIANTES.find((variante) => IDENTIDADE_DA_VARIANTE[variante].pacote === pacote) ?? null;
}

/** Variante declarada na configuração do Expo (`extra.variante`); null quando ausente ou estranha. */
export function varianteDeclarada(valor: unknown): Variante | null {
  return ehVariante(valor) ? valor : null;
}

// Endereços que só existem na máquina de quem desenvolve, ou que mudam a cada sessão.
const HOST_LOCAL = /^(localhost|127\.|10\.|192\.168\.|172\.|0\.0\.0\.0$|\[?::1\]?$)|\.local$/;
const TUNEL_TEMPORARIO = /(^|\.)(loca\.lt|localtunnel\.me|ngrok\.io|ngrok\.app|ngrok-free\.app|ngrok-free\.dev|trycloudflare\.com|serveo\.net|localhost\.run|lhr\.life|tunnelmole\.net|pinggy\.link)$/;

export type ResultadoUrlApi = { ok: true; url: string } | { ok: false; motivo: string };

/**
 * A URL da API serve para ESTE contexto?
 *
 * - `local: true` — Development Build servido pelo Metro na nossa máquina: qualquer URL http(s) vale
 *   (127.0.0.1 com adb reverse, 10.0.2.2, IP da rede). Só existe em development;
 * - `local: false` — binário ou update DISTRIBUÍDO (build/update do EAS): o aparelho é de outra
 *   pessoa, então a URL precisa ser HTTPS, pública e estável. O Android também recusa HTTP sem TLS em
 *   build de release.
 */
export function validarUrlApi(valor: string | undefined, contexto: { variante: Variante; local: boolean }): ResultadoUrlApi {
  if (contexto.local && contexto.variante === "production") return { ok: false, motivo: "Produção não tem modo local: a API precisa ser a pública de produção." };
  if (!valor) return { ok: false, motivo: "A URL da API não foi definida." };

  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return { ok: false, motivo: `"${valor}" não é uma URL.` };
  }
  const limpa = valor.replace(/\/+$/, "");
  if (contexto.local) return url.protocol === "http:" || url.protocol === "https:" ? { ok: true, url: limpa } : { ok: false, motivo: `"${valor}" não é uma URL http(s).` };

  if (url.protocol !== "https:") return { ok: false, motivo: `"${valor}" não usa HTTPS.` };
  if (HOST_LOCAL.test(url.hostname) || !url.hostname.includes(".")) return { ok: false, motivo: `"${valor}" é um endereço local: não existe no aparelho de quem instala.` };
  if (TUNEL_TEMPORARIO.test(url.hostname)) return { ok: false, motivo: `"${valor}" é um túnel temporário: o endereço deixa de existir.` };
  return { ok: true, url: limpa };
}
