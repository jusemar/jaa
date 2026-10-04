import type { IdentidadeVisivel } from "@jaa/contratos";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AvatarIdentidade } from "@/components/ui/avatar";
import { Icone } from "@/components/ui/icone";
import { SeloEmpresa } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";

/**
 * Cabeçalho da conversa: voltar, avatar, nome e a atividade atual — o mesmo da Web.
 *
 * PRESENÇA é discreta: uma bolinha no avatar e uma linha curta abaixo do nome. Quando a presença não é
 * conhecida (a outra pessoa pode tê-la restringido), NADA é afirmado: aparece só o @usuario.
 */
export function CabecalhoConversa({
  outraIdentidade,
  presenca,
  digitando,
  acoes,
  aoVoltar,
  bloqueada = false,
}: {
  outraIdentidade: IdentidadeVisivel;
  // Comunicação bloqueada (qualquer sentido): símbolo discreto junto ao nome, sem aviso textual.
  bloqueada?: boolean;
  presenca: "online" | "offline" | null;
  digitando: boolean;
  acoes?: ReactNode;
  aoVoltar: () => void;
}) {
  const { top } = useSafeAreaInsets();
  const descricaoPresenca = presenca === "online" ? "Disponível agora" : presenca === "offline" ? "Sem conexão agora" : null;
  const emDestaque = digitando || presenca === "online";

  return (
    <View accessibilityLabel="Cabeçalho da conversa" style={[estilos.cabecalho, { paddingTop: Math.max(top, Espaco.dois) }]}>
      <View style={estilos.identidade}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar para conversas" onPress={aoVoltar} style={({ pressed }) => [estilos.voltar, pressed && estilos.pressionado]}>
          <Icone nome="voltar" />
        </Pressable>

        <View>
          <AvatarIdentidade identidade={outraIdentidade} tamanho="medio" />
          {presenca && <View accessibilityLabel={descricaoPresenca ?? undefined} style={[estilos.presenca, presenca === "online" ? estilos.online : estilos.offline]} />}
        </View>

        <View style={estilos.texto}>
          <View style={estilos.nome}>
            <Texto variante="corpoForte" numberOfLines={1} accessibilityRole="header" style={estilos.encolhe}>
              {outraIdentidade.nomeExibicao}
            </Texto>
            {bloqueada && <Icone nome="bloqueio" tamanho={14} cor="perigo" />}
            {outraIdentidade.tipo === "empresarial" && <SeloEmpresa />}
          </View>
          {/* Atividade em uma linha. Presença desconhecida (privacidade): só o @usuario, sem bolinha. */}
          <View accessibilityLiveRegion="polite" style={estilos.atividade}>
            {emDestaque && <View style={estilos.ponto} />}
            <Texto variante="pequeno" cor={emDestaque ? "marca" : "conteudoSuave"} numberOfLines={1}>
              {digitando ? "digitando…" : descricaoPresenca ? (presenca === "online" ? "online agora" : "sem conexão") : `@${outraIdentidade.nomeUsuario}`}
            </Texto>
          </View>
        </View>
      </View>

      {acoes && <View style={estilos.acoes}>{acoes}</View>}
    </View>
  );
}

/** Botão do cabeçalho da conversa: SÓ ÍCONE, com o significado no rótulo acessível (como na Web). */
export function BotaoCabecalho({ ativo, titulo, marcador, aoTocar, children }: { ativo: boolean; titulo: string; marcador?: ReactNode; aoTocar: () => void; children: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={titulo}
      accessibilityState={{ selected: ativo }}
      onPress={aoTocar}
      style={({ pressed }) => [estilos.botao, ativo && estilos.botaoAtivo, pressed && estilos.pressionado]}>
      {children}
      {marcador}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  cabecalho: {
    alignItems: "center",
    backgroundColor: Cores.superficie,
    borderBottomColor: Cores.borda,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: Espaco.dois,
    minHeight: 72,
    paddingBottom: Espaco.dois,
    paddingHorizontal: Espaco.tres,
  },
  identidade: { alignItems: "center", flex: 1, flexDirection: "row", gap: Espaco.tres, minWidth: 0 },
  voltar: { alignItems: "center", borderRadius: Raio.compacto, height: 40, justifyContent: "center", marginLeft: -4, width: 40 },
  pressionado: { backgroundColor: Cores.realce },
  presenca: { borderColor: Cores.superficie, borderRadius: 6, borderWidth: 2, bottom: -2, height: 12, position: "absolute", right: -2, width: 12 },
  online: { backgroundColor: Cores.marca },
  offline: { backgroundColor: "#B1B7B8" },
  texto: { flex: 1, minWidth: 0 },
  nome: { alignItems: "center", flexDirection: "row", gap: Espaco.dois },
  encolhe: { flexShrink: 1 },
  atividade: { alignItems: "center", flexDirection: "row", gap: 6, minHeight: 16 },
  ponto: { backgroundColor: Cores.marca, borderRadius: 3, height: 6, width: 6 },
  acoes: { alignItems: "center", flexDirection: "row", gap: Espaco.um },
  botao: { alignItems: "center", borderColor: "transparent", borderRadius: Raio.compacto, borderWidth: 1, height: 44, justifyContent: "center", width: 44 },
  botaoAtivo: { backgroundColor: Cores.selecionadoFundo, borderColor: Cores.marca },
});
