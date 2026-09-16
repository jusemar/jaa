export type OuvintePresenca = (mudanca: { identidadeId: string; online: boolean }) => void;

/**
 * Presença da IDENTIDADE (não da conta, sessão ou socket): online enquanto houver ao menos uma
 * conexão realtime autenticada dela, em qualquer aba/dispositivo.
 * Interface própria para que a implementação em memória possa ser trocada por uma compartilhada
 * (ex.: várias instâncias da API) sem mudar quem a usa.
 */
export interface RegistroPresenca {
  conectar(identidadeId: string, conexaoId: string): void;
  desconectar(identidadeId: string, conexaoId: string): void;
  estaOnline(identidadeId: string): boolean;
  // Avisado só nas TRANSIÇÕES online ↔ offline.
  inscrever(ouvinte: OuvintePresenca): () => void;
  encerrar(): void;
}

// Reload ou reconexão normal do Socket.IO levam ~1–3 s: dentro deste prazo não há "offline" falso.
export const TOLERANCIA_OFFLINE_MS = 5000;

/**
 * Implementação em memória, válida para UMA instância da API.
 * Última conexão encerrada → offline só depois da tolerância, e só se ninguém reconectou nesse meio
 * tempo. Reconexão dentro da tolerância não gera nenhum evento (nem offline, nem online).
 */
export function criarRegistroPresencaEmMemoria({ toleranciaOfflineMs = TOLERANCIA_OFFLINE_MS } = {}): RegistroPresenca {
  const conexoesPorIdentidade = new Map<string, Set<string>>();
  const saidasPendentes = new Map<string, ReturnType<typeof setTimeout>>();
  const ouvintes = new Set<OuvintePresenca>();

  function avisar(identidadeId: string, online: boolean) {
    for (const ouvinte of ouvintes) {
      try {
        ouvinte({ identidadeId, online });
      } catch {
        // Falha de um ouvinte (entrega realtime) não pode corromper o registro.
      }
    }
  }

  return {
    conectar(identidadeId, conexaoId) {
      const conexoes = conexoesPorIdentidade.get(identidadeId) ?? new Set<string>();
      const estavaOnline = conexoes.size > 0 || saidasPendentes.has(identidadeId);
      conexoes.add(conexaoId);
      conexoesPorIdentidade.set(identidadeId, conexoes);

      const saida = saidasPendentes.get(identidadeId);
      if (saida) {
        clearTimeout(saida);
        saidasPendentes.delete(identidadeId);
      }
      if (!estavaOnline) avisar(identidadeId, true);
    },

    desconectar(identidadeId, conexaoId) {
      const conexoes = conexoesPorIdentidade.get(identidadeId);
      if (!conexoes?.delete(conexaoId) || conexoes.size > 0) return;

      conexoesPorIdentidade.delete(identidadeId);
      saidasPendentes.set(
        identidadeId,
        setTimeout(() => {
          saidasPendentes.delete(identidadeId);
          if (!conexoesPorIdentidade.has(identidadeId)) avisar(identidadeId, false);
        }, toleranciaOfflineMs),
      );
    },

    estaOnline(identidadeId) {
      return conexoesPorIdentidade.has(identidadeId) || saidasPendentes.has(identidadeId);
    },

    inscrever(ouvinte) {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },

    encerrar() {
      for (const saida of saidasPendentes.values()) clearTimeout(saida);
      saidasPendentes.clear();
      conexoesPorIdentidade.clear();
      ouvintes.clear();
    },
  };
}
