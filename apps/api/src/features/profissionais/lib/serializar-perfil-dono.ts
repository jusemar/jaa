import type { Banco } from "@jaa/banco";
import { situacaoDoPerfil, type PerfilProfissionalDoDono } from "@jaa/contratos";
import { lerPerfilProfissionalDoDono, pendenciasDoPerfil } from "../casos-de-uso/gerir-perfil-profissional.js";
import { listarAreasDoPerfil } from "../repositorios/repositorio-perfis-profissionais.js";

/**
 * Perfil Profissional na visão do DONO (privada: inclui base completa e coordenada confirmada).
 * Só é montado para a identidade da sessão — nunca para terceiros, que usam o contrato público.
 */
export async function montarPerfilDoDono(banco: Banco, identidadeId: string): Promise<PerfilProfissionalDoDono | null> {
  const lido = await lerPerfilProfissionalDoDono(banco, identidadeId);
  if (!lido) return null;
  const { perfil, base, servicos } = lido;
  const [areas, pendencias] = await Promise.all([listarAreasDoPerfil(banco, perfil.id), pendenciasDoPerfil(banco, perfil.id)]);

  return {
    id: perfil.id,
    situacao: situacaoDoPerfil(perfil.ativo, pendencias),
    ativo: perfil.ativo,
    pendencias,
    recebeOportunidadesOutrasRegioes: perfil.recebeOportunidadesOutrasRegioes,
    atividades: servicos.map((servico) => ({
      id: servico.id,
      atividadeId: servico.servicoId,
      nome: servico.servicoNome,
      especialidadeIds: servico.especialidades.map((especialidade) => especialidade.id),
      opcaoIds: servico.opcoes.map((opcao) => opcao.id),
      periodos: servico.periodos,
      permiteAgendamento: servico.permiteAgendamento,
    })),
    base: base
      ? {
          cep: base.cep,
          logradouro: base.logradouro,
          numero: base.numero,
          complemento: base.complemento,
          bairro: base.bairro,
          cidade: base.cidade,
          uf: base.uf,
          pontoReferencia: base.pontoReferencia,
          codigoIbge: base.codigoIbge,
          coordenadas: base.ponto ? { latitude: base.ponto.latitude, longitude: base.ponto.longitude } : null,
          atualizadoEm: base.atualizadoEm.toISOString(),
        }
      : null,
    areas: areas.map((area) => ({
      id: area.id,
      modalidade: area.modalidade,
      nome: area.nome,
      ativa: area.ativa,
      raioMetros: area.raioMetros,
      municipio: area.codigoIbge && area.municipioNome && area.municipioUf ? { codigoIbge: area.codigoIbge, nome: area.municipioNome, uf: area.municipioUf } : null,
      poligonos: area.poligonos,
      todasAtividades: area.todosOsServicos,
      atividadeIds: area.servicoPerfilIds,
    })),
  };
}
