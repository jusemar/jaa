import type { Banco } from "@jaa/banco";
import { identidades, identidadesVisitantes } from "@jaa/banco/schema";
import { eq } from "drizzle-orm";
import { buscarVisitanteDoUsuario } from "../../visitantes/repositorios/repositorio-visitantes.js";
import {
  buscarIdentidadePessoalDoUsuario,
  ErroViolacaoUnicaIdentidade,
  identificarViolacaoUnica,
  inserirIdentidadePessoal,
  type IdentidadeRegistro,
} from "../repositorios/repositorio-identidades.js";

type ResultadoCriarIdentidadePessoal =
  | { tipo: "criada"; identidade: IdentidadeRegistro }
  | { tipo: "ja-existente"; identidade: IdentidadeRegistro }
  | { tipo: "nome-usuario-indisponivel" }
  | { tipo: "identidade-pessoal-ja-existe" };

/**
 * Cria a identidade pessoal da conta. Idempotente: repetir a mesma solicitação
 * (ex.: reenvio após falha de rede) devolve a identidade já criada.
 * A garantia final de unicidade é do banco (índices únicos), inclusive sob concorrência.
 */
export async function criarIdentidadePessoal(
  banco: Banco,
  usuarioId: string,
  entrada: { nomeExibicao: string; nomeUsuario: string },
): Promise<ResultadoCriarIdentidadePessoal> {
  const existente = await buscarIdentidadePessoalDoUsuario(banco, usuarioId);
  if (existente) {
    return compararComExistente(existente, entrada);
  }

  /*
   * Ex-VISITANTE que acabou de criar a conta: a identidade dele já existe (é a que conversou). Ela
   * ganha o nome e o @usuario definitivos e deixa de ser visitante — a marca some e, com ela, a
   * expiração. Mesmo id: as conversas continuam exatamente onde estavam.
   */
  const visitante = await buscarVisitanteDoUsuario(banco, usuarioId);
  if (visitante) {
    if (!visitante.convertidaEm) return { tipo: "identidade-pessoal-ja-existe" };
    try {
      const identidade = await banco.transaction(async (transacao) => {
        const [atualizada] = await transacao
          .update(identidades)
          .set({ nomeExibicao: entrada.nomeExibicao, nomeUsuario: entrada.nomeUsuario })
          .where(eq(identidades.id, visitante.identidadeId))
          .returning();
        await transacao.delete(identidadesVisitantes).where(eq(identidadesVisitantes.identidadeId, visitante.identidadeId));
        return atualizada;
      });
      if (!identidade) throw new Error("Identidade convertida não encontrada.");
      return { tipo: "criada", identidade };
    } catch (erro) {
      const violacao = identificarViolacaoUnica(erro);
      if (violacao === "nomeUsuario") return { tipo: "nome-usuario-indisponivel" };
      throw erro;
    }
  }

  try {
    const identidade = await inserirIdentidadePessoal(banco, { usuarioId, ...entrada });
    return { tipo: "criada", identidade };
  } catch (erro) {
    if (!(erro instanceof ErroViolacaoUnicaIdentidade)) {
      throw erro;
    }

    if (erro.violacao === "nomeUsuario") {
      return { tipo: "nome-usuario-indisponivel" };
    }

    // Outra requisição concorrente da mesma conta venceu a corrida.
    const criadaEmParalelo = await buscarIdentidadePessoalDoUsuario(banco, usuarioId);
    return criadaEmParalelo
      ? compararComExistente(criadaEmParalelo, entrada)
      : { tipo: "identidade-pessoal-ja-existe" };
  }
}

function compararComExistente(
  existente: IdentidadeRegistro,
  entrada: { nomeExibicao: string; nomeUsuario: string },
): ResultadoCriarIdentidadePessoal {
  const mesmaSolicitacao =
    existente.nomeUsuario === entrada.nomeUsuario && existente.nomeExibicao === entrada.nomeExibicao;

  return mesmaSolicitacao
    ? { tipo: "ja-existente", identidade: existente }
    : { tipo: "identidade-pessoal-ja-existe" };
}
