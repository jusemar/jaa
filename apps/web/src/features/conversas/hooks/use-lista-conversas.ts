"use client";

import { EVENTO_MENSAGEM_NOVA, eventoMensagemNovaSchema, type ItemListaConversas, type Mensagem } from "@jaa/contratos";
import { useCallback, useEffect, useRef, useState } from "react";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { listarConversas } from "../lib/api-conversas";
import { aplicarMensagemNaLista, mesclarConversas } from "../lib/lista-conversas";

type EstadoLista = {
  itens: ItemListaConversas[];
  // Cursor da próxima página ainda não carregada. Definido pela 1ª carga e depois só por "carregar mais".
  proximoCursor: string | null;
  primeiraPaginaCarregada: boolean;
  carregandoMais: boolean;
  erro: string | null;
};

/**
 * Lista de conversas reconciliada entre HTTP e o evento realtime `mensagem:nova` já existente.
 * - mensagem de conversa carregada → sobe ao topo com nova prévia/horário (sem duplicar);
 * - mensagem de conversa ainda não carregada → recarrega a 1ª página (ela estará no topo);
 * - (re)conexão do socket → recarrega a 1ª página para cobrir eventos perdidos enquanto offline.
 */
export function useListaConversas() {
  const [estado, setEstado] = useState<EstadoLista>({
    itens: [],
    proximoCursor: null,
    primeiraPaginaCarregada: false,
    carregandoMais: false,
    erro: null,
  });
  const itensRef = useRef<ItemListaConversas[]>([]);
  const recarregandoRef = useRef(false);
  const repetirRecargaRef = useRef(false);

  useEffect(() => {
    itensRef.current = estado.itens;
  }, [estado.itens]);

  const recarregarPrimeiraPagina = useCallback(async () => {
    // Pedido durante uma recarga em andamento: a resposta dela pode ser anterior ao evento
    // que motivou o pedido, então repete assim que terminar.
    if (recarregandoRef.current) {
      repetirRecargaRef.current = true;
      return;
    }
    recarregandoRef.current = true;
    try {
      do {
        repetirRecargaRef.current = false;
        const pagina = await listarConversas();
        setEstado((atual) => {
          if (!pagina.ok) return { ...atual, erro: pagina.mensagem };
          return {
            ...atual,
            itens: mesclarConversas(atual.itens, pagina.dados.conversas),
            proximoCursor: atual.primeiraPaginaCarregada ? atual.proximoCursor : pagina.dados.proximoCursor,
            primeiraPaginaCarregada: true,
            erro: null,
          };
        });
      } while (repetirRecargaRef.current);
    } finally {
      recarregandoRef.current = false;
    }
  }, []);

  // Usado pelo realtime e pela resposta HTTP do envio: sem realtime, a lista ainda se atualiza.
  const registrarMensagem = useCallback(
    (mensagem: Mensagem) => {
      if (!aplicarMensagemNaLista(itensRef.current, mensagem).conhecida) {
        void recarregarPrimeiraPagina();
        return;
      }
      setEstado((atual) => ({ ...atual, itens: aplicarMensagemNaLista(atual.itens, mensagem).lista }));
    },
    [recarregarPrimeiraPagina],
  );

  useEffect(() => {
    const socket = obterClienteRealtime();

    const aoReceber = (evento: unknown) => {
      const resultado = eventoMensagemNovaSchema.safeParse(evento);
      if (resultado.success) registrarMensagem(resultado.data.mensagem);
    };
    const aoConectar = () => void recarregarPrimeiraPagina();

    socket.on(EVENTO_MENSAGEM_NOVA, aoReceber);
    socket.on("connect", aoConectar);
    void recarregarPrimeiraPagina();
    return () => {
      socket.off(EVENTO_MENSAGEM_NOVA, aoReceber);
      socket.off("connect", aoConectar);
    };
  }, [recarregarPrimeiraPagina, registrarMensagem]);

  const carregarMais = useCallback(async () => {
    const cursor = estado.proximoCursor;
    if (!cursor || estado.carregandoMais) return;
    setEstado((atual) => ({ ...atual, carregandoMais: true }));
    const pagina = await listarConversas(cursor);
    setEstado((atual) =>
      pagina.ok
        ? {
            ...atual,
            itens: mesclarConversas(atual.itens, pagina.dados.conversas),
            proximoCursor: pagina.dados.proximoCursor,
            carregandoMais: false,
            erro: null,
          }
        : { ...atual, carregandoMais: false, erro: pagina.mensagem },
    );
  }, [estado.proximoCursor, estado.carregandoMais]);

  return { ...estado, carregarMais, registrarMensagem };
}
