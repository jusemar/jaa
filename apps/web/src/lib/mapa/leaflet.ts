/**
 * Ponto único de inicialização do Leaflet no Web.
 *
 * Existe por causa de um problema REAL observado em desenvolvimento: o React monta, desmonta e monta
 * o efeito de novo (StrictMode). Como a criação do mapa é assíncrona (import dinâmico), a segunda
 * execução encontrava o container já marcado pelo Leaflet e falhava com "Map container is already
 * initialized" — o primeiro mapa era destruído no meio do caminho, as requisições de tile eram
 * abortadas e sobrava o RETÂNGULO CINZA.
 *
 * `montarMapaLeaflet` torna o ciclo idempotente: limpa a marca do container antes de criar, devolve o
 * cancelamento certo para o `return` do efeito e destrói o mapa mesmo quando ele nasce depois do
 * desmonte.
 */
export type LeafletModulo = typeof import("leaflet");

interface ContainerComMarca extends HTMLElement {
  _leaflet_id?: number;
}

/*
 * Qual mapa está em cada container. Assim a remontagem DESTRÓI a instância anterior de verdade, em
 * vez de só apagar a marca do Leaflet (o que deixava dois mapas disputando o mesmo elemento).
 */
const mapasPorContainer = new WeakMap<HTMLElement, { remove: () => void }>();

/** Libera o container: destrói o mapa anterior (se houver) e apaga a marca deixada pelo Leaflet. */
export function liberarContainer(elemento: HTMLElement): void {
  const anterior = mapasPorContainer.get(elemento);
  if (anterior) destruirMapa(elemento, anterior);

  const marcado = elemento as ContainerComMarca;
  if (marcado._leaflet_id !== undefined) {
    delete marcado._leaflet_id;
    elemento.innerHTML = "";
  }
}

/**
 * Destrói um mapa SEM NUNCA lançar.
 *
 * `Map.remove()` do Leaflet lança "Map container is being reused by another instance" quando o
 * container já foi liberado por outra montagem — o que acontece o tempo todo no StrictMode, em que o
 * React monta, desmonta e monta de novo enquanto a criação (assíncrona) ainda está no ar.
 *
 * Isso não era só um aviso: a exceção interrompia a limpeza no meio. Quando ela acontecia DEPOIS de o
 * mapa ter perdido seus ouvintes, sobrava na tela um mapa que aparece normalmente, carrega os tiles e
 * NÃO RESPONDE a arrastar nem a clicar — exatamente o sintoma de "o mapa aparece mas não consigo
 * ajustar o ponto". Por isso a destruição é sempre protegida, e quem deve ser desligado é o mapa
 * inteiro (`remove`), nunca só os ouvintes.
 */
export function destruirMapa(elemento: HTMLElement, mapa: { remove: () => void }): void {
  if (mapasPorContainer.get(elemento) === mapa) mapasPorContainer.delete(elemento);
  try {
    mapa.remove();
  } catch {
    // Container já reaproveitado por outra instância: a limpeza que importa é a do container, abaixo.
  }
}

export function registrarMapa(elemento: HTMLElement, mapa: { remove: () => void }): void {
  mapasPorContainer.set(elemento, mapa);
}

export interface MapaMontado {
  cancelar(): void;
}

/**
 * Monta um mapa no elemento e devolve o cancelamento para o efeito do React.
 * `criar` recebe o Leaflet já carregado e devolve o mapa (e o que mais o chamador quiser guardar).
 */
export function montarMapaLeaflet<T extends { remove: () => void }>(
  elemento: HTMLElement,
  criar: (leaflet: LeafletModulo, elemento: HTMLElement) => T | Promise<T>,
  aoMontar?: (mapa: T) => void,
): MapaMontado {
  let cancelado = false;
  let mapa: T | null = null;

  void (async () => {
    const leaflet = await import("leaflet");
    if (cancelado) return;

    liberarContainer(elemento);
    const criado = await criar(leaflet, elemento);
    registrarMapa(elemento, criado);
    if (cancelado) {
      // O componente saiu enquanto o mapa era criado: destrói para não deixar instância órfã.
      criado.remove();
      return;
    }
    mapa = criado;
    aoMontar?.(criado);
  })();

  return {
    cancelar() {
      cancelado = true;
      mapa?.remove();
      mapa = null;
      liberarContainer(elemento);
    },
  };
}

/**
 * O Leaflet calcula o tamanho no momento da criação. Quando o mapa nasce dentro de algo que ainda
 * estava sendo medido (drawer, aba, container animado), ele fica com 0×0 e nenhum tile é pedido —
 * outra causa clássica de mapa cinza. Recalcular no frame seguinte resolve.
 */
export function recalcularTamanho(mapa: { invalidateSize: () => void }): void {
  requestAnimationFrame(() => mapa.invalidateSize());
}
