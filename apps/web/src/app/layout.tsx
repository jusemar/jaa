import type { Metadata } from "next";
import { Figtree, Outfit } from "next/font/google";
import "./globals.css";

/*
 * Tipografia da referência de UI/UX aprovada: Figtree no corpo (alta legibilidade em bloco de
 * conversa) e Outfit nos nomes e títulos, que é o que dá personalidade à marca.
 */
const fonteCorpo = Figtree({ variable: "--font-jaa-sans", subsets: ["latin"], display: "swap" });
const fonteDisplay = Outfit({ variable: "--font-jaa-display", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Jaa — Suas conversas, do seu jeito",
  description: "Converse com pessoas e empresas de um jeito simples, próximo e organizado no Jaa.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${fonteCorpo.variable} ${fonteDisplay.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
