import { tipoIdentidadeSchema } from "@jaa/contratos";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { TelaConversa } from "@/features/conversas/components/tela-conversa";
import { previaDaRota } from "@/features/conversas/lib/identidade-da-conversa";
import { useIdentidadeAtiva } from "@/features/identidades/components/provedor-identidade-ativa";

/** A conversa aberta, em tela cheia sobre a lista (o painel da direita da Web, no formato de celular). */
export default function ConversaScreen() {
  const router = useRouter();
  const { ativa } = useIdentidadeAtiva();
  const params = useLocalSearchParams<{ id: string; identidadeId?: string; tipo?: string; nomeExibicao?: string; nomeUsuario?: string; previaFotoUrl?: string }>();
  const tipo = tipoIdentidadeSchema.safeParse(params.tipo);
  const valida = Boolean(params.id && params.identidadeId && params.nomeExibicao && params.nomeUsuario && tipo.success);

  // Rota aberta sem os dados públicos de quem está do outro lado: volta para a lista.
  useEffect(() => {
    if (!valida) router.back();
  }, [valida, router]);

  if (!ativa || !valida || !tipo.success) return null;
  return (
    <TelaConversa
      // Trocar de identidade com a conversa aberta recomeça tudo como a nova identidade.
      key={ativa.identidadeId}
      identidadeId={ativa.identidadeId}
      tipoIdentidade={ativa.tipo}
      conversa={{
        id: params.id,
        outraIdentidade: { identidadeId: params.identidadeId as string, tipo: tipo.data, nomeExibicao: params.nomeExibicao as string, nomeUsuario: params.nomeUsuario as string },
        // Só para a primeira pintura; a foto definitiva vem da API (`useIdentidadeDaConversa`).
        previaFotoUrl: previaDaRota(params.previaFotoUrl),
      }}
    />
  );
}
