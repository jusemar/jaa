import type { EnderecoCliente, Uf } from "@jaa/contratos";
import type { EnderecoRegistro } from "../repositorios/repositorio-enderecos.js";

// Campos escolhidos um a um: nada de identidadeId do dono, arquivamento ou colunas internas.
// Coordenadas só aparecem quando o cliente CONFIRMOU o ponto (o banco garante os três juntos).
export function serializarEndereco(endereco: EnderecoRegistro): EnderecoCliente {
  return {
    id: endereco.id,
    apelido: endereco.apelido,
    cep: endereco.cep,
    logradouro: endereco.logradouro,
    numero: endereco.numero,
    complemento: endereco.complemento,
    bairro: endereco.bairro,
    cidade: endereco.cidade,
    uf: endereco.uf as Uf,
    pontoReferencia: endereco.pontoReferencia,
    latitude: endereco.latitude,
    longitude: endereco.longitude,
    localizacaoConfirmadaEm: endereco.localizacaoConfirmadaEm?.toISOString() ?? null,
    criadoEm: endereco.criadoEm.toISOString(),
    atualizadoEm: endereco.atualizadoEm.toISOString(),
  };
}
