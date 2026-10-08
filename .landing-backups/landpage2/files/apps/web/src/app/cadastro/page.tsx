import type { Metadata } from "next";
import { IndicadorRealtime } from "@/components/indicador-realtime";
import { EntradaConta } from "@/features/landing/components/entrada-conta";

export const metadata: Metadata = {
  title: "Criar conta no Jaaa",
  robots: { index: false, follow: true },
};
export default function Cadastro() {
  return (
    <>
      <IndicadorRealtime />
      <EntradaConta criar />
    </>
  );
}
