import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from "react-native";
import { ALTURA_TOQUE, Cores, Espaco, Raio, type Cor } from "@/constants/theme";
import { Texto } from "./texto";

/*
 * Botão do Jaa — as MESMAS aparências do `Botao` da Web: `principal` (jade cheio), `secundario`
 * (contorno), `realce` (verde claro da marca), `discreto` (só texto) e `perigo`. Cantos suaves, não
 * pílula; 44px de altura no toque.
 */
type Aparencia = "principal" | "secundario" | "realce" | "discreto" | "perigo";

const APARENCIAS: Record<Aparencia, { fundo: string; borda: string; texto: Cor }> = {
  principal: { fundo: Cores.marca, borda: Cores.marca, texto: "marcaConteudo" },
  secundario: { fundo: Cores.superficie, borda: Cores.borda, texto: "conteudo" },
  realce: { fundo: Cores.marcaSuave, borda: Cores.marcaSuave, texto: "marcaSuaveConteudo" },
  discreto: { fundo: "transparent", borda: "transparent", texto: "conteudoSuave" },
  perigo: { fundo: Cores.superficie, borda: "#F6B3B6", texto: "perigo" },
};

export function Botao({
  rotulo,
  aparencia = "principal",
  larguraTotal = false,
  centralizado = false,
  compacto = false,
  carregando = false,
  textoCarregando,
  disabled,
  ...props
}: Omit<PressableProps, "children" | "style"> & {
  rotulo: string;
  aparencia?: Aparencia;
  larguraTotal?: boolean;
  // Sem largura total, o botão fica à esquerda; `centralizado` o põe no meio (telas de estado).
  centralizado?: boolean;
  // Ação secundária dentro de uma linha (ex.: "Salvar", "Remover"): mais baixa e com texto menor.
  compacto?: boolean;
  // Ação em andamento: fica desabilitado (sem toque duplo) e mostra o indicador.
  carregando?: boolean;
  textoCarregando?: string;
}) {
  const visual = APARENCIAS[aparencia];
  const inativo = disabled || carregando;
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inativo), busy: carregando }}
      disabled={inativo}
      style={({ pressed }) => [
        estilos.base,
        compacto && estilos.compacto,
        { backgroundColor: visual.fundo, borderColor: visual.borda },
        larguraTotal ? estilos.larguraTotal : centralizado ? estilos.centralizado : estilos.ajustado,
        pressed && estilos.pressionado,
        inativo && estilos.inativo,
      ]}>
      {carregando && <ActivityIndicator size="small" color={Cores[visual.texto]} />}
      <Texto variante={compacto ? "pequenoMedio" : "corpoMedio"} cor={visual.texto}>
        {carregando && textoCarregando ? textoCarregando : rotulo}
      </Texto>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: Raio.compacto,
    borderWidth: 1,
    flexDirection: "row",
    gap: Espaco.dois,
    justifyContent: "center",
    minHeight: ALTURA_TOQUE,
    paddingHorizontal: Espaco.quatro,
  },
  compacto: { minHeight: 36, paddingHorizontal: Espaco.tres },
  larguraTotal: { alignSelf: "stretch" },
  ajustado: { alignSelf: "flex-start" },
  centralizado: { alignSelf: "center" },
  pressionado: { opacity: 0.85 },
  inativo: { opacity: 0.5 },
});
