import { StyleSheet, Text, type TextProps } from "react-native";
import { Cores, type Cor } from "@/constants/theme";

/*
 * Escala tipográfica da Web (Tailwind): base 14px (`text-sm`), apoio 12px (`text-xs`), miúdo 11px,
 * títulos 16–18px em negrito. A Web usa Sora nos títulos e Manrope no corpo; aqui, por enquanto, é a
 * fonte do sistema com os MESMOS tamanhos e pesos — as famílias entram quando forem empacotadas no app.
 */
const estilos = StyleSheet.create({
  // "Jaa" da tela de entrada: `text-3xl font-bold`.
  marca: { fontSize: 30, fontWeight: "700", lineHeight: 36 },
  // Título de seção: `fonte-display text-lg font-bold`.
  titulo: { fontSize: 18, fontWeight: "700", lineHeight: 24 },
  // Título de cabeçalho/painel: `fonte-display text-base font-bold`.
  subtitulo: { fontSize: 16, fontWeight: "700", lineHeight: 22 },
  // `text-sm`.
  corpo: { fontSize: 14, fontWeight: "400", lineHeight: 20 },
  corpoMedio: { fontSize: 14, fontWeight: "500", lineHeight: 20 },
  corpoForte: { fontSize: 14, fontWeight: "700", lineHeight: 20 },
  // `text-xs`.
  pequeno: { fontSize: 12, fontWeight: "400", lineHeight: 16 },
  pequenoMedio: { fontSize: 12, fontWeight: "500", lineHeight: 16 },
  pequenoForte: { fontSize: 12, fontWeight: "700", lineHeight: 16 },
  // `text-[11px]` / `text-[10px]`: horário, contador, selo.
  mini: { fontSize: 11, fontWeight: "400", lineHeight: 14 },
  miniForte: { fontSize: 10, fontWeight: "700", lineHeight: 13 },
});

export type VarianteTexto = keyof typeof estilos;

export function Texto({ variante = "corpo", cor = "conteudo", style, ...props }: TextProps & { variante?: VarianteTexto; cor?: Cor }) {
  return <Text {...props} style={[estilos[variante], { color: Cores[cor] }, style]} />;
}
