export interface MudancaDigitando {
  conversaId: string;
  identidadeId: string;
  digitando: boolean;
}

export type OuvinteDigitando = (mudanca: MudancaDigitando) => void;

/**
 * "Digitando" EFÊMERO por (conversa, identidade), agregado entre as conexões da identidade:
 * digita enquanto qualquer conexão dela estiver digitando. Nunca persistido.
 * Interface própria para permitir implementação compartilhada entre instâncias no futuro.
 */
export interface RegistroDigitando {
  informar(entrada: MudancaDigitando & { conexaoId: string }): void;
  // Parada imediata de uma identidade na conversa (ex.: mensagem enviada), em todas as conexões.
  pararIdentidade(conversaId: string, identidadeId: string): void;
  // Conexão deixou de observar a conversa.
  pararConexaoNaConversa(conversaId: string, conexaoId: string): void;
  // Conexão encerrada: para tudo o que ela digitava.
  encerrarConexao(conexaoId: string): void;
  inscrever(ouvinte: OuvinteDigitando): () => void;
  encerrar(): void;
}

// Sem renovação neste prazo, o servidor considera que a conexão parou (evento final perdido, aba travada).
export const VALIDADE_DIGITANDO_SERVIDOR_MS = 6000;
// Renovações "digitando" mais frequentes que isto são absorvidas, não repassadas.
export const INTERVALO_MINIMO_REPASSE_DIGITANDO_MS = 2000;

interface EstadoIdentidadeNaConversa {
  conversaId: string;
  identidadeId: string;
  expiracoesPorConexao: Map<string, ReturnType<typeof setTimeout>>;
  ultimoRepasseEm: number;
}

/**
 * Implementação em memória (uma instância da API). Avisa:
 * - `digitando: true` ao começar e, no máximo a cada INTERVALO_MINIMO_REPASSE, ao renovar
 *   (mantém viva a validade do lado de quem recebe);
 * - `digitando: false` só quando a ÚLTIMA conexão da identidade para (aviso, envio, saída, queda ou validade).
 */
export function criarRegistroDigitandoEmMemoria({
  validadeMs = VALIDADE_DIGITANDO_SERVIDOR_MS,
  intervaloMinimoRepasseMs = INTERVALO_MINIMO_REPASSE_DIGITANDO_MS,
  agora = () => Date.now(),
} = {}): RegistroDigitando {
  const estados = new Map<string, EstadoIdentidadeNaConversa>();
  const chavesPorConexao = new Map<string, Set<string>>();
  const ouvintes = new Set<OuvinteDigitando>();

  const chave = (conversaId: string, identidadeId: string) => `${conversaId}|${identidadeId}`;

  function avisar(estado: EstadoIdentidadeNaConversa, digitando: boolean) {
    for (const ouvinte of ouvintes) {
      try {
        ouvinte({ conversaId: estado.conversaId, identidadeId: estado.identidadeId, digitando });
      } catch {
        // Falha de entrega não pode corromper o registro.
      }
    }
  }

  function removerConexao(chaveEstado: string, conexaoId: string) {
    const estado = estados.get(chaveEstado);
    const expiracao = estado?.expiracoesPorConexao.get(conexaoId);
    if (!estado || expiracao === undefined) return;

    clearTimeout(expiracao);
    estado.expiracoesPorConexao.delete(conexaoId);
    chavesPorConexao.get(conexaoId)?.delete(chaveEstado);

    if (estado.expiracoesPorConexao.size === 0) {
      estados.delete(chaveEstado);
      avisar(estado, false);
    }
  }

  return {
    informar({ conversaId, identidadeId, conexaoId, digitando }) {
      const chaveEstado = chave(conversaId, identidadeId);
      if (!digitando) {
        removerConexao(chaveEstado, conexaoId);
        return;
      }

      let estado = estados.get(chaveEstado);
      const comecou = !estado;
      if (!estado) {
        estado = { conversaId, identidadeId, expiracoesPorConexao: new Map(), ultimoRepasseEm: 0 };
        estados.set(chaveEstado, estado);
      }

      clearTimeout(estado.expiracoesPorConexao.get(conexaoId));
      estado.expiracoesPorConexao.set(
        conexaoId,
        setTimeout(() => removerConexao(chaveEstado, conexaoId), validadeMs),
      );
      chavesPorConexao.set(conexaoId, (chavesPorConexao.get(conexaoId) ?? new Set()).add(chaveEstado));

      const instante = agora();
      if (comecou || instante - estado.ultimoRepasseEm >= intervaloMinimoRepasseMs) {
        estado.ultimoRepasseEm = instante;
        avisar(estado, true);
      }
    },

    pararIdentidade(conversaId, identidadeId) {
      const chaveEstado = chave(conversaId, identidadeId);
      for (const conexaoId of [...(estados.get(chaveEstado)?.expiracoesPorConexao.keys() ?? [])]) {
        removerConexao(chaveEstado, conexaoId);
      }
    },

    pararConexaoNaConversa(conversaId, conexaoId) {
      for (const chaveEstado of [...(chavesPorConexao.get(conexaoId) ?? [])]) {
        if (estados.get(chaveEstado)?.conversaId === conversaId) removerConexao(chaveEstado, conexaoId);
      }
    },

    encerrarConexao(conexaoId) {
      for (const chaveEstado of [...(chavesPorConexao.get(conexaoId) ?? [])]) removerConexao(chaveEstado, conexaoId);
      chavesPorConexao.delete(conexaoId);
    },

    inscrever(ouvinte) {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },

    encerrar() {
      for (const estado of estados.values()) {
        for (const expiracao of estado.expiracoesPorConexao.values()) clearTimeout(expiracao);
      }
      estados.clear();
      chavesPorConexao.clear();
      ouvintes.clear();
    },
  };
}
