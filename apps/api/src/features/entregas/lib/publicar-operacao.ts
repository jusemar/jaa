import type { Banco } from "@jaa/banco";
import { buscarEmpresaPublicaPorId } from "../../catalogo/repositorios/repositorio-empresas-publicas.js";
import { expirarPresencasVencidas, listarFilaDaEmpresa, montarPainelOperacional, montarSituacao } from "../casos-de-uso/presenca-e-fila.js";
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

/**
 * Passada periódica da presença: expira quem parou de confirmar a localização e avisa, uma vez por
 * empresa afetada, a EMPRESA (painel novo) e cada entregador envolvido — os que saíram e os que
 * continuam na fila, porque a posição deles andou. Todos recebem o MESMO estado calculado no servidor.
 */
export async function expirarPresencasEPublicar({ banco, eventosEntregas }: { banco: Banco; eventosEntregas: CanalEventosEntregas }): Promise<number> {
  const expirados = await expirarPresencasVencidas(banco);
  const porEmpresa = new Map<string, EntregadorOperacionalRegistro[]>();
  for (const registro of expirados) porEmpresa.set(registro.empresaId, [...(porEmpresa.get(registro.empresaId) ?? []), registro]);

  for (const [empresaId, registros] of porEmpresa) {
    const empresa = await buscarEmpresaPublicaPorId(banco, empresaId);
    if (empresa) {
      eventosEntregas.publicar({ tipo: "painel-operacional-atualizado", destinatariosIdentidadeIds: [empresa.identidadeId], painel: await montarPainelOperacional(banco, empresaId) });
    }
    for (const registro of [...registros, ...(await listarFilaDaEmpresa(banco, empresaId))]) {
      eventosEntregas.publicar({ tipo: "situacao-operacional-atualizada", destinatariosIdentidadeIds: [registro.pessoa.identidadeId], situacao: await montarSituacao(banco, registro) });
    }
  }
  return expirados.length;
}
