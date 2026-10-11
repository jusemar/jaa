import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icone, type NomeIcone } from "@/components/ui/icone";
import { Aviso } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { ALTURA_TOQUE, Cores, Espaco, Raio } from "@/constants/theme";

/* Peças de tela da administração de Produtos (só apresentação). */

export const mensagemDe = (resposta: { status: number; mensagem: string }) => (resposta.status === 0 ? "Sem conexão. Tente de novo." : resposta.mensagem);

/** Topo de uma tela aberta por cima de outra: o caminho de volta e, à direita, uma ação da tela. */
export function TopoComVoltar({ rotulo, aoVoltar, acao }: { rotulo: string; aoVoltar: () => void; acao?: ReactNode }) {
  return (
    <View style={estilos.topo}>
      <Pressable accessibilityRole="button" accessibilityLabel={rotulo} hitSlop={8} onPress={aoVoltar} style={({ pressed }) => [estilos.voltar, pressed && estilos.apagado]}>
        <Icone nome="voltar" tamanho={20} cor="marca" />
        <Texto variante="corpoMedio" cor="marca">
          {rotulo}
        </Texto>
      </Pressable>
      {acao}
    </View>
  );
}

export function BotaoIcone({ icone, rotulo, aoTocar, principal = false, desabilitado = false, cor }: { icone: NomeIcone; rotulo: string; aoTocar: () => void; principal?: boolean; desabilitado?: boolean; cor?: "perigo" | "conteudo" }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      accessibilityState={{ disabled: desabilitado }}
      disabled={desabilitado}
      hitSlop={4}
      onPress={aoTocar}
      style={({ pressed }) => [estilos.botaoIcone, principal && estilos.botaoIconePrincipal, (pressed || desabilitado) && estilos.apagado]}>
      <Icone nome={icone} tamanho={20} cor={principal ? "marcaConteudo" : (cor ?? "conteudoSuave")} />
    </Pressable>
  );
}

/** Barra de ações presa embaixo: o estado ("Alterações ainda não salvas") e os botões. */
export function BarraDeAcoes({ estado, tom = "neutro", erro, children }: { estado?: string | undefined; tom?: "neutro" | "pendente" | "sucesso"; /** A recusa de quem acabou de tocar em salvar: fica junto do botão, nunca fora da tela. */ erro?: string | null; children: ReactNode }) {
  return (
    <View style={estilos.barra}>
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {estado ? (
        <View accessibilityLiveRegion="polite" style={estilos.estado}>
          {tom === "sucesso" && <Icone nome="check" tamanho={14} cor="marca" />}
          <Texto variante={tom === "pendente" ? "pequenoForte" : "pequeno"} cor={tom === "pendente" ? "aviso" : tom === "sucesso" ? "marca" : "conteudoSuave"}>
            {estado}
          </Texto>
        </View>
      ) : null}
      <View style={estilos.botoes}>{children}</View>
    </View>
  );
}

/** Caixa de marcação com rótulo (o `checkbox` da Web). */
export function Marcacao({ rotulo, marcada, desabilitada = false, aoMudar, depois }: { rotulo: string; marcada: boolean; desabilitada?: boolean; aoMudar: (marcada: boolean) => void; depois?: ReactNode }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={rotulo} accessibilityState={{ checked: marcada, disabled: desabilitada }} disabled={desabilitada} onPress={() => aoMudar(!marcada)} style={[estilos.marcacao, desabilitada && estilos.apagado]}>
      <View style={[estilos.caixa, marcada && estilos.caixaMarcada]}>{marcada && <Icone nome="check" tamanho={14} cor="marcaConteudo" />}</View>
      <Texto style={estilos.flex}>{rotulo}</Texto>
      {depois}
    </Pressable>
  );
}

