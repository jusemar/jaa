import type { Metadata } from "next";
import { Manrope, Sora } from "next/font/google";
import "./globals.css";

/*
 * Tipografia da referência de UI/UX aprovada: MANROPE no corpo (numerais e preços muito legíveis em
 * lista e balão de conversa) e SORA nos títulos, nomes e valores em destaque, que é o que dá
 * personalidade sem pesar no texto corrido.
 *
 * As variáveis continuam se chamando `--font-jaa-sans`/`--font-jaa-display`: os componentes usam o
 * nome SEMÂNTICO, então trocar a fonte é mexer só aqui.
 */
const fonteCorpo = Manrope({ variable: "--font-jaa-sans", subsets: ["latin"], display: "swap" });
const fonteDisplay = Sora({ variable: "--font-jaa-display", subsets: ["latin"], display: "swap" });

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
