import type { IdentidadeVisivel, ParticipanteConversa, PerfilPublico } from "@jaa/contratos";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { buscarPerfilPublico } from "@/features/perfil/lib/api-perfil";
import { identidadeDoCabecalho } from "../lib/identidade-da-conversa";

/**
 * Identidade ATUAL do outro lado, para o cabeçalho: relida da API ao abrir a conversa e quando o app
 * volta ao primeiro plano (foto trocada na Web ou em outro aparelho aparece sem reabrir). Enquanto a
 * resposta não chega, usa o que a rota trouxe (com a prévia da foto, se houver). Nada é guardado no
 * aparelho: a foto continua vindo só da API.
 */
export function useIdentidadeDaConversa(base: ParticipanteConversa, previaFotoUrl: string | null): IdentidadeVisivel {
  const [carregada, setCarregada] = useState<PerfilPublico | null>(null);
  const identidadeId = base.identidadeId;

  useEffect(() => {
    let ativo = true;
    const carregar = () => {
      void buscarPerfilPublico(identidadeId).then((resposta) => {
        // Falha de rede: fica com o que já tinha (prévia ou última leitura), sem erro na tela.
        if (ativo && resposta.ok) setCarregada(resposta.dados);
      });
    };
    carregar();
    const assinatura = AppState.addEventListener("change", (situacao) => {
      if (situacao === "active") carregar();
    });
    return () => {
      ativo = false;
      assinatura.remove();
    };
  }, [identidadeId]);

  return identidadeDoCabecalho(base, previaFotoUrl, carregada);
}
