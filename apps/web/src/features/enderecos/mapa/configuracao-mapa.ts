/*
 * Serviço de "tiles" do mapa. Padrão: OpenStreetMap — livre, sem chave e sem cobrança, com boa
 * cobertura no Brasil. Continua configurável porque a política de uso do OSM não permite volume
 * de produção: quando o Jaa escalar, troca-se a URL (ou a implementação do provedor) sem mexer no
 * domínio. Valor público, nunca um segredo.
 */
export const URL_TILES_MAPA = process.env.NEXT_PUBLIC_MAPA_TILES_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const ATRIBUICAO_TILES = process.env.NEXT_PUBLIC_MAPA_ATRIBUICAO ?? "© OpenStreetMap";
