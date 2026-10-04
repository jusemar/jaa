import type { ParticipanteConversa } from "@jaa/contratos";
import type { Href } from "expo-router";

/*
 * No app, a conversa aberta é uma TELA empilhada sobre a lista (na Web é o painel ao lado). A identidade
 * do outro lado vai junto no endereço da rota: é dado público (nome e @usuario) que a lista já tinha, e
 * permite pintar o cabeçalho na hora. Ler/enviar continua sendo autorizado pela API.
 *
 * A foto vai só como PRÉVIA (`previaFotoUrl`): a tela da conversa relê a identidade na API e o que vier
 * de lá substitui a prévia — uma URL antiga na rota nunca vira a foto definitiva.
 */
export function rotaDaConversa(conversaId: string, outra: ParticipanteConversa & { fotoUrl?: string | null }): Href {
  return {
    pathname: "/conversa/[id]",
    params: {
      id: conversaId,
      identidadeId: outra.identidadeId,
      tipo: outra.tipo,
      nomeExibicao: outra.nomeExibicao,
      nomeUsuario: outra.nomeUsuario,
      ...(outra.fotoUrl ? { previaFotoUrl: outra.fotoUrl } : {}),
    },
  };
}
