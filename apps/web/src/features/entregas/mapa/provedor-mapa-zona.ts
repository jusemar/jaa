import type { Coordenadas, PoligonoZona } from "@jaa/contratos";

/**
 * FRONTEIRA com o fornecedor de mapa para DESENHAR ÁREA (a zona de entrega), irmã da fronteira de
 * ponto usada no endereço do cliente. O domínio não conhece Leaflet, Google ou Mapbox: pede "deixe a
 * pessoa marcar os cantos" e recebe a lista de vértices.
 *
 * O mapa aqui não decide nada: quem valida geometria, sobreposição e escopo da empresa é o servidor.
 */
export interface MapaZona {
  // Substitui o contorno exibido (ex.: ao abrir uma zona existente para editar).
  desenhar(vertices: PoligonoZona): void;
  limpar(): void;
  destruir(): void;
}

export interface OpcoesMapaZona {
  elemento: HTMLElement;
  centro: Coordenadas;
  // Contorno inicial (zona existente) ou vazio (zona nova).
  verticesIniciais?: PoligonoZona | undefined;
  // Chamado a cada ponto marcado/removido enquanto a pessoa desenha.
  aoMudarVertices: (vertices: PoligonoZona) => void;
  // Contornos das outras zonas, só para referência visual (ajudam a não invadir a vizinha).
  outrasZonas?: Array<{ nome: string; vertices: PoligonoZona }> | undefined;
  urlTiles?: string | undefined;
  atribuicao?: string | undefined;
}

export type CriarMapaZona = (opcoes: OpcoesMapaZona) => Promise<MapaZona>;
