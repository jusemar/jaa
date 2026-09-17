import type { Banco } from "@jaa/banco";
import type { ConviteEntregador, VinculoEntregador } from "@jaa/contratos";
import { serializarEmpresaPublica } from "../../catalogo/lib/serializar-catalogo.js";
import { buscarEmpresaPublicaPorId } from "../../catalogo/repositorios/repositorio-empresas-publicas.js";
import type { CanalEventosEntregas } from "./eventos-entregas.js";
import type { EntregadorComPessoaRegistro } from "../repositorios/repositorio-entregadores.js";

/**
 * Avisa a PESSOA que o vínculo dela de entregador mudou — convite recebido, convite respondido,
 * vínculo ativado ou desativado.
 *
 * Existe porque o convite era gravado e ninguém avisava: quem estava conectado só via depois de
 * recarregar a página. Vai somente para a identidade pessoal dela (nunca broadcast, nunca para a
 * empresa — a empresa já tem os próprios eventos de disponibilidade e operação).
 */
export async function publicarVinculoEntregador(
  { banco, eventosEntregas }: { banco: Banco; eventosEntregas: CanalEventosEntregas },
  entregador: EntregadorComPessoaRegistro,
): Promise<void> {
  const empresa = await buscarEmpresaPublicaPorId(banco, entregador.empresaId);
  if (!empresa) return;
  const empresaPublica = serializarEmpresaPublica(empresa);

  // Convite só existe enquanto está pendente; depois de aceitar/recusar ele sai da lista dela.
  const convite: ConviteEntregador | null =
    entregador.status === "convidado"
      ? { id: entregador.id, empresa: empresaPublica, status: entregador.status, convidadoEm: entregador.convidadoEm.toISOString() }
      : null;

  // O vínculo aparece em "Empresas em que trabalho" assim que deixa de ser convite pendente.
  const vinculo: VinculoEntregador | null =
    entregador.status === "convidado"
      ? null
      : {
          id: entregador.id,
          empresa: empresaPublica,
          status: entregador.status,
          disponivel: entregador.disponivel,
          disponibilidadeAtualizadaEm: null,
        };

  eventosEntregas.publicar({
    tipo: "vinculo-entregador-atualizado",
    destinatariosIdentidadeIds: [entregador.pessoa.identidadeId],
    convite,
    vinculo,
  });
}
