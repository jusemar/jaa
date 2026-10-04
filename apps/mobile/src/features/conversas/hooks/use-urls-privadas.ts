import type { Mensagem, UrlImagem } from "@jaa/contratos";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { RespostaApi } from "@/lib/api";
import { criarCacheUrlsImagens, type CacheUrlsImagens, type EstadoImagem } from "../lib/urls-imagens";

const NOVAS_TENTATIVAS = 3;

/**
 * URLs privadas dos anexos (imagens ou áudios) da conversa ABERTA. O cache nasce com a conversa e
 * morre com ela (só memória). A cada mudança nas mensagens — histórico, página anterior,
 * `mensagem:nova` — pede em lote só o que falta; mensagem que deixou de ter anexo visível (excluída
 * para mim ou para todos) é esquecida. `pedir` e `idsVisiveis` dizem de qual tipo de anexo se trata.
 */
export function useUrlsPrivadas(
  mensagens: readonly Mensagem[],
  idsVisiveis: (mensagens: readonly Mensagem[]) => string[],
  pedir: (mensagemIds: string[]) => Promise<RespostaApi<UrlImagem[]>>,
): { estadoDaImagem: (mensagemId: string) => EstadoImagem; cache: CacheUrlsImagens } {
  const [cache] = useState(() =>
    criarCacheUrlsImagens({
      buscar: async (mensagemIds) => {
        const resposta = await pedir(mensagemIds);
        // Rede/servidor: passageiro (tenta de novo depois). 4xx: a API recusou; nada volta para estes ids.
        if (!resposta.ok) return resposta.status === 0 || resposta.status >= 500 ? null : [];
        return resposta.dados;
      },
    }),
  );
  useSyncExternalStore(cache.assinar, cache.versao, cache.versao);

  // `idsVisiveis` é uma função de módulo (estável): só as mensagens mudam.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ids = useMemo(() => idsVisiveis(mensagens), [mensagens]);
  const chave = ids.join(",");
  const conhecidos = useRef<readonly string[]>([]);

  useEffect(() => {
    let ativo = true;
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    // Falha passageira (rede/servidor) deixa imagens "carregando": tenta de novo algumas vezes, com
    // intervalo crescente, em vez de deixá-las assim até a próxima mensagem chegar.
    const buscar = (tentativa: number) => {
      void cache.garantir(ids).then(() => {
        if (!ativo || tentativa >= NOVAS_TENTATIVAS) return;
        if (ids.some((id) => cache.estado(id).situacao === "carregando")) temporizador = setTimeout(() => buscar(tentativa + 1), 3000 * (tentativa + 1));
      });
    };
    buscar(0);
    // Saíram da lista de imagens visíveis: a URL não é mais guardada nem renovada.
    for (const id of conhecidos.current) if (!ids.includes(id)) cache.esquecer(id);
    conhecidos.current = ids;
    return () => {
      ativo = false;
      clearTimeout(temporizador);
    };
    // `chave` resume `ids` (o array muda de identidade a cada render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache, chave]);

  return { estadoDaImagem: (mensagemId) => cache.estado(mensagemId), cache };
}
