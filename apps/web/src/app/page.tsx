import { IndicadorRealtime } from "@/components/indicador-realtime";
import { FluxoAutenticacao } from "@/features/autenticacao/components/fluxo-autenticacao";

// O fluxo decide sozinho o que mostrar: entrada, cadastro ou o aplicativo com a navegação completa.
export default function Home() {
  return (
    <>
      <IndicadorRealtime />
      <FluxoAutenticacao />
    </>
  );
}
