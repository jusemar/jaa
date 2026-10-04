import { LIMITE_URLS_IMAGENS_POR_PEDIDO, type UrlImagem } from "@jaa/contratos";

/*
 * CACHE DAS URLs PRIVADAS das imagens de UMA conversa aberta — SÓ EM MEMÓRIA.
 *
 * A imagem é privada: a mensagem traz apenas os metadados do anexo, e a URL assinada (≈ 20 min) é
 * pedida à API em LOTE. Ela nunca vai para localStorage/IndexedDB nem para dentro da `Mensagem`:
 * vive neste objeto, que morre com a conversa aberta. Reabrir a conversa pede URLs novas.
 *
 * Sem DOM e sem React: a busca e o relógio chegam por parâmetro (testável em Node).
 */

// Uma URL só é reaproveitada se ainda valer por este tempo (o carregamento da imagem leva um instante).
export const MARGEM_EXPIRACAO_MS = 60_000;

export type EstadoImagem =
  | { situacao: "carregando" }
  | { situacao: "pronta"; url: string }
  // Não veio URL (excluída, sem acesso) ou a renovação também falhou: nada mais é tentado sozinho.
  | { situacao: "indisponivel" };

/** Busca as URLs de até 100 ids. `null` = falha passageira (rede/servidor): tentar de novo depois. */
export type BuscarUrlsImagens = (mensagemIds: string[]) => Promise<UrlImagem[] | null>;

export interface CacheUrlsImagens {
  estado(mensagemId: string): EstadoImagem;
  /** Pede, em lote, as URLs que faltam ou venceram entre os ids dados. Ids em andamento não repetem. */
  garantir(mensagemIds: readonly string[]): Promise<void>;
  /** A imagem falhou ao carregar: renova a URL UMA vez; se falhar de novo, fica indisponível. */
  aoFalharCarregamento(mensagemId: string): Promise<void>;
  /** A imagem carregou: uma falha futura (URL vencida daqui a 20 min) volta a ter direito a uma renovação. */
  aoCarregar(mensagemId: string): void;
  /** Mensagem excluída (para mim ou para todos): a URL sai da memória e não é mais pedida. */
  esquecer(mensagemId: string): void;
  assinar(ouvinte: () => void): () => void;
  /** Muda a cada alteração (para o React reler). */
  versao(): number;
}

export function criarCacheUrlsImagens({ buscar, agora = () => Date.now() }: { buscar: BuscarUrlsImagens; agora?: () => number }): CacheUrlsImagens {
  const urls = new Map<string, { url: string; expiraEmMs: number }>();
  const indisponiveis = new Set<string>();
  const emAndamento = new Set<string>();
  const renovadas = new Set<string>();
  const ouvintes = new Set<() => void>();
  let versao = 0;

  const avisar = () => {
    versao += 1;
    for (const ouvinte of ouvintes) ouvinte();
  };

  const valida = (mensagemId: string) => {
    const guardada = urls.get(mensagemId);
    return guardada !== undefined && guardada.expiraEmMs - agora() > MARGEM_EXPIRACAO_MS;
  };

  async function buscarLote(ids: string[]): Promise<void> {
    for (const id of ids) emAndamento.add(id);
    try {
      const recebidas = await buscar(ids);
      // Falha passageira: nada muda; uma próxima chamada tenta de novo.
      if (recebidas === null) return;
      const vieram = new Set<string>();
      for (const item of recebidas) {
        vieram.add(item.mensagemId);
        urls.set(item.mensagemId, { url: item.url, expiraEmMs: new Date(item.expiraEm).getTime() });
        indisponiveis.delete(item.mensagemId);
      }
      // A API devolve só o que a identidade pode ver: o que não voltou não tem imagem para ela.
      for (const id of ids) {
        if (!vieram.has(id)) {
          urls.delete(id);
          indisponiveis.add(id);
        }
      }
    } finally {
      for (const id of ids) emAndamento.delete(id);
      avisar();
    }
  }

  async function pedir(ids: string[]): Promise<void> {
    const lotes: string[][] = [];
    for (let inicio = 0; inicio < ids.length; inicio += LIMITE_URLS_IMAGENS_POR_PEDIDO) lotes.push(ids.slice(inicio, inicio + LIMITE_URLS_IMAGENS_POR_PEDIDO));
    await Promise.all(lotes.map(buscarLote));
  }

  return {
    estado(mensagemId) {
      const guardada = urls.get(mensagemId);
      // URL já entregue continua em uso mesmo perto de vencer: a imagem carregada não some da tela.
      if (guardada) return { situacao: "pronta", url: guardada.url };
      return indisponiveis.has(mensagemId) ? { situacao: "indisponivel" } : { situacao: "carregando" };
    },
    async garantir(mensagemIds) {
      const faltam = [...new Set(mensagemIds)].filter((id) => !valida(id) && !indisponiveis.has(id) && !emAndamento.has(id));
      if (faltam.length > 0) await pedir(faltam);
    },
    async aoFalharCarregamento(mensagemId) {
      if (emAndamento.has(mensagemId)) return;
      if (renovadas.has(mensagemId)) {
        // Já renovou uma vez e falhou de novo: para aqui (sem laço infinito).
        urls.delete(mensagemId);
        indisponiveis.add(mensagemId);
        avisar();
        return;
      }
      renovadas.add(mensagemId);
      urls.delete(mensagemId);
      avisar();
      await pedir([mensagemId]);
      if (!urls.has(mensagemId)) {
        indisponiveis.add(mensagemId);
        avisar();
      }
    },
    aoCarregar(mensagemId) {
      renovadas.delete(mensagemId);
    },
    esquecer(mensagemId) {
      const tinha = urls.delete(mensagemId);
      indisponiveis.delete(mensagemId);
      renovadas.delete(mensagemId);
      if (tinha) avisar();
    },
    assinar(ouvinte) {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },
    versao: () => versao,
  };
}
