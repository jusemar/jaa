/*
 * PAINEL LATERAL recolhido ou aberto: preferência VISUAL deste navegador (nada de conversa, contato
 * ou conta é guardado). Armazenamento indisponível (modo privado, bloqueio) não quebra nada: a
 * preferência só deixa de sobreviver ao recarregar.
 */
const CHAVE = "jaa.painel-lateral-recolhido";

type Armazenamento = Pick<Storage, "getItem" | "setItem">;

export interface PreferenciaPainel {
  recolhido(): boolean;
  definir(recolhido: boolean): void;
  alternar(): void;
  assinar(ouvinte: () => void): () => void;
}

export function criarPreferenciaPainel(armazenamento: () => Armazenamento | null): PreferenciaPainel {
  const ouvintes = new Set<() => void>();
  let valor: boolean | null = null;

  const ler = (): boolean => {
    if (valor !== null) return valor;
    try {
      valor = armazenamento()?.getItem(CHAVE) === "1";
    } catch {
      valor = false;
    }
    return valor;
  };

  const definir = (recolhido: boolean) => {
    valor = recolhido;
    try {
      armazenamento()?.setItem(CHAVE, recolhido ? "1" : "0");
    } catch {
      // Sem armazenamento: vale só nesta visita.
    }
    for (const ouvinte of ouvintes) ouvinte();
  };

  return {
    recolhido: ler,
    definir,
    alternar: () => definir(!ler()),
    assinar(ouvinte) {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },
  };
}

export const preferenciaPainel = criarPreferenciaPainel(() => (typeof window === "undefined" ? null : window.localStorage));
