import { Redirect } from "expo-router";
import { useAbrirConversa } from "@/features/conversas/hooks/use-abrir-conversa";
import { useIdentidadeAtiva } from "@/features/identidades/components/provedor-identidade-ativa";
import { TelaPedidosEmpresa } from "@/features/pedidos/components/tela-pedidos-empresa";

/** Aba da EMPRESA: pedidos recebidos e a próxima ação de cada um — a mesma área da Web. */
export default function PedidosScreen() {
  const { ativa } = useIdentidadeAtiva();
  const { abrirCom } = useAbrirConversa(ativa?.identidadeId ?? "");
  if (!ativa) return null;
  // A área só existe agindo como empresa (a API recusaria de qualquer forma).
  if (ativa.tipo !== "empresarial") return <Redirect href="/" />;
  return <TelaPedidosEmpresa key={ativa.empresa.id} empresaId={ativa.empresa.id} nomeEmpresa={ativa.nomeExibicao} aoAbrirConversa={(nomeUsuario) => void abrirCom(nomeUsuario)} />;
}
