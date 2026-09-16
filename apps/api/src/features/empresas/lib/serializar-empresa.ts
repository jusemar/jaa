import type { Empresa } from "@jaa/contratos";
import type { EmpresaDoMembroRegistro } from "../repositorios/repositorio-empresas.js";

// Campos escolhidos um a um: nada da conta ou da identidade pessoal dos membros chega ao cliente.
export function serializarEmpresa(empresa: EmpresaDoMembroRegistro): Empresa {
  return {
    id: empresa.id,
    nome: empresa.nome,
    slug: empresa.slug,
    status: empresa.status,
    identidadeId: empresa.identidadeId,
    nomeUsuario: empresa.nomeUsuario,
    papel: empresa.papel,
    criadoEm: empresa.criadoEm.toISOString(),
    atualizadoEm: empresa.atualizadoEm.toISOString(),
  };
}
