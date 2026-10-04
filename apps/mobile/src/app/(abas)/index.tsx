import { TelaConversas } from "@/features/conversas/components/tela-conversas";
import { useIdentidadeAtiva } from "@/features/identidades/components/provedor-identidade-ativa";

/** CONVERSAS: a tela principal do Jaa. A inbox é a da identidade ATUANTE (pessoa ou empresa operada). */
export default function ConversasScreen() {
  const { ativa } = useIdentidadeAtiva();
  if (!ativa) return null;
  // `key`: trocar de identidade recomeça inbox, confirmações e avisos do zero.
  return <TelaConversas key={ativa.identidadeId} identidadeId={ativa.identidadeId} tipoIdentidade={ativa.tipo} />;
}
