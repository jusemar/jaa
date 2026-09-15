import type { Banco } from "@jaa/banco";
import { buscarIdentidadePessoalPorNomeUsuario } from "../../identidades/repositorios/repositorio-identidades.js";
import {
  listarParticipantesDaConversa,
  obterOuCriarConversaDireta,
  type ParticipanteRegistro,
} from "../repositorios/repositorio-conversas.js";

type ResultadoAbrirConversaDireta =
  | { tipo: "criada" | "existente"; conversaId: string; participantes: ParticipanteRegistro[] }
  | { tipo: "identidade-nao-encontrada" }
  | { tipo: "consigo-mesmo" };

/**
 * A identidade de origem vem da sessão; a de destino é localizada pelo @usuario público.
 * A↔B e B↔A resolvem para a mesma conversa.
 */
export async function abrirConversaDireta(
  banco: Banco,
  identidadeOrigemId: string,
  nomeUsuarioDestino: string,
): Promise<ResultadoAbrirConversaDireta> {
  const destino = await buscarIdentidadePessoalPorNomeUsuario(banco, nomeUsuarioDestino);

  if (!destino) {
    return { tipo: "identidade-nao-encontrada" };
  }

  if (destino.id === identidadeOrigemId) {
    return { tipo: "consigo-mesmo" };
  }

  const { conversaId, criada } = await obterOuCriarConversaDireta(banco, identidadeOrigemId, destino.id);
  const participantes = await listarParticipantesDaConversa(banco, conversaId);

  return { tipo: criada ? "criada" : "existente", conversaId, participantes };
}