/** Campo que abre uma escolha (o `select` da Web): mostra o valor atual e a seta. */
export function CampoDeEscolha({ rotulo, valor, aoAbrir, dica, semRotulo = false }: { rotulo: string; valor: string; aoAbrir: () => void; dica?: string; semRotulo?: boolean }) {
  return (
    <View style={estilos.grupo}>
      {!semRotulo && <Texto variante="corpoMedio">{rotulo}</Texto>}
      <Pressable accessibilityRole="button" accessibilityLabel={`${rotulo}: ${valor}`} onPress={aoAbrir} style={({ pressed }) => [estilos.escolha, pressed && estilos.apagado]}>
        <Texto numberOfLines={1} style={estilos.flex}>
          {valor}
        </Texto>
        <Icone nome="expandir" tamanho={18} />
      </Pressable>
      {dica && (
        <Texto variante="pequeno" cor="conteudoSuave">
          {dica}
        </Texto>
      )}
    </View>
  );
}

/** Folha inferior com uma lista para escolher UM item (identificado por id, não pelo nome). */
export function FolhaDeEscolha({ titulo, itens, atual, aberta, aoEscolher, aoFechar }: { titulo: string; itens: readonly { id: string; rotulo: string }[]; atual: string; aberta: boolean; aoEscolher: (id: string) => void; aoFechar: () => void }) {
  const { bottom } = useSafeAreaInsets();
  return (
    <Modal visible={aberta} transparent animationType="fade" onRequestClose={aoFechar} statusBarTranslucent>
      <Pressable accessibilityLabel="Fechar" style={estilos.fundo} onPress={aoFechar}>
        <View style={[estilos.folha, { paddingBottom: Math.max(bottom, Espaco.tres) }]}>
          <Texto variante="pequeno" cor="conteudoSuave" style={estilos.tituloFolha}>
            {titulo}
          </Texto>
          <ScrollView>
            {itens.map((item) => {
              const marcado = item.id === atual;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: marcado }}
                  onPress={() => {
                    aoFechar();
                    aoEscolher(item.id);
                  }}
                  style={({ pressed }) => [estilos.itemFolha, pressed && estilos.pressionado]}>
                  <Texto variante={marcado ? "corpoForte" : "corpo"} cor={marcado ? "marca" : "conteudo"} numberOfLines={1} style={estilos.flex}>
                    {item.rotulo}
                  </Texto>
                  {marcado && <Icone nome="check" tamanho={18} cor="marca" />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  topo: { alignItems: "center", flexDirection: "row", gap: Espaco.dois, justifyContent: "space-between" },
  voltar: { alignItems: "center", flexDirection: "row", gap: Espaco.um, minHeight: ALTURA_TOQUE },
  apagado: { opacity: 0.5 },
  botaoIcone: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, height: ALTURA_TOQUE, justifyContent: "center", width: ALTURA_TOQUE },
  botaoIconePrincipal: { backgroundColor: Cores.marca, borderColor: Cores.marca },
  barra: { backgroundColor: Cores.superficie, borderTopColor: Cores.borda, borderTopWidth: 1, gap: Espaco.dois, paddingHorizontal: Espaco.quatro, paddingVertical: Espaco.dois },
  estado: { alignItems: "center", flexDirection: "row", gap: Espaco.um, justifyContent: "center" },
  botoes: { alignItems: "center", flexDirection: "row", gap: Espaco.dois, justifyContent: "flex-end" },
  marcacao: { alignItems: "center", flexDirection: "row", gap: Espaco.tres, minHeight: ALTURA_TOQUE },
  caixa: { alignItems: "center", borderColor: Cores.borda, borderRadius: 4, borderWidth: 1.5, height: 22, justifyContent: "center", width: 22 },
  caixaMarcada: { backgroundColor: Cores.marca, borderColor: Cores.marca },
  grupo: { gap: 6 },
  escolha: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, flexDirection: "row", gap: Espaco.dois, minHeight: ALTURA_TOQUE, paddingHorizontal: Espaco.tres },
  fundo: { backgroundColor: "rgba(35,44,45,0.4)", flex: 1, justifyContent: "flex-end" },
  folha: { backgroundColor: Cores.superficie, borderTopLeftRadius: Raio.bloco * 2, borderTopRightRadius: Raio.bloco * 2, maxHeight: "70%", paddingTop: Espaco.dois },
  tituloFolha: { paddingHorizontal: Espaco.quatro, paddingVertical: Espaco.dois },
  itemFolha: { alignItems: "center", flexDirection: "row", gap: Espaco.tres, minHeight: 48, paddingHorizontal: Espaco.quatro },
  pressionado: { backgroundColor: Cores.superficieSuave },
});
