import type { CatalogoServicos, PerfilProfissionalDoDono, RespostaPerfilProfissional } from "@jaa/contratos";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { Icone } from "@/components/ui/icone";
import { Texto } from "@/components/ui/texto";
import { ALTURA_TOQUE, Cores, Espaco, Raio } from "@/constants/theme";
import type { RespostaApi } from "@/lib/api";

/* Peças e tipos compartilhados pelas etapas do Perfil profissional no app. */

export interface OpcoesAplicar {
  // Mensagem de SUCESSO. Ausente = ação sem aviso de sucesso (o erro sempre aparece).
  sucesso?: string;
  // Qual ação está em andamento: o botão dela mostra o indicador.
  chave?: string;
}

/**
 * Executa uma mutação do perfil e troca o estado da tela pela resposta do servidor (a autoridade).
 * Enquanto uma roda, as outras ficam bloqueadas. Devolve o perfil atualizado, ou null se recusou.
 */
export type Aplicar = (requisicao: Promise<RespostaApi<RespostaPerfilProfissional>>, opcoes?: OpcoesAplicar) => Promise<PerfilProfissionalDoDono | null>;

export interface PropsEtapa {
  perfil: PerfilProfissionalDoDono;
  aplicar: Aplicar;
  pendente: string | null;
}

export type { CatalogoServicos };

/** Escolha selecionável (chip): o estado vai dito ao leitor de tela, não só pela cor. */
export function Escolha({ papel, marcada, rotulo, desabilitada = false, aoAlternar }: { papel: "checkbox" | "radio"; marcada: boolean; rotulo: string; desabilitada?: boolean; aoAlternar: () => void }) {
  return (
    <Pressable
      accessibilityRole={papel}
      accessibilityState={{ checked: marcada, disabled: desabilitada }}
      accessibilityLabel={rotulo}
      disabled={desabilitada}
      onPress={aoAlternar}
      style={({ pressed }) => [estilos.escolha, marcada && estilos.escolhaMarcada, (pressed || desabilitada) && estilos.apagado]}>
      {marcada && <Icone nome="check" tamanho={16} cor="marca" />}
      <Texto variante="corpoMedio" cor={marcada ? "marca" : "conteudoSuave"}>
        {rotulo}
      </Texto>
    </Pressable>
  );
}

/** Linha com interruptor: rótulo, descrição curta e a chave à direita. */
export function LinhaInterruptor({ rotulo, descricao, ligado, desabilitado = false, aoMudar }: { rotulo: string; descricao?: string | undefined; ligado: boolean; desabilitado?: boolean; aoMudar: (ligado: boolean) => void }) {
  return (
    <View style={estilos.interruptor}>
      <View style={estilos.flex}>
        <Texto variante="corpoMedio">{rotulo}</Texto>
        {descricao && (
          <Texto variante="pequeno" cor="conteudoSuave">
            {descricao}
          </Texto>
        )}
      </View>
      <Switch value={ligado} disabled={desabilitado} onValueChange={aoMudar} trackColor={{ true: Cores.marca, false: Cores.borda }} thumbColor={Cores.superficie} accessibilityLabel={rotulo} />
    </View>
  );
}

/** Grupo de escolhas com título (especialidades, veículo…). */
export function GrupoEscolhas({ titulo, dica, children }: { titulo: string; dica?: string | undefined; children: ReactNode }) {
  return (
    <View accessibilityLabel={titulo} style={estilos.grupo}>
      <Texto variante="corpoForte">{titulo}</Texto>
      {dica && (
        <Texto variante="pequeno" cor="conteudoSuave">
          {dica}
        </Texto>
      )}
      <View style={estilos.escolhas}>{children}</View>
    </View>
  );
}

/** Divisória fina entre blocos de um mesmo cartão. */
export function Divisoria() {
  return <View style={estilos.divisoria} />;
}

const estilos = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  escolha: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, flexDirection: "row", gap: Espaco.um, justifyContent: "center", minHeight: ALTURA_TOQUE, paddingHorizontal: Espaco.quatro },
  escolhaMarcada: { backgroundColor: Cores.marcaSuave, borderColor: Cores.marca },
  apagado: { opacity: 0.6 },
  interruptor: { alignItems: "center", flexDirection: "row", gap: Espaco.tres, minHeight: ALTURA_TOQUE },
  grupo: { gap: Espaco.dois },
  escolhas: { flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois },
  divisoria: { backgroundColor: Cores.borda, height: StyleSheet.hairlineWidth },
});
