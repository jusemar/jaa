import { EVENTO_NOTIFICACAO_NOVA_MENSAGEM, deveTocarSomDeMensagem, eventoNotificacaoNovaMensagemSchema } from "@jaa/contratos";
import { useEffect } from "react";
import { AppState } from "react-native";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { obterConversaEmLeitura } from "../lib/conversa-em-leitura";
import { criarAvisoSonoro } from "../lib/som-mensagem";
import { aparelhoLivreParaSom, tocarSomMensagem } from "../lib/som-nativo";

// Um aviso para o app inteiro: a memória de "já tocou" sobrevive à troca de tela e à reconexão.
const aviso = criarAvisoSonoro({ tocar: tocarSomMensagem, podeTocar: aparelhoLivreParaSom });

/**
 * Conversa que a pessoa está VENDO agora: a tela da conversa em foco (registrada por ela em
 * `conversa-em-leitura`) E o app em primeiro plano. Tela aberta com o app em segundo plano não conta.
 */
function conversaVisivelAgora(): string | null {
  return AppState.currentState === "active" ? obterConversaEmLeitura() : null;
}

/**
 * SOM de mensagem RECEBIDA em qualquer área do app, como o `useAvisosMensagens` da Web — exceto da
 * conversa que está na tela. Não é push: só existe com o app aberto e conectado. A conexão age como
 * UMA identidade, então o evento já chega só para a identidade atuante.
 */
export function useSomMensagens(identidadeAtivaId: string | null): void {
  useEffect(() => {
    if (!identidadeAtivaId) return;
    const socket = obterClienteRealtime();
    const aoReceberMensagem = (evento: unknown) => {
      const lido = eventoNotificacaoNovaMensagemSchema.safeParse(evento);
      if (!lido.success) return;
      const tocar = deveTocarSomDeMensagem({
        remetenteIdentidadeId: lido.data.remetente.identidadeId,
        conversaId: lido.data.conversaId,
        identidadeAtivaId,
        conversaVisivelId: conversaVisivelAgora(),
      });
      if (tocar) aviso.avisar(lido.data.mensagemId);
      else aviso.silenciar(lido.data.mensagemId);
    };
    socket.on(EVENTO_NOTIFICACAO_NOVA_MENSAGEM, aoReceberMensagem);
    return () => {
      socket.off(EVENTO_NOTIFICACAO_NOVA_MENSAGEM, aoReceberMensagem);
    };
  }, [identidadeAtivaId]);
}
