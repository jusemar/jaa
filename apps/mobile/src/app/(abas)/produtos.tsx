import { Redirect } from "expo-router";
import { useIdentidadeAtiva } from "@/features/identidades/components/provedor-identidade-ativa";
import { TelaProdutosEmpresa } from "@/features/produtos/components/tela-produtos-empresa";

/** Aba da EMPRESA: o catálogo (produtos, categorias, grupos de opções) — a mesma área da Web. */
export default function ProdutosScreen() {
  const { ativa } = useIdentidadeAtiva();
  if (!ativa) return null;
  // A área só existe agindo como empresa (a API recusaria de qualquer forma).
  if (ativa.tipo !== "empresarial") return <Redirect href="/" />;
  return <TelaProdutosEmpresa key={ativa.empresa.id} empresaId={ativa.empresa.id} nomeEmpresa={ativa.nomeExibicao} />;
}
