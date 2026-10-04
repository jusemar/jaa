import type { ItemListaConversas } from "@jaa/contratos";
import { serializarMensagem } from "../../mensagens/lib/serializar-mensagem.js";
import type { ItemListaConversasRegistro } from "../repositorios/repositorio-conversas.js";

// Campos escolhidos um a um: nada da conta (telefone, e-mail, usuarioId) chega ao cliente.
// `fotoUrl` chega já decidida pela privacidade do dono (`resolverFotosVisiveis`); nunca a chave do arquivo.
export function serializarItemListaConversas(item: ItemListaConversasRegistro, fotoUrl: string | null): ItemListaConversas {
  return {
    id: item.conversaId,
    tipo: item.tipo,
    outraIdentidade: {
      identidadeId: item.outraIdentidade.identidadeId,
      tipo: item.outraIdentidade.tipo,
      nomeExibicao: item.outraIdentidade.nomeExibicao,
      nomeUsuario: item.outraIdentidade.nomeUsuario,
      fotoUrl,
    },
    ultimaMensagem: item.ultimaMensagem ? serializarMensagem(item.ultimaMensagem) : null,
    atividadeId: item.atividadeId,
    naoLidas: item.naoLidas,
    comunicacaoBloqueada: item.comunicacaoBloqueada,
  };
}
