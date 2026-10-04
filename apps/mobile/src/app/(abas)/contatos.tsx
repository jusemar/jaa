import { TelaContatos } from "@/features/contatos/components/tela-contatos";
import { useAbrirConversa } from "@/features/conversas/hooks/use-abrir-conversa";
import { useIdentidadeAtiva } from "@/features/identidades/components/provedor-identidade-ativa";

export default function ContatosScreen() {
  const { ativa } = useIdentidadeAtiva();
  const { abrirCom } = useAbrirConversa(ativa?.identidadeId ?? "");
  if (!ativa) return null;
  return <TelaContatos key={ativa.identidadeId} aoAbrirConversa={(nomeUsuario) => void abrirCom(nomeUsuario)} />;
}
