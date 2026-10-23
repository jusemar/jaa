import { StyleSheet, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { Icone } from "@/components/ui/icone";
import { Cartao, Secao } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { Espaco } from "@/constants/theme";
import { usePush } from "./provedor-push";

/**
 * "Ativar avisos no celular" — oferecido em Conversas, onde faz sentido, nunca na abertura do app sem
 * contexto. "Agora não" encerra a oferta; o Perfil continua tendo o caminho para ativar.
 */
export function CartaoAvisosNoCelular() {
  const { oferta, ativar, abrirConfiguracoes, dispensar } = usePush();
  if (oferta === "nenhuma") return null;
  const pedir = oferta === "pedir";
  return (
    <Cartao accessibilityLabel="Avisos no celular" style={estilos.cartao}>
      <View style={estilos.linha}>
        <Icone nome="sino" tamanho={20} cor="marca" />
        <View style={estilos.texto}>
          <Texto variante="corpoMedio">{pedir ? "Ativar avisos no celular" : "Avisos do Jaaa desligados"}</Texto>
          <Texto variante="pequeno" cor="conteudoSuave">
            {pedir ? "Saiba de novas mensagens mesmo com o Jaaa fechado." : "Para receber mensagens com o Jaaa fechado, permita as notificações nas configurações do Android."}
          </Texto>
        </View>
      </View>
      <View style={estilos.acoes}>
        <Botao rotulo={pedir ? "Ativar" : "Abrir configurações"} compacto onPress={() => (pedir ? void ativar() : abrirConfiguracoes())} />
        <Botao rotulo="Agora não" aparencia="discreto" compacto onPress={dispensar} />
      </View>
    </Cartao>
  );
}

/** No Perfil: a situação dos avisos e o caminho para mudar — sempre disponível, mesmo depois de "Agora não". */
export function SecaoAvisosNoCelular() {
  const { permissao, ativar, abrirConfiguracoes } = usePush();
  if (!permissao) return null;
  const ativos = permissao.status === "granted";
  return (
    <Secao titulo="Avisos no celular" descricao="Novas mensagens chegam mesmo com o Jaaa fechado. O que aparece e o som são decididos por você no Android.">
      <Cartao style={estilos.cartao}>
        <Texto>{ativos ? "Ativados neste aparelho." : "Desligados neste aparelho."}</Texto>
        <View style={estilos.acoes}>
          {!ativos && permissao.podePerguntar ? (
            <Botao rotulo="Ativar avisos" compacto onPress={() => void ativar()} />
          ) : (
            <Botao rotulo="Configurar no Android" aparencia="secundario" compacto onPress={abrirConfiguracoes} />
          )}
        </View>
      </Cartao>
    </Secao>
  );
}

const estilos = StyleSheet.create({
  cartao: { gap: Espaco.tres, padding: Espaco.quatro },
  linha: { alignItems: "flex-start", flexDirection: "row", gap: Espaco.tres },
  texto: { flex: 1, gap: Espaco.um, minWidth: 0 },
  acoes: { flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois },
});
