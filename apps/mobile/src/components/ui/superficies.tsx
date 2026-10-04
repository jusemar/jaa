import type { ReactNode } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { Cores, Espaco, Raio, SombraCartao } from "@/constants/theme";
import { Texto } from "./texto";

/* Superfícies e sinais do Jaa — `Cartao`, `Secao`, `Selo`, `Aviso`, `EstadoVazio` e `Carregando` da Web. */

export function Cartao({ style, ...props }: ViewProps) {
  return <View {...props} style={[estilos.cartao, style]} />;
}

/** Bloco de conteúdo com título, como a `Secao` da Web (título em destaque + descrição suave). */
export function Secao({ titulo, descricao, acoes, children }: { titulo: string; descricao?: string | undefined; acoes?: ReactNode; children: ReactNode }) {
  return (
    <View accessibilityLabel={titulo} style={estilos.secao}>
      <View style={estilos.cabecalhoSecao}>
        <View style={estilos.tituloSecao}>
          <Texto variante="titulo" accessibilityRole="header">
            {titulo}
          </Texto>
          {descricao && <Texto cor="conteudoSuave">{descricao}</Texto>}
        </View>
        {acoes}
      </View>
      {children}
    </View>
  );
}

const TONS_SELO = {
  neutro: { fundo: Cores.superficieSuave, texto: "conteudoSuave" },
  marca: { fundo: Cores.marcaSuave, texto: "marcaSuaveConteudo" },
  atencao: { fundo: Cores.ouroSuave, texto: "aviso" },
} as const;

export function Selo({ rotulo, tom = "neutro" }: { rotulo: string; tom?: keyof typeof TONS_SELO }) {
  const visual = TONS_SELO[tom];
  return (
    <View style={[estilos.selo, { backgroundColor: visual.fundo }]}>
      <Texto variante="miniForte" cor={visual.texto} style={estilos.textoSelo}>
        {rotulo}
      </Texto>
    </View>
  );
}

/** Selo "Empresa" do cabeçalho da conversa e da busca: ouro translúcido com texto em tom de aviso. */
export function SeloEmpresa() {
  return <Selo rotulo="Empresa" tom="atencao" />;
}

const TONS_AVISO = {
  informacao: { fundo: Cores.superficieSuave, borda: Cores.borda, texto: "conteudoSuave" },
  atencao: { fundo: "#FBF6E8", borda: "#DBCDA6", texto: "aviso" },
  erro: { fundo: Cores.perigoSuave, borda: "#F6B3B6", texto: "perigo" },
} as const;

export function Aviso({ tom = "informacao", children }: { tom?: keyof typeof TONS_AVISO; children: ReactNode }) {
  const visual = TONS_AVISO[tom];
  return (
    <View accessibilityRole={tom === "erro" ? "alert" : "text"} style={[estilos.aviso, { backgroundColor: visual.fundo, borderColor: visual.borda }]}>
      <Texto cor={visual.texto}>{children}</Texto>
    </View>
  );
}

/** Estado vazio com o próximo passo à mão: lista vazia não pode ser um beco sem saída. */
export function EstadoVazio({ titulo, descricao, acao }: { titulo: string; descricao: string; acao?: ReactNode }) {
  return (
    <View style={estilos.vazio}>
      <Texto variante="corpoForte" style={estilos.centro}>
        {titulo}
      </Texto>
      <Texto cor="conteudoSuave" style={estilos.centro}>
        {descricao}
      </Texto>
      {acao}
    </View>
  );
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <Texto cor="conteudoSuave" accessibilityLiveRegion="polite" style={estilos.carregando}>
      {texto}
    </Texto>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.bloco, borderWidth: 1, ...SombraCartao },
  secao: { gap: Espaco.tres },
  cabecalhoSecao: { alignItems: "flex-end", flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois, justifyContent: "space-between" },
  tituloSecao: { flex: 1, gap: 2, minWidth: 0 },
  selo: { alignSelf: "flex-start", borderRadius: Raio.total, paddingHorizontal: Espaco.dois, paddingVertical: 2 },
  textoSelo: { letterSpacing: 0.4, textTransform: "uppercase" },
  aviso: { borderRadius: Raio.bloco, borderWidth: 1, paddingHorizontal: Espaco.tres, paddingVertical: Espaco.dois },
  vazio: {
    alignItems: "center",
    borderColor: Cores.borda,
    borderRadius: Raio.bloco,
    borderStyle: "dashed",
    borderWidth: 1,
    gap: Espaco.dois,
    paddingHorizontal: Espaco.quatro,
    paddingVertical: Espaco.seis,
  },
  centro: { textAlign: "center" },
  carregando: { paddingHorizontal: Espaco.um, paddingVertical: Espaco.quatro },
});
