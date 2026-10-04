"use client";

import type { Mensagem } from "@jaa/contratos";
import { useCallback } from "react";
import { pedirUrlsAudios, pedirUrlsImagens } from "../lib/api-conversas";
import { idsDeAudiosVisiveis } from "../lib/audio-conversa";
import { idsDeImagensVisiveis } from "../lib/imagem-conversa";
import { useUrlsPrivadas } from "./use-urls-privadas";

/** URLs privadas das IMAGENS da conversa aberta (cache só em memória; ver `use-urls-privadas.ts`). */
export function useUrlsImagens(conversaId: string, mensagens: readonly Mensagem[]) {
  const pedir = useCallback(
    async (mensagemIds: string[]) => {
      const resposta = await pedirUrlsImagens(conversaId, mensagemIds);
      return resposta.ok ? { ...resposta, dados: resposta.dados.imagens } : resposta;
    },
    [conversaId],
  );
  return useUrlsPrivadas(mensagens, idsDeImagensVisiveis, pedir);
}

/** URLs privadas dos ÁUDIOS da conversa aberta: mesma regra, outra rota. */
export function useUrlsAudios(conversaId: string, mensagens: readonly Mensagem[]) {
  const pedir = useCallback(
    async (mensagemIds: string[]) => {
      const resposta = await pedirUrlsAudios(conversaId, mensagemIds);
      return resposta.ok ? { ...resposta, dados: resposta.dados.audios } : resposta;
    },
    [conversaId],
  );
  return useUrlsPrivadas(mensagens, idsDeAudiosVisiveis, pedir);
}
