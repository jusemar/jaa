import { EVENTO_NOTIFICACAO_NOVA_MENSAGEM, EVENTO_PEDIDO_NOVO, deveTocarSomDeMensagem, eventoNotificacaoNovaMensagemSchema, eventoPedidoNovoSchema } from "@jaa/contratos";
import { useEffect } from "react";
import { AppState } from "react-native";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { avisarUmaVez } from "@/lib/sons/avisar";
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
export function useSomMensagens(identidadeAtivaId: string | null, agindoComoEmpresa = false): void {
  useEffect(() => {
    if (!identidadeAtivaId) return;
    const socket = obterClienteRealtime();
    /*
     * NOVO PEDIDO para a EMPRESA (`pedido:novo`, que o servidor manda só à identidade da empresa):
     * toca o som de pedido, uma vez por pedido. Pedido não é mensagem para a empresa — não vem
     * notificação junto, então o som de mensagem não toca por causa dele.
     */
    const aoChegarPedido = (evento: unknown) => {
      if (!agindoComoEmpresa) return;
      const lido = eventoPedidoNovoSchema.safeParse(evento);
      if (lido.success && aparelhoLivreParaSom()) avisarUmaVez("novoPedido", `pedido-novo:${lido.data.pedidoId}`);
    };
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
    socket.on(EVENTO_PEDIDO_NOVO, aoChegarPedido);
    socket.on(EVENTO_NOTIFICACAO_NOVA_MENSAGEM, aoReceberMensagem);
    return () => {
      socket.off(EVENTO_PEDIDO_NOVO, aoChegarPedido);
      socket.off(EVENTO_NOTIFICACAO_NOVA_MENSAGEM, aoReceberMensagem);
    };
  }, [identidadeAtivaId, agindoComoEmpresa]);
}
