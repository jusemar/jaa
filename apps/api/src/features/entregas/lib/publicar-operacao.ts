import type { Banco } from "@jaa/banco";
import { buscarEmpresaPublicaPorId } from "../../catalogo/repositorios/repositorio-empresas-publicas.js";
import { montarPainelOperacional, montarSituacao } from "../casos-de-uso/presenca-e-fila.js";
import type { EntregadorOperacionalRegistro } from "../repositorios/repositorio-fila.js";
import type { CanalEventosEntregas } from "./eventos-entregas.js";

/**
 * Publica a mudança operacional para quem tem direito a cada parte:
 * - a EMPRESA daquela base recebe o painel (fila, fora da base, indisponíveis) — só estados derivados;
 * - o ENTREGADOR recebe a PRÓPRIA situação (presença, estado, posição) — nada dos outros.
 * Uma empresa nunca recebe nada da operação dele em outra.
 */
export async function publicarOperacao(
  { banco, eventosEntregas }: { banco: Banco; eventosEntregas: CanalEventosEntregas },
  registro: EntregadorOperacionalRegistro,
): Promise<void> {
  const empresa = await buscarEmpresaPublicaPorId(banco, registro.empresaId);
  if (empresa) {
    eventosEntregas.publicar({
      tipo: "painel-operacional-atualizado",
      destinatariosIdentidadeIds: [empresa.identidadeId],
      painel: await montarPainelOperacional(banco, registro.empresaId),
    });
  }

  eventosEntregas.publicar({
    tipo: "situacao-operacional-atualizada",
    destinatariosIdentidadeIds: [registro.pessoa.identidadeId],
    situacao: await montarSituacao(banco, registro),
  });
}
