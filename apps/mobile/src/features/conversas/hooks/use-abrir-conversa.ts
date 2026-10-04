import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { rotaDaConversa } from "../lib/abrir-conversa";
import { abrirConversaDireta } from "../lib/api-conversas";

/**
 * "Conversar com…" de qualquer área (busca, contatos, pedido): abre a conversa DIRETA de sempre com esse
 * @usuario, na identidade atuante, e empilha a tela dela. Quem pode conversar com quem é decisão da API.
 */
export function useAbrirConversa(identidadeId: string) {
  const router = useRouter();
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const abrirCom = useCallback(
    async (nomeUsuario: string) => {
      setErro(null);
      setAbrindo(true);
      try {
        const aberta = await abrirConversaDireta(nomeUsuario);
        if (!aberta.ok) {
          setErro(aberta.mensagem);
          return;
        }
        const outra = aberta.dados.participantes.find((participante) => participante.identidadeId !== identidadeId);
        if (outra) router.push(rotaDaConversa(aberta.dados.id, outra));
      } finally {
        setAbrindo(false);
      }
    },
    [identidadeId, router],
  );

  return { abrirCom, abrindo, erro };
}
