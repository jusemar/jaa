import { useIdentidadeAtiva } from "@/features/identidades/components/provedor-identidade-ativa";
import { TelaPerfil } from "@/features/perfil/components/tela-perfil";

export default function PerfilScreen() {
  const { ativa } = useIdentidadeAtiva();
  if (!ativa) return null;
  // `key`: agindo como a empresa, "meu perfil" é o perfil DA EMPRESA.
  return <TelaPerfil key={ativa.identidadeId} ehEmpresa={ativa.tipo === "empresarial"} />;
}
