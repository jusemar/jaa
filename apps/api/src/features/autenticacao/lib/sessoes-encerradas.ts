type OuvinteSessaoEncerrada = (sessaoId: string) => void;

/**
 * Aviso interno de que uma sessão do Better Auth deixou de existir (logout, revogação,
 * expiração removida). Desacopla a autenticação de quem precisa reagir, como o realtime,
 * que derruba somente as conexões autenticadas por aquela sessão.
 */
export interface AvisoSessoesEncerradas {
  notificar(sessaoId: string): void;
  inscrever(ouvinte: OuvinteSessaoEncerrada): () => void;
}

export function criarAvisoSessoesEncerradas(): AvisoSessoesEncerradas {
  const ouvintes = new Set<OuvinteSessaoEncerrada>();

  return {
    notificar(sessaoId) {
      for (const ouvinte of ouvintes) {
        try {
          ouvinte(sessaoId);
        } catch {
          // Uma falha num ouvinte não pode impedir o logout nem os demais ouvintes.
        }
      }
    },
    inscrever(ouvinte) {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },
  };
}
