import { EVENTO_SAIDA_ATUALIZADA, eventoSaidaAtualizadaSchema } from "@jaa/contratos";
import { useEffect } from "react";
import { AppState } from "react-native";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { listarSaidas } from "../lib/api-entregas";
import { criarAvisoDeNovaRota } from "../lib/aviso-nova-rota";
import { tocarSomNovaRota } from "../lib/som-nova-rota";

// Um aviso para o app inteiro: a memória de "já avisei" sobrevive à troca de tela e à reconexão.
const aviso = criarAvisoDeNovaRota({ tocar: tocarSomNovaRota });

/**
 * SOM de nova rota em QUALQUER área do app (fica no layout das abas, como o som de mensagem).
 *
 * Duas fontes, a mesma memória: o evento `saida:atualizada` (chega na hora) e a lista completa relida
 * ao abrir, ao voltar ao primeiro plano e ao reconectar (cobre o que chegou com o app parado). A
 * primeira leitura só forma a memória. Só existe agindo como PESSOA: a conexão age como uma
 * identidade, e os eventos do entregador vão para a identidade pessoal.
 */
export function useAvisoNovaRota(identidadePessoalId: string | null): void {
  useEffect(() => {
    if (!identidadePessoalId) return;
    let ativo = true;
    const socket = obterClienteRealtime();

    const sincronizar = () => {
      void listarSaidas().then((resultado) => {
        if (ativo && resultado.ok) aviso.sincronizar(resultado.dados.saidas.map((saida) => saida.id));
      });
    };
    const aoAtualizarSaida = (evento: unknown) => {
      const lido = eventoSaidaAtualizadaSchema.safeParse(evento);
      if (lido.success) aviso.observar(lido.data.saida.id, lido.data.saida.entregador?.identidadeId === identidadePessoalId);
    };

    sincronizar();
    socket.on(EVENTO_SAIDA_ATUALIZADA, aoAtualizarSaida);
    socket.on("connect", sincronizar);
    const assinatura = AppState.addEventListener("change", (estado) => {
      if (estado === "active") sincronizar();
    });
    return () => {
      ativo = false;
      socket.off(EVENTO_SAIDA_ATUALIZADA, aoAtualizarSaida);
      socket.off("connect", sincronizar);
      assinatura.remove();
      aviso.esquecer();
    };
  }, [identidadePessoalId]);
}
