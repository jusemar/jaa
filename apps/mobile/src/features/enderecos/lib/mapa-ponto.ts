import type { Coordenadas } from "@jaa/contratos";

/*
 * MAPA DE AJUSTE DO PONTO no app, sem biblioteca nativa de mapa: a tela desenha os blocos de imagem
 * ("tiles") de um serviço de mapas e a pessoa ARRASTA o mapa sob um marcador fixo no centro. Aqui
 * fica só a matemática (projeção Web Mercator, a mesma dos blocos) — testável sem aparelho.
 *
 * O mapa só serve para ESCOLHER o ponto. Ele não corrige endereço e não confirma nada: a confirmação
 * é a ação explícita "Salvar endereço", gravada pela API — a mesma regra da Web.
 */

export const TAMANHO_DO_BLOCO = 256;
export const ZOOM_INICIAL = 17;
export const ZOOM_MINIMO = 12;
export const ZOOM_MAXIMO = 19;

// Centro quando não há sugestão nem ponto salvo (Belo Horizonte, cidade-piloto do Jaa) — igual à Web.
export const CENTRO_PADRAO: Coordenadas = { latitude: -19.9191, longitude: -43.9386 };

/*
 * Serviço de blocos. Padrão: OpenStreetMap, como na Web — livre e sem chave. Configurável porque a
 * política de uso do OSM não cobre volume de produção. Valor público, nunca um segredo.
 */
export const URL_DOS_BLOCOS = process.env.EXPO_PUBLIC_MAPA_TILES_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const ATRIBUICAO_DOS_BLOCOS = process.env.EXPO_PUBLIC_MAPA_ATRIBUICAO ?? "© OpenStreetMap";

/*
 * Os blocos são pedidos com o nome do aplicativo, como o serviço de mapas pede. SOMENTE ASCII: no
 * Android o cliente HTTP (OkHttp) recusa cabeçalho com acento ("Unexpected char 0xe7 … in User-Agent
 * value") e NENHUM bloco é baixado — o mapa fica vazio, só com o marcador.
 */
export const CABECALHOS_DOS_BLOCOS = { "User-Agent": "Jaa (aplicativo; mapa de endereco de entrega)" };

const LATITUDE_MAXIMA = 85.05112878;
const limitar = (valor: number, minimo: number, maximo: number) => Math.min(Math.max(valor, minimo), maximo);

/** Largura do mundo, em pixels, num zoom. */
export const tamanhoDoMundo = (zoom: number) => TAMANHO_DO_BLOCO * 2 ** zoom;

export interface PontoNoMundo {
  x: number;
  y: number;
}

export function coordenadasParaMundo({ latitude, longitude }: Coordenadas, zoom: number): PontoNoMundo {
  const mundo = tamanhoDoMundo(zoom);
  const seno = Math.sin((limitar(latitude, -LATITUDE_MAXIMA, LATITUDE_MAXIMA) * Math.PI) / 180);
  return {
    x: ((longitude + 180) / 360) * mundo,
    y: (0.5 - Math.log((1 + seno) / (1 - seno)) / (4 * Math.PI)) * mundo,
  };
}

export function mundoParaCoordenadas({ x, y }: PontoNoMundo, zoom: number): Coordenadas {
  const mundo = tamanhoDoMundo(zoom);
  const n = Math.PI - (2 * Math.PI * limitar(y, 0, mundo)) / mundo;
  return {
    latitude: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))),
    longitude: (limitar(x, 0, mundo) / mundo) * 360 - 180,
  };
}

// 6 casas decimais ≈ 0,11 m: precisão de navegação urbana, alinhada ao que o banco guarda.
export function arredondarCoordenadas({ latitude, longitude }: Coordenadas): Coordenadas {
  return { latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) };
}

/**
 * Novo centro depois de ARRASTAR o mapa por (dx, dy) pixels de tela. Arrastar para a direita traz
 * para o centro o que estava à esquerda — por isso o sinal invertido.
 */
export function centroAposArrastar(centro: Coordenadas, zoom: number, dx: number, dy: number): Coordenadas {
  const ponto = coordenadasParaMundo(centro, zoom);
  return arredondarCoordenadas(mundoParaCoordenadas({ x: ponto.x - dx, y: ponto.y - dy }, zoom));
}

export interface BlocoDoMapa {
  chave: string;
  url: string;
  // Posição do bloco dentro da área do mapa, em pixels de tela.
  esquerda: number;
  topo: number;
}

/** Os blocos que cobrem uma área de `largura` × `altura` centrada em `centro`. */
export function blocosVisiveis(centro: Coordenadas, zoom: number, largura: number, altura: number, urlDosBlocos: string = URL_DOS_BLOCOS): BlocoDoMapa[] {
  if (largura <= 0 || altura <= 0) return [];
  const ponto = coordenadasParaMundo(centro, zoom);
  const totalDeBlocos = 2 ** zoom;
  const origemX = ponto.x - largura / 2;
  const origemY = ponto.y - altura / 2;
  const blocos: BlocoDoMapa[] = [];
  for (let x = Math.floor(origemX / TAMANHO_DO_BLOCO); x * TAMANHO_DO_BLOCO < origemX + largura; x += 1) {
    for (let y = Math.floor(origemY / TAMANHO_DO_BLOCO); y * TAMANHO_DO_BLOCO < origemY + altura; y += 1) {
      // Fora do mundo (acima do polo, ou além do meridiano): não existe bloco para pedir.
      if (x < 0 || y < 0 || x >= totalDeBlocos || y >= totalDeBlocos) continue;
      blocos.push({
        chave: `${zoom}/${x}/${y}`,
        url: urlDosBlocos.replace("{z}", String(zoom)).replace("{x}", String(x)).replace("{y}", String(y)),
        esquerda: Math.round(x * TAMANHO_DO_BLOCO - origemX),
        topo: Math.round(y * TAMANHO_DO_BLOCO - origemY),
      });
    }
  }
  return blocos;
}

export const limitarZoom = (zoom: number) => limitar(Math.round(zoom), ZOOM_MINIMO, ZOOM_MAXIMO);

// Distância aproximada (equirretangular) só para a mensagem de contexto; não é regra de negócio.
export function distanciaAproximadaKm(a: Coordenadas, b: Coordenadas): number {
  const paraRadianos = (grau: number) => (grau * Math.PI) / 180;
  const x = paraRadianos(b.longitude - a.longitude) * Math.cos(paraRadianos((a.latitude + b.latitude) / 2));
  const y = paraRadianos(b.latitude - a.latitude);
  return Math.sqrt(x * x + y * y) * 6371;
}
