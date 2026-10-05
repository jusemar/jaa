/*
 * SOM DE MENSAGEM RECEBIDA. QUANDO tocar é a regra comum `deveTocarSomDeMensagem` (@jaa/contratos):
 * nunca para a própria mensagem, nunca para a conversa que a pessoa está vendo. O gatilho é
 * `notificacao:nova-mensagem`, que o servidor só manda a DESTINATÁRIOS: enviar não toca, e carregar
 * histórico ou a lista não passa por aqui.
 *
 * Uma mensagem toca NO MÁXIMO UMA VEZ (por id): evento repetido ou reconexão não repetem o som.
 * Módulo puro: quem toca de verdade é injetado (`som-nativo.ts`).
 */
const LEMBRAR_ULTIMAS = 200;

export function criarAvisoSonoro(dependencias: { tocar: () => void; podeTocar?: () => boolean }) {
  const tocadas = new Set<string>();

  function lembrar(mensagemId: string): boolean {
    if (tocadas.has(mensagemId)) return false;
    tocadas.add(mensagemId);
    // Memória limitada: só as mais recentes importam para evitar repetição.
    if (tocadas.size > LEMBRAR_ULTIMAS) {
      const maisAntiga = tocadas.values().next().value;
      if (maisAntiga !== undefined) tocadas.delete(maisAntiga);
    }
    return true;
  }

  return {
    /**
     * Mensagem que chegou mas NÃO deve soar (a conversa dela está à vista): fica lembrada, para uma
     * reentrega do mesmo evento não tocar depois. true = ainda não era conhecida.
     */
    silenciar: lembrar,
    /** true = esta mensagem (id) ainda não tinha avisado. O som só sai se o aparelho estiver livre. */
    avisar(mensagemId: string): boolean {
      if (!lembrar(mensagemId)) return false;
      if (dependencias.podeTocar && !dependencias.podeTocar()) return true;
      try {
        dependencias.tocar();
      } catch {
        // Áudio indisponível não pode atrapalhar a conversa.
      }
      return true;
    },
  };
}
