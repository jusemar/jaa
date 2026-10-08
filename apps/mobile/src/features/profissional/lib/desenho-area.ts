/*
 * DESENHO da área de atuação na tela: dos cantos (já projetados em pixels pelo mapa) para o que o app
 * pinta — um ponto por canto e um segmento entre cantos vizinhos, fechando no primeiro. O React Native
 * não tem linha: cada segmento é uma barra fina, posicionada no meio do trecho e girada no ângulo dele.
 * Regra pura; quem valida a FORMA do polígono é o servidor (PostGIS).
 */
export interface PontoNaTela {
  x: number;
  y: number;
}

export interface SegmentoNaTela {
  centroX: number;
  centroY: number;
  comprimento: number;
  anguloGraus: number;
}

export function segmentosDoDesenho(pontos: readonly PontoNaTela[]): SegmentoNaTela[] {
  if (pontos.length < 2) return [];
  // Com dois cantos há um trecho só; a partir de três o desenho FECHA no primeiro canto.
  const trechos = pontos.length === 2 ? 1 : pontos.length;
  return Array.from({ length: trechos }, (_, indice) => {
    const de = pontos[indice]!;
    const ate = pontos[(indice + 1) % pontos.length]!;
    return {
      centroX: (de.x + ate.x) / 2,
      centroY: (de.y + ate.y) / 2,
      comprimento: Math.hypot(ate.x - de.x, ate.y - de.y),
      anguloGraus: (Math.atan2(ate.y - de.y, ate.x - de.x) * 180) / Math.PI,
    };
  });
}

/** Meio do desenho (média dos cantos): onde o mapa abre ao editar uma área já desenhada. */
export function centroDoDesenho<T extends { latitude: number; longitude: number }>(vertices: readonly T[]): { latitude: number; longitude: number } | null {
  if (vertices.length === 0) return null;
  const soma = vertices.reduce((total, vertice) => ({ latitude: total.latitude + vertice.latitude, longitude: total.longitude + vertice.longitude }), { latitude: 0, longitude: 0 });
  return { latitude: soma.latitude / vertices.length, longitude: soma.longitude / vertices.length };
}
