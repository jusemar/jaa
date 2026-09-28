import type { Coordenadas, PoligonoZona } from "@jaa/contratos";
import { arredondarCoordenadas } from "@/features/enderecos/mapa/provedor-mapa";

/**
 * Estado do DESENHO de uma área (vértices + histórico do "Desfazer"), sem biblioteca de mapa.
 *
 * A implementação visual (Mapbox) só desenha o que este editor diz e repassa os gestos: tocar
 * adiciona, arrastar move, duplo clique exclui. Assim a regra do desenho é uma só, testável sem
 * navegador, e nada aqui sabe de empresa, frete ou pedido — serve para qualquer área desenhada.
 *
 * Mesmas regras da versão Leaflet: coordenadas arredondadas como no ponto de entrega, a área nunca
 * fica com menos de 3 pontos por exclusão, e um arraste que termina no mesmo lugar não vira histórico.
 */
export interface EditorVerticesZona {
  vertices(): PoligonoZona;
  adicionar(ponto: Coordenadas): void;
  iniciarArraste(): void;
  // Posição provisória durante o arraste: redesenha o contorno, mas não publica nem grava histórico.
  moverDuranteArraste(indice: number, ponto: Coordenadas): void;
  concluirArraste(indice: number, ponto: Coordenadas): void;
  excluir(indice: number): void;
  substituir(novos: PoligonoZona): void;
  desfazer(): void;
  limpar(): void;
}

export const MINIMO_VERTICES_EXCLUSAO = 3;

const copiar = (lista: PoligonoZona): PoligonoZona => lista.map((vertice) => ({ ...vertice }));
const mesmasCoordenadas = (a: PoligonoZona, b: PoligonoZona) =>
  a.length === b.length && a.every((vertice, indice) => vertice.latitude === b[indice]?.latitude && vertice.longitude === b[indice]?.longitude);

export function criarEditorVerticesZona({
  verticesIniciais,
  aoRedesenhar,
  aoMoverProvisorio,
  aoMudarVertices,
  aoMudarPodeDesfazer,
  aoBloquearExclusao,
}: {
  verticesIniciais?: PoligonoZona | undefined;
  // Mudança definitiva: refazer marcadores e contorno.
  aoRedesenhar: (vertices: PoligonoZona) => void;
  // Mudança provisória (arrastando): só o contorno acompanha.
  aoMoverProvisorio: (vertices: PoligonoZona) => void;
  aoMudarVertices: (vertices: PoligonoZona) => void;
  aoMudarPodeDesfazer?: ((podeDesfazer: boolean) => void) | undefined;
  aoBloquearExclusao?: (() => void) | undefined;
}): EditorVerticesZona & { publicar(): void } {
  let vertices = copiar(verticesIniciais ?? []);
  let historico: PoligonoZona[] = [];
  let antesDoArraste: PoligonoZona | null = null;

  const publicar = () => {
    aoRedesenhar(copiar(vertices));
    aoMudarVertices(copiar(vertices));
    aoMudarPodeDesfazer?.(historico.length > 0);
  };

  const alterar = (novos: PoligonoZona) => {
    if (mesmasCoordenadas(vertices, novos)) return;
    historico.push(copiar(vertices));
    vertices = copiar(novos);
    publicar();
  };

  return {
    publicar,
    vertices: () => copiar(vertices),
    adicionar(ponto) {
      alterar([...vertices, arredondarCoordenadas(ponto)]);
    },
    iniciarArraste() {
      antesDoArraste = copiar(vertices);
    },
    moverDuranteArraste(indice, ponto) {
      if (indice < 0 || indice >= vertices.length) return;
      vertices[indice] = { latitude: ponto.latitude, longitude: ponto.longitude };
      aoMoverProvisorio(copiar(vertices));
    },
    concluirArraste(indice, ponto) {
      if (!antesDoArraste) return;
      const finais = copiar(vertices);
      if (indice >= 0 && indice < finais.length) finais[indice] = arredondarCoordenadas(ponto);
      if (!mesmasCoordenadas(antesDoArraste, finais)) historico.push(antesDoArraste);
      vertices = finais;
      antesDoArraste = null;
      publicar();
    },
    excluir(indice) {
      if (vertices.length <= MINIMO_VERTICES_EXCLUSAO) {
        aoBloquearExclusao?.();
        return;
      }
      alterar(vertices.filter((_, atual) => atual !== indice));
    },
    substituir(novos) {
      vertices = copiar(novos);
      historico = [];
      publicar();
    },
    desfazer() {
      const anteriores = historico.pop();
      if (!anteriores) return;
      vertices = anteriores;
      publicar();
    },
    limpar() {
      alterar([]);
    },
  };
}
