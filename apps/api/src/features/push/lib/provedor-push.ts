import type { DadosPush } from "@jaa/contratos";

/*
 * FRONTEIRA com o serviço de push. O domínio monta avisos; quem os leva ao aparelho é o provedor
 * (hoje o Expo Push Service, que fala com FCM/APNs). Nenhum segredo do Firebase passa por aqui.
 */
export interface MensagemPush {
  token: string;
  titulo: string;
  texto: string;
  dados: DadosPush;
  // Canal Android: no Android 8+ é ELE que decide o som e a importância.
  canal: string;
}

// Resultado imediato do envio, na MESMA ordem das mensagens.
export type TicketPush = { status: "ok"; id: string } | { status: "erro"; erro: string | null };
// Resultado final (recibo), consultado depois: só ele confirma que o FCM/APNs aceitou.
export type ReciboPush = { status: "ok" } | { status: "erro"; erro: string | null };

export interface ProvedorPush {
  enviar(mensagens: readonly MensagemPush[]): Promise<TicketPush[]>;
  consultarRecibos(ids: readonly string[]): Promise<Map<string, ReciboPush>>;
}

// Erro DEFINITIVO do token: o app foi desinstalado ou o token não vale mais. Não adianta tentar de novo.
export const ERRO_DISPOSITIVO_NAO_REGISTRADO = "DeviceNotRegistered";
