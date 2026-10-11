import { Redirect } from "expo-router";
import { useAbrirConversa } from "@/features/conversas/hooks/use-abrir-conversa";
import { useIdentidadeAtiva } from "@/features/identidades/components/provedor-identidade-ativa";
import { TelaLogisticaEmpresa } from "@/features/logistica/components/tela-logistica-empresa";

/** Aba da EMPRESA: operação das rotas, entregadores/base/fila e zonas com automação — a mesma área da Web. */
export default function LogisticaScreen() {
  const { ativa } = useIdentidadeAtiva();
  const { abrirCom } = useAbrirConversa(ativa?.identidadeId ?? "");
  if (!ativa) return null;
  // A área só existe agindo como empresa (a API recusaria de qualquer forma).
  if (ativa.tipo !== "empresarial") return <Redirect href="/" />;
  return <TelaLogisticaEmpresa key={ativa.empresa.id} empresaId={ativa.empresa.id} nomeEmpresa={ativa.nomeExibicao} aoAbrirConversa={(nomeUsuario) => void abrirCom(nomeUsuario)} />;
}
