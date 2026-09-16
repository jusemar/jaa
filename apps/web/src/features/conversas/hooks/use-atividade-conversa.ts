"use client";

import {
  EVENTO_CONVERSA_DEIXAR_DE_OBSERVAR,
  EVENTO_CONVERSA_OBSERVAR,
  EVENTO_DIGITANDO_ATUALIZADO,
  EVENTO_DIGITANDO_INFORMAR,
  EVENTO_MENSAGEM_NOVA,
  EVENTO_PRESENCA_ATUALIZADA,
  VALIDADE_DIGITANDO_MS,
  eventoDigitandoAtualizadoSchema,
  eventoMensagemNovaSchema,
  eventoPresencaAtualizadaSchema,
  respostaObservarConversaSchema,
} from "@jaa/contratos";
import { useCallback, useEffect, useRef, useState } from "react";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { criarControleDigitacao, criarIndicadorDigitando } from "../lib/digitacao";

// null = desconhecida (sem conexão realtime ou ainda não autorizada pelo servidor).
export type PresencaExibida = "online" | "offline" | null;

/**
 * Atividade efêmera da conversa ABERTA: presença da outra identidade e "digitando" nos dois sentidos.
 * O cliente só pede para observar a conversa; quem autoriza e decide a quem entregar é o servidor.
 * Cada (re)conexão pede de novo (a observação pertence à conexão) e recebe o estado atual.
 */
export function useAtividadeConversa({ conversaId, outraIdentidadeId }: { conversaId: string; outraIdentidadeId: string }) {
  const [presenca, setPresenca] = useState<PresencaExibida>(null);
  const [outraDigitando, setOutraDigitando] = useState(false);
  const controleRef = useRef<ReturnType<typeof criarControleDigitacao> | null>(null);

  useEffect(() => {
    const socket = obterClienteRealtime();
    let ativo = true;
    const indicador = criarIndicadorDigitando({ validadeMs: VALIDADE_DIGITANDO_MS, aoMudar: setOutraDigitando });
    const controle = criarControleDigitacao({
      emitir: (digitando) => {
        if (socket.connected) socket.emit(EVENTO_DIGITANDO_INFORMAR, { conversaId, digitando });
      },
    });
    controleRef.current = controle;

    const observar = async () => {
      try {
        const resposta = respostaObservarConversaSchema.safeParse(
          await socket.timeout(5000).emitWithAck(EVENTO_CONVERSA_OBSERVAR, { conversaId }),
        );
        if (!ativo || !resposta.success || !resposta.data.ok) return;
        const outra = resposta.data.presencas.find((item) => item.identidadeId === outraIdentidadeId);
        setPresenca(outra ? (outra.online ? "online" : "offline") : null);
      } catch {
        // Sem resposta a tempo: a próxima (re)conexão tenta novamente.
      }
    };

    const aoAtualizarPresenca = (evento: unknown) => {
      const resultado = eventoPresencaAtualizadaSchema.safeParse(evento);
      if (resultado.success && resultado.data.identidadeId === outraIdentidadeId) {
        setPresenca(resultado.data.online ? "online" : "offline");
      }
    };
    const aoAtualizarDigitando = (evento: unknown) => {
      const resultado = eventoDigitandoAtualizadoSchema.safeParse(evento);
      if (resultado.success && resultado.data.conversaId === conversaId && resultado.data.identidadeId === outraIdentidadeId) {
        indicador.receber(resultado.data.digitando);
      }
    };
    // A mensagem chegou: quem digitava terminou, mesmo que o aviso de parada se perca.
    const aoReceberMensagem = (evento: unknown) => {
      const resultado = eventoMensagemNovaSchema.safeParse(evento);
      if (resultado.success && resultado.data.mensagem.conversaId === conversaId && resultado.data.mensagem.remetenteIdentidadeId === outraIdentidadeId) {
        indicador.limpar();
      }
    };
    const aoConectar = () => void observar();
    const aoDesconectar = () => {
      setPresenca(null);
      indicador.limpar();
      controle.redefinir();
    };

    socket.on(EVENTO_PRESENCA_ATUALIZADA, aoAtualizarPresenca);
    socket.on(EVENTO_DIGITANDO_ATUALIZADO, aoAtualizarDigitando);
    socket.on(EVENTO_MENSAGEM_NOVA, aoReceberMensagem);
    socket.on("connect", aoConectar);
    socket.on("disconnect", aoDesconectar);
    if (socket.connected) void observar();

    return () => {
      ativo = false;
      controle.parar();
      controleRef.current = null;
      indicador.limpar();
      if (socket.connected) socket.emit(EVENTO_CONVERSA_DEIXAR_DE_OBSERVAR, { conversaId });
      socket.off(EVENTO_PRESENCA_ATUALIZADA, aoAtualizarPresenca);
      socket.off(EVENTO_DIGITANDO_ATUALIZADO, aoAtualizarDigitando);
      socket.off(EVENTO_MENSAGEM_NOVA, aoReceberMensagem);
      socket.off("connect", aoConectar);
      socket.off("disconnect", aoDesconectar);
    };
  }, [conversaId, outraIdentidadeId]);

  const informarTexto = useCallback((texto: string) => controleRef.current?.aoAlterarTexto(texto), []);
  const pararDigitacao = useCallback(() => controleRef.current?.parar(), []);

  return { presenca, outraDigitando, informarTexto, pararDigitacao };
}
