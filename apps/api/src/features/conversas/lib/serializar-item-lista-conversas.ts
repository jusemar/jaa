import type { ItemListaConversas } from "@jaa/contratos";
import { serializarMensagem } from "../../mensagens/lib/serializar-mensagem.js";
import type { ItemListaConversasRegistro } from "../repositorios/repositorio-conversas.js";

// Campos escolhidos um a um: nada da conta (telefone, e-mail, usuarioId) chega ao cliente.
export function serializarItemListaConversas(item: ItemListaConversasRegistro): ItemListaConversas {
  return {
    id: item.conversaId,
    tipo: item.tipo,
    outraIdentidade: {
      identidadeId: item.outraIdentidade.identidadeId,
      tipo: item.outraIdentidade.tipo,
      nomeExibicao: item.outraIdentidade.nomeExibicao,
      nomeUsuario: item.outraIdentidade.nomeUsuario,
    },
    ultimaMensagem: serializarMensagem(item.ultimaMensagem),
    naoLidas: item.naoLidas,
  };
}
