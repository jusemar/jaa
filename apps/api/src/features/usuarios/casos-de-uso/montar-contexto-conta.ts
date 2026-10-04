import type { Banco } from "@jaa/banco";
import {
  VERSAO_CONTEXTO_CONTA,
  situacaoDoPerfil,
  type CapacidadeConta,
  type ContextoConta,
  type EstadoCapacidade,
  type SituacaoPerfilProfissional,
} from "@jaa/contratos";
import { mascararTelefone } from "../../autenticacao/lib/telefone.js";
import { contarVinculosDaPessoaPorStatus } from "../../entregas/repositorios/repositorio-entregadores.js";
import { comFotos, listarIdentidadesOperaveis } from "../../identidades/lib/autorizacao-identidades.js";
import { serializarIdentidadePessoal } from "../../identidades/lib/serializar-identidade.js";
import { buscarIdentidadePessoalDoUsuario } from "../../identidades/repositorios/repositorio-identidades.js";
import { pendenciasDoPerfil } from "../../profissionais/casos-de-uso/gerir-perfil-profissional.js";
import { buscarPerfilPorIdentidade } from "../../profissionais/repositorios/repositorio-perfis-profissionais.js";

/*
 * CONTEXTO DA CONTA: resumo para NAVEGAÇÃO, nunca autorização. Cada capacidade é resolvida por uma
 * consulta curta do próprio domínio, sem carregar os dados dele (vínculos completos, perfil completo).
 * Não depende da identidade atuante: é sempre o que a CONTA tem.
 */

const ESTADO_POR_SITUACAO_PERFIL: Record<SituacaoPerfilProfissional, EstadoCapacidade> = {
  ativo: "ativa",
  incompleto: "pendente",
  inativo: "inativa",
};

// Participação no motor de entregas: ≥ 1 vínculo ativo = ativa; só convites = pendente; senão, ausente.
async function capacidadeEntregadorEmpresa(banco: Banco, usuarioId: string): Promise<CapacidadeConta | null> {
  const { ativo, convidado } = await contarVinculosDaPessoaPorStatus(banco, usuarioId);
  if (ativo === 0 && convidado === 0) return null;
  return {
    tipo: "entregador_empresa",
    estado: ativo > 0 ? "ativa" : "pendente",
    resumo: { vinculosAtivos: ativo, convitesPendentes: convidado },
  };
}

// Perfil Profissional: mesma situação do domínio (inativo/incompleto/ativo); sem perfil = ausente.
async function capacidadePerfilProfissional(banco: Banco, identidadePessoalId: string): Promise<CapacidadeConta | null> {
  const perfil = await buscarPerfilPorIdentidade(banco, identidadePessoalId);
  if (!perfil) return null;
  const pendencias = await pendenciasDoPerfil(banco, perfil.id);
  return {
    tipo: "perfil_profissional",
    estado: ESTADO_POR_SITUACAO_PERFIL[situacaoDoPerfil(perfil.ativo, pendencias)],
    resumo: { pendencias },
  };
}

export async function montarContextoConta(
  banco: Banco,
  usuarioId: string,
  telefone: string | null | undefined,
  // Monta a URL pública da foto a partir da chave gravada (o armazenamento é do servidor).
  urlPublica: (chave: string) => string | null,
): Promise<ContextoConta> {
  const conta = { telefoneMascarado: telefone ? mascararTelefone(telefone) : null };
  const pessoal = await buscarIdentidadePessoalDoUsuario(banco, usuarioId);

  // Cadastro incompleto: sem identidade pessoal não há identidades operáveis nem capacidades.
  if (!pessoal) {
    return { versao: VERSAO_CONTEXTO_CONTA, conta: { ...conta, cadastroCompleto: false }, identidadePessoal: null, identidadesOperaveis: [], capacidades: [] };
  }

  const [identidadesOperaveis, entregador, perfilProfissional] = await Promise.all([
    listarIdentidadesOperaveis(banco, usuarioId),
    capacidadeEntregadorEmpresa(banco, usuarioId),
    capacidadePerfilProfissional(banco, pessoal.id),
  ]);

  return {
    versao: VERSAO_CONTEXTO_CONTA,
    conta: { ...conta, cadastroCompleto: true },
    identidadePessoal: serializarIdentidadePessoal(pessoal),
    identidadesOperaveis: await comFotos(banco, identidadesOperaveis, urlPublica),
    capacidades: [entregador, perfilProfissional].filter((capacidade) => capacidade !== null),
  };
}
