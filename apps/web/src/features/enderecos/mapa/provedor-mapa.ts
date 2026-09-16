import type { Coordenadas } from "@jaa/contratos";

/**
 * FRONTEIRA com o fornecedor de mapa. O domínio (endereço, pedido) não conhece Leaflet, Google ou
 * Mapbox: fala só com esta interface. Trocar de fornecedor — ou usar outro no Mobile (onde o mapa é
 * nativo) — é escrever outra implementação, sem tocar em regra de negócio.
 *
 * O mapa só faz uma coisa: deixar o cliente ESCOLHER o ponto. Ele não corrige endereço, não sugere
 * texto e não confirma nada; a confirmação é a ação explícita do cliente, gravada pela API.
 */
export interface MapaPonto {
  // Move a visão e o marcador (ex.: quando chega a sugestão de geocodificação).
  centralizar(coordenadas: Coordenadas): void;
  destruir(): void;
}

export interface OpcoesMapaPonto {
  elemento: HTMLElement;
  centro: Coordenadas;
  // Chamado enquanto o cliente ajusta o pin; o valor só vira ponto oficial quando ele confirma.
  aoMoverPonto: (coordenadas: Coordenadas) => void;
  // URL do serviço de "tiles". Ausente = mapa sem imagem de fundo (o ajuste continua funcionando).
  urlTiles?: string | undefined;
  atribuicao?: string | undefined;
}

export type CriarMapaPonto = (opcoes: OpcoesMapaPonto) => Promise<MapaPonto>;

// Centro padrão quando não há sugestão nem ponto salvo (Belo Horizonte, cidade-piloto do Jaa).
export const CENTRO_PADRAO: Coordenadas = { latitude: -19.9191, longitude: -43.9386 };

// 6 casas decimais ≈ 0,11 m: precisão de navegação urbana, alinhada ao que o banco guarda.
export function arredondarCoordenadas({ latitude, longitude }: Coordenadas): Coordenadas {
  return { latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) };
}
