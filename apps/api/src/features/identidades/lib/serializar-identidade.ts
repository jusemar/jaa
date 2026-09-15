import type { IdentidadePessoal } from "@jaa/contratos";
import type { IdentidadeRegistro } from "../repositorios/repositorio-identidades.js";

export function serializarIdentidadePessoal(identidade: IdentidadeRegistro): IdentidadePessoal {
  return {
    id: identidade.id,
    nomeExibicao: identidade.nomeExibicao,
    nomeUsuario: identidade.nomeUsuario,
    criadoEm: identidade.criadoEm.toISOString(),
  };
}
