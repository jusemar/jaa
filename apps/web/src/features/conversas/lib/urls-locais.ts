/*
 * OBJECT URLs das prévias locais (arquivo escolhido, tentativa pendente). Cada uma segura o arquivo na
 * memória do navegador até ser revogada: este registro garante que toda URL criada seja revogada —
 * ao trocar o arquivo, cancelar, concluir o envio ou sair da conversa.
 */
export interface UrlsLocais {
  criar(arquivo: Blob): string;
  revogar(url: string | null | undefined): void;
  revogarTodas(): void;
  ativas(): number;
}

export function criarUrlsLocais(
  api: { createObjectURL: (arquivo: Blob) => string; revokeObjectURL: (url: string) => void } = URL,
): UrlsLocais {
  const criadas = new Set<string>();
  return {
    criar(arquivo) {
      const url = api.createObjectURL(arquivo);
      criadas.add(url);
      return url;
    },
    revogar(url) {
      if (!url || !criadas.delete(url)) return;
      api.revokeObjectURL(url);
    },
    revogarTodas() {
      for (const url of criadas) api.revokeObjectURL(url);
      criadas.clear();
    },
    ativas: () => criadas.size,
  };
}
