/*
 * ALERTA DE NOVA ROTA. Toca UMA vez quando uma rota passa a ser do entregador — e nunca de novo para
 * a mesma rota: nem em atualização de status, nem em recarga, nem ao navegar, nem ao reconectar.
 *
 * A "identidade" lembrada é o id da SAÍDA enquanto ela é dele. Se a rota deixa de ser dele (recusou,
 * foi transferida, terminou), é esquecida: se voltar a ser atribuída, é uma atribuição nova e avisa.
 *
 * A primeira leitura depois de abrir o app só forma a memória (não toca): o que já estava lá não é
 * novidade. Módulo puro — quem toca de verdade é injetado.
 */
export function criarAvisoDeNovaRota(dependencias: { tocar: () => void }) {
  let conhecidas: Set<string> | null = null;

  function tocar() {
    try {
      dependencias.tocar();
    } catch {
      // Áudio indisponível não pode atrapalhar a operação.
    }
  }

  return {
    /** Lista COMPLETA das minhas rotas (carga inicial, volta ao primeiro plano, reconexão). Devolve as novas. */
    sincronizar(saidaIds: readonly string[]): string[] {
      const anteriores = conhecidas;
      conhecidas = new Set(saidaIds);
      if (anteriores === null) return [];
      const novas = saidaIds.filter((id) => !anteriores.has(id));
      if (novas.length > 0) tocar();
      return novas;
    },
    /** Evento de UMA rota. `minha: false` = deixou de ser minha. true = era nova e avisou. */
    observar(saidaId: string, minha: boolean): boolean {
      // Antes da primeira leitura não há como saber o que é novo: a leitura inicial decide.
      if (conhecidas === null) return false;
      if (!minha) {
        conhecidas.delete(saidaId);
        return false;
      }
      if (conhecidas.has(saidaId)) return false;
      conhecidas.add(saidaId);
      tocar();
      return true;
    },
    /** Saiu da conta / trocou de identidade: a memória não vale para outra pessoa. */
    esquecer() {
      conhecidas = null;
    },
  };
}
