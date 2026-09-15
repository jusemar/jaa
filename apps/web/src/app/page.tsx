import { IndicadorRealtime } from "@/components/indicador-realtime";
import { FluxoAutenticacao } from "@/features/autenticacao/components/fluxo-autenticacao";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center gap-8 bg-white px-6 py-16 text-black">
      <IndicadorRealtime />
      <FluxoAutenticacao />
    </main>
  );
}
