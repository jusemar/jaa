import type { Coordenadas } from "@jaa/contratos";

export interface EnderecoGeocodificavel {
  cep: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
}

/**
 * FRONTEIRA com o serviço de geocodificação (endereço textual → coordenada SUGERIDA).
 *
 * O domínio Endereço/Pedido não conhece fornecedor nenhum: recebe esta interface. Trocar de provedor
 * (ou passar a ter um) é implementar outro adaptador para esta interface.
 *
 * Sugestão NÃO é confirmação: serve só para abrir o mapa perto do lugar provável. O ponto oficial
 * de entrega é o que o cliente confirma, e o texto do endereço nunca é alterado pelo que o mapa diz.
 */
export interface GeocodificadorEndereco {
  // null = não foi possível sugerir (endereço não encontrado, serviço fora, sem serviço configurado).
  sugerir(endereco: EnderecoGeocodificavel): Promise<Coordenadas | null>;
  // false quando não há serviço configurado: a interface abre o mapa sem palpite, sem parecer erro.
  readonly disponivel: boolean;
}

// Padrão do projeto hoje: NENHUM provedor externo é chamado sem decisão explícita de configuração.
export const geocodificadorIndisponivel: GeocodificadorEndereco = {
  disponivel: false,
  sugerir: async () => null,
};
