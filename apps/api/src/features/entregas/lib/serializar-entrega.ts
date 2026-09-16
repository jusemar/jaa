import type { EntregadorDaEmpresa } from "@jaa/contratos";
import type { EntregadorComPessoaRegistro } from "../repositorios/repositorio-entregadores.js";

// A empresa vê a identidade PÚBLICA de quem entrega (nome e @usuario) e o status do vínculo.
// Nunca conta, telefone, e-mail ou quem convidou: convidar alguém não dá acesso aos dados dele.
export function serializarEntregador(entregador: EntregadorComPessoaRegistro): EntregadorDaEmpresa {
  return {
    id: entregador.id,
    pessoa: entregador.pessoa,
    status: entregador.status,
    disponivel: entregador.disponivel,
    convidadoEm: entregador.convidadoEm.toISOString(),
    respondidoEm: entregador.respondidoEm?.toISOString() ?? null,
  };
}
