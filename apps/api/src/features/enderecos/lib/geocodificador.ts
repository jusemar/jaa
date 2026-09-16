import type { Coordenadas } from "@jaa/contratos";
import type { DadosEndereco } from "../repositorios/repositorio-enderecos.js";

/**
 * FRONTEIRA com o serviço de geocodificação (endereço textual → coordenada SUGERIDA).
 *
 * O domínio Endereço/Pedido não conhece fornecedor nenhum: recebe esta interface. Trocar de provedor
 * (ou passar a ter um) é implementar outra função aqui.
 *
 * Sugestão NÃO é confirmação: serve só para abrir o mapa perto do lugar provável. O ponto oficial
 * de entrega é o que o cliente confirma, e o texto do endereço nunca é alterado pelo que o mapa diz.
 */
export interface GeocodificadorEndereco {
  // null = não foi possível sugerir (endereço não encontrado, serviço fora, sem serviço configurado).
  sugerir(endereco: DadosEndereco): Promise<Coordenadas | null>;
  // false quando não há serviço configurado: a interface abre o mapa sem palpite, sem parecer erro.
  readonly disponivel: boolean;
}

// Padrão do projeto hoje: NENHUM provedor externo é chamado sem decisão explícita de configuração.
export const geocodificadorIndisponivel: GeocodificadorEndereco = {
  disponivel: false,
  sugerir: async () => null,
};

const enderecoEmUmaLinha = (endereco: DadosEndereco) =>
  `${endereco.logradouro}, ${endereco.numero}, ${endereco.bairro}, ${endereco.cidade}, ${endereco.uf}, ${endereco.cep}, Brasil`;

/**
 * Implementação para serviços compatíveis com a API de busca do Nominatim/OpenStreetMap
 * (`?q=…&format=jsonv2&limit=1`), que atende bem o Brasil e não exige chave nem cobrança.
 * A URL vem de configuração: sem `GEOCODIFICACAO_URL`, nada é chamado (ver `geocodificadorIndisponivel`).
 * Falha ou tempo esgotado devolvem null — o mapa abre sem palpite e o cliente confirma do mesmo jeito.
 */
export function criarGeocodificadorNominatim({ url, contato, tempoLimiteMs = 4000 }: { url: string; contato?: string | undefined; tempoLimiteMs?: number }): GeocodificadorEndereco {
  return {
    disponivel: true,
    async sugerir(endereco) {
      const consulta = new URL(url);
      consulta.searchParams.set("q", enderecoEmUmaLinha(endereco));
      consulta.searchParams.set("format", "jsonv2");
      consulta.searchParams.set("limit", "1");
      consulta.searchParams.set("countrycodes", "br");

      try {
        const resposta = await fetch(consulta, {
          signal: AbortSignal.timeout(tempoLimiteMs),
          // Política de uso do Nominatim pede identificação do aplicativo.
          headers: { "user-agent": `Jaa/1.0${contato ? ` (${contato})` : ""}`, "accept-language": "pt-BR" },
        });
        if (!resposta.ok) return null;

        const corpo: unknown = await resposta.json();
        const primeiro = Array.isArray(corpo) ? corpo[0] : null;
        if (typeof primeiro !== "object" || primeiro === null || !("lat" in primeiro) || !("lon" in primeiro)) return null;

        const latitude = Number(primeiro.lat);
        const longitude = Number(primeiro.lon);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
        return { latitude, longitude };
      } catch {
        // Serviço externo indisponível não pode quebrar o cadastro nem a confirmação do ponto.
        return null;
      }
    },
  };
}
