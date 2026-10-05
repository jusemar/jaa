import { EVENTO_CONVERSA_NAO_LIDAS, eventoConversaNaoLidasSchema, resumoNaoLidasSchema } from "@jaa/contratos";
import { useEffect, useRef, useState } from "react";
import { requisitarApi } from "@/lib/api";
import { cabecalhosIdentidadeAtuante } from "@/lib/identidade-atuante";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { aplicarNaoLidas, combinarResumo, totalNaoLidas, type NaoLidasPorConversa } from "../lib/nao-lidas-globais";

/*
 * Total de não lidas da identidade ATUANTE, visível em qualquer área (o indicador no item Conversas da
 * navegação) — a parte de contagem do `useAvisosMensagens` da Web. O som de mensagem recebida fica em
 * `use-som-mensagens.ts`.
 */
export function useTotalNaoLidas(identidadeAtivaId: string | null): number {
  const [estado, setEstado] = useState<{ identidadeId: string | null; porConversa: NaoLidasPorConversa }>({ identidadeId: null, porConversa: new Map() });
  // Conversas que mudaram por evento enquanto o resumo era buscado: o evento (mais novo) prevalece.
  const atualizadasDuranteBusca = useRef(new Set<string>());
  const geracao = useRef(0);

  useEffect(() => {
    if (!identidadeAtivaId) return;
    const socket = obterClienteRealtime();
    const doEstado = (atual: { identidadeId: string | null; porConversa: NaoLidasPorConversa }) => (atual.identidadeId === identidadeAtivaId ? atual.porConversa : new Map<string, number>());

    async function recarregar() {
      const minha = ++geracao.current;
      atualizadasDuranteBusca.current.clear();
      const resposta = await requisitarApi("/conversas/nao-lidas", resumoNaoLidasSchema, { headers: cabecalhosIdentidadeAtuante() });
      if (minha !== geracao.current || !resposta.ok) return;
      setEstado((atual) => ({ identidadeId: identidadeAtivaId, porConversa: combinarResumo(doEstado(atual), resposta.dados, atualizadasDuranteBusca.current) }));
    }

    const aoMudarNaoLidas = (evento: unknown) => {
      const lido = eventoConversaNaoLidasSchema.safeParse(evento);
      if (!lido.success) return;
      atualizadasDuranteBusca.current.add(lido.data.conversaId);
      setEstado((atual) => ({ identidadeId: identidadeAtivaId, porConversa: aplicarNaoLidas(doEstado(atual), lido.data) }));
    };

    socket.on("connect", recarregar);
    socket.on(EVENTO_CONVERSA_NAO_LIDAS, aoMudarNaoLidas);
    void recarregar();
    return () => {
      geracao.current += 1;
      socket.off("connect", recarregar);
      socket.off(EVENTO_CONVERSA_NAO_LIDAS, aoMudarNaoLidas);
    };
  }, [identidadeAtivaId]);

  return estado.identidadeId === identidadeAtivaId ? totalNaoLidas(estado.porConversa) : 0;
}
