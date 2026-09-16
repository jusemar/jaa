import { LEITURA_VALIDADE_MAXIMA_MS, PRECISAO_MAXIMA_ACEITA_METROS, type Coordenadas } from "@jaa/contratos";

/**
 * GEOFENCE da base: o SERVIDOR decide presença comparando a leitura do aparelho com o ponto
 * confirmado da empresa e o raio configurado. O cliente nunca declara "estou na base".
 * Nenhuma coordenada do entregador é armazenada — a leitura é usada e descartada.
 */

// Distância em metros (equirretangular): erro desprezível nas dezenas/centenas de metros do raio.
export function distanciaMetros(a: Coordenadas, b: Coordenadas): number {
  const raioTerraMetros = 6_371_000;
  const paraRadianos = (grau: number) => (grau * Math.PI) / 180;
  const x = paraRadianos(b.longitude - a.longitude) * Math.cos(paraRadianos((a.latitude + b.latitude) / 2));
  const y = paraRadianos(b.latitude - a.latitude);
  return Math.sqrt(x * x + y * y) * raioTerraMetros;
}

export type LeituraLocalizacao = {
  latitude: number;
  longitude: number;
  precisaoMetros?: number | null | undefined;
  medidaEm: Date;
};

export type ResultadoLeitura = { tipo: "imprecisa" } | { tipo: "avaliada"; dentro: boolean; distanciaMetros: number };

/**
 * Leitura que não serve para decidir presença: velha demais (o aparelho pode ter ficado offline),
 * com horário no futuro, ou com incerteza maior do que o próprio raio da base.
 */
export function avaliarLeitura(leitura: LeituraLocalizacao, base: Coordenadas & { raioMetros: number }, agora = new Date()): ResultadoLeitura {
  const idadeMs = agora.getTime() - leitura.medidaEm.getTime();
  if (idadeMs > LEITURA_VALIDADE_MAXIMA_MS || idadeMs < -60_000) return { tipo: "imprecisa" };

  const precisao = leitura.precisaoMetros ?? null;
  if (precisao !== null && (precisao > PRECISAO_MAXIMA_ACEITA_METROS || precisao > base.raioMetros)) return { tipo: "imprecisa" };

  const distancia = distanciaMetros(leitura, base);
  return { tipo: "avaliada", dentro: distancia <= base.raioMetros, distanciaMetros: distancia };
}

/*
 * ESTABILIZAÇÃO (histerese + confirmação por repetição), para o GPS oscilando não jogar ninguém
 * para dentro e para fora da fila:
 * - ENTRAR exige 2 leituras consecutivas dentro do raio;
 * - SAIR exige 2 leituras consecutivas fora, com uma margem de 30% além do raio — uma leitura
 *   ligeiramente fora (ruído comum de GPS urbano) NÃO tira ninguém da fila.
 */
export const LEITURAS_PARA_CONFIRMAR = 2;
export const MARGEM_SAIDA = 1.3;

export interface EstadoPresenca {
  naBase: boolean;
  // Leituras consecutivas que discordam do estado atual.
  leiturasConsecutivas: number;
}

export function aplicarLeitura(estado: EstadoPresenca, avaliacao: Extract<ResultadoLeitura, { tipo: "avaliada" }>, raioMetros: number): EstadoPresenca {
  if (estado.naBase) {
    // Só conta como "saiu" quem está confortavelmente fora: dentro da margem, segue na base.
    const foraComMargem = avaliacao.distanciaMetros > raioMetros * MARGEM_SAIDA;
    if (!foraComMargem) return { naBase: true, leiturasConsecutivas: 0 };
    const consecutivas = estado.leiturasConsecutivas + 1;
    return consecutivas >= LEITURAS_PARA_CONFIRMAR ? { naBase: false, leiturasConsecutivas: 0 } : { naBase: true, leiturasConsecutivas: consecutivas };
  }

  if (!avaliacao.dentro) return { naBase: false, leiturasConsecutivas: 0 };
  const consecutivas = estado.leiturasConsecutivas + 1;
  return consecutivas >= LEITURAS_PARA_CONFIRMAR ? { naBase: true, leiturasConsecutivas: 0 } : { naBase: false, leiturasConsecutivas: consecutivas };
}
