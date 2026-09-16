import type { Coordenadas } from "@jaa/contratos";

/**
 * FRONTEIRA com o motor de roteamento. O domínio não conhece fornecedor nenhum: pede uma SEQUÊNCIA
 * SUGERIDA e recebe a ordem das paradas. Distância e duração só existem quando um provedor REAL as
 * fornecer — por isso não fazem parte do que o planejador padrão devolve.
 */
export interface ParadaParaPlanejar {
  pedidoId: string;
  // Ponto que o CLIENTE confirmou, congelado no pedido (nunca geocodificado de novo).
  coordenadas: Coordenadas;
}

export interface PlanoRota {
  // Ordem sugerida dos pedidos. Nada além disso sem um motor de rotas de verdade.
  ordem: string[];
  // Identifica como a ordem foi obtida — a interface usa isto para não prometer o que não tem.
  estrategia: "aproximacao-local" | "provedor";
}

export interface PlanejadorRotaEntrega {
  // `origem` é o ponto operacional da empresa, quando existir (hoje o Jaa ainda não o guarda).
  sugerirSequencia(paradas: ParadaParaPlanejar[], origem?: Coordenadas | undefined): Promise<PlanoRota>;
}

// Distância aproximada em km (equirretangular). Serve só para ORDENAR proximidade entre pontos.
function distanciaAproximadaKm(a: Coordenadas, b: Coordenadas): number {
  const raioTerraKm = 6371;
  const paraRadianos = (grau: number) => (grau * Math.PI) / 180;
  const x = paraRadianos(b.longitude - a.longitude) * Math.cos(paraRadianos((a.latitude + b.latitude) / 2));
  const y = paraRadianos(b.latitude - a.latitude);
  return Math.sqrt(x * x + y * y) * raioTerraKm;
}

/**
 * Planejador PADRÃO: aproximação local determinística (vizinho mais próximo em linha reta), sem
 * chamar serviço nenhum.
 *
 * Limites que a interface precisa respeitar: isto NÃO é a "melhor rota" nem a "mais rápida" — é uma
 * SUGESTÃO inicial. Linha reta não é distância rodoviária e não vira tempo de viagem nem ETA; por
 * isso nenhum número é devolvido, só a ordem. O provedor de roteamento real continua pendente.
 */
export const planejadorAproximadoLocal: PlanejadorRotaEntrega = {
  async sugerirSequencia(paradas, origem) {
    const restantes = [...paradas];
    const ordem: string[] = [];
    // Sem ponto operacional da empresa, começa pela primeira parada informada (ordem estável).
    let referencia = origem ?? restantes[0]?.coordenadas;

    while (restantes.length > 0 && referencia) {
      let escolhida = 0;
      let menor = Number.POSITIVE_INFINITY;
      for (const [indice, parada] of restantes.entries()) {
        const distancia = distanciaAproximadaKm(referencia, parada.coordenadas);
        // Empate resolvido pelo primeiro da lista: a sugestão é sempre determinística.
        if (distancia < menor) {
          menor = distancia;
          escolhida = indice;
        }
      }
      const [proxima] = restantes.splice(escolhida, 1);
      if (!proxima) break;
      ordem.push(proxima.pedidoId);
      referencia = proxima.coordenadas;
    }

    return { ordem: [...ordem, ...restantes.map((parada) => parada.pedidoId)], estrategia: "aproximacao-local" };
  },
};
