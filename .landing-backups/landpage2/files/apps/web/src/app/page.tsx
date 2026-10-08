import type { Metadata } from "next";
import { EntradaPublica } from "@/features/landing/components/entrada-publica";
import { LandingPage } from "@/features/landing/components/landing-page";

export const metadata: Metadata = {
  title: "Jaaa — Conversas, pedidos e entregas no mesmo lugar",
  description:
    "Converse com pessoas e empresas, faça pedidos dentro da conversa e acompanhe suas entregas. Use o Jaaa pelo navegador, no celular ou no computador.",
  alternates: { canonical: "https://jaaa.com.br/" },
  openGraph: {
    title: "Jaaa — Tudo que você precisa, no mesmo lugar",
    description:
      "Pessoas, empresas, pedidos e entregas. Tudo conectado pelo Jaaa.",
    url: "https://jaaa.com.br/",
    siteName: "Jaaa",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "https://jaaa.com.br/jaaa-logo-login.png",
        width: 1020,
        height: 275,
        alt: "Logo oficial Jaaa",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Jaaa — Tudo no mesmo lugar",
    description: "Conversas, empresas, pedidos e entregas conectados.",
    images: ["https://jaaa.com.br/jaaa-logo-login.png"],
  },
};
export default function Home() {
  return (
    <EntradaPublica>
      <LandingPage />
    </EntradaPublica>
  );
}
