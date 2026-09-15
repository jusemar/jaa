import type { Banco } from "@jaa/banco";
import {
  listarConversasDaIdentidade,
  type ItemListaConversasRegistro,
} from "../repositorios/repositorio-conversas.js";

type ResultadoListarConversas = { conversas: ItemListaConversasRegistro[]; proximoCursor: string | null };

/**
 * Lista SOMENTE as conversas de que a identidade da sessão participa; não há parâmetro
 * que escolha outra identidade. Abrir uma conversa da lista continua passando pela
 * autorização de participação das rotas de mensagens.
 */
export async function listarConversas(
  banco: Banco,
  identidadeId: string,
  consulta: { antesDe?: string | undefined; limite: number },
): Promise<ResultadoListarConversas> {
  const { conversas, haMais } = await listarConversasDaIdentidade(banco, identidadeId, consulta);
  const ultima = conversas.at(-1);

  return {
    conversas,
    proximoCursor: haMais && ultima ? ultima.ultimaMensagem.id : null,
  };
}
