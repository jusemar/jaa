import type { EventosRealtimeClienteParaServidor, EventosRealtimeServidorParaCliente } from "@jaa/contratos";
import { io, type Socket } from "socket.io-client";
import { cabecalhoSessao } from "@/features/autenticacao/lib/cliente-autenticacao";
import { URL_API } from "@/lib/configuracao";
import { aoMudarIdentidadeAtuante, obterIdentidadeAtuante } from "@/lib/identidade-atuante";

export type ClienteRealtime = Socket<EventosRealtimeServidorParaCliente, EventosRealtimeClienteParaServidor>;

let cliente: ClienteRealtime | null = null;

/*
 * Uma única conexão realtime para o app inteiro — o mesmo papel do `cliente-realtime` da Web, com duas
 * diferenças que são do APARELHO, não do produto:
 *
 * - a sessão vai no cabeçalho `Cookie` (o app não tem o cookie jar do navegador): é a MESMA sessão do
 *   Better Auth guardada no SecureStore, sem token paralelo;
 * - o transporte é long-polling. O WebSocket nativo do Android acrescenta sozinho um cabeçalho `Origin`
 *   com o endereço da API, e o servidor só aceita `Origin` ausente ou das origens Web permitidas — o
 *   upgrade seria recusado. Em polling o app não manda `Origin` e o handshake passa pela validação de
 *   sessão normal. Trocar para WebSocket depende de o servidor reconhecer clientes nativos.
 */
export function obterClienteRealtime(): ClienteRealtime {
  if (!cliente) {
    const socket: ClienteRealtime = io(URL_API, {
      autoConnect: false,
      transports: ["polling"],
      // Identidade atuante pedida a CADA (re)conexão; a API recusa se a conta não puder operá-la.
      auth: (responder) => {
        const identidadeId = obterIdentidadeAtuante();
        responder(identidadeId ? { identidadeId } : {});
      },
    });
    // Uma conexão age como UMA identidade: trocar de identidade = reconectar com nova autorização.
    aoMudarIdentidadeAtuante(() => {
      if (!socket.active) return;
      socket.disconnect();
      socket.connect();
    });
    cliente = socket;
  }

  return cliente;
}

export async function conectarRealtime(): Promise<void> {
  const socket = obterClienteRealtime();
  // A sessão atual acompanha esta conexão e as reconexões automáticas dela.
  socket.io.opts.extraHeaders = await cabecalhoSessao();
  // `active` cobre também o período de reconexão automática em andamento.
  if (!socket.active) socket.connect();
}

export function desconectarRealtime(): void {
  obterClienteRealtime().disconnect();
}
