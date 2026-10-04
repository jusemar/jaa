import { useEffect, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Botao } from "@/components/ui/botao";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco } from "@/constants/theme";
import { TelaEntrar } from "@/features/autenticacao/components/tela-entrar";
import { ProvedorIdentidadeAtiva } from "@/features/identidades/components/provedor-identidade-ativa";
import { URL_API } from "@/lib/configuracao";
import { conectarRealtime, desconectarRealtime } from "@/lib/realtime/cliente-realtime";
import { useContextoConta } from "./provedor-contexto-conta";

/*
 * PORTÃO DO APP: decide, a partir do contexto central da conta, se a pessoa vê a entrada, o término do
 * cadastro ou o aplicativo. É a mesma decisão que o `FluxoAutenticacao` toma na Web — e é só
 * apresentação: cada rota da API continua exigindo a sessão por conta própria.
 */
export function PortaoSessao({ children }: { children: ReactNode }) {
  const { contexto, carregando, semSessao, erro, recarregar } = useContextoConta();
  const aoEntrar = () => void recarregar();

  if (semSessao) return <TelaEntrar aoEntrar={aoEntrar} />;
  // Sessão válida de conta ainda sem identidade pessoal: falta só concluir o cadastro.
  if (contexto && !contexto.conta.cadastroCompleto) return <TelaEntrar aoEntrar={aoEntrar} etapaInicial="cadastro" />;
  if (contexto) return <SessaoAtiva>{children}</SessaoAtiva>;

  return (
    <SafeAreaView style={estilos.tela}>
      <Texto variante="marca" cor="marca">
        Jaa
      </Texto>
      {erro && !carregando ? (
        <View style={estilos.bloco}>
          <Texto variante="corpoForte" style={estilos.centro}>
            Não foi possível falar com o Jaa
          </Texto>
          <Texto variante="pequeno" cor="conteudoSuave" style={estilos.centro}>
            {erro} Confira sua conexão e tente de novo.
          </Texto>
          <Botao rotulo="Tentar de novo" centralizado onPress={() => void recarregar()} />
          {__DEV__ && (
            <Texto variante="pequeno" cor="conteudoSuave" style={estilos.centro}>
              Servidor: {URL_API}
            </Texto>
          )}
        </View>
      ) : (
        <ActivityIndicator color={Cores.marca} accessibilityLabel="Carregando" />
      )}
    </SafeAreaView>
  );
}

/*
 * Tudo o que só existe COM sessão: a conexão realtime (uma para o app inteiro, encerrada ao sair) e a
 * identidade atuante. As telas só montam depois que a identidade está resolvida — a primeira requisição
 * já sai em nome da identidade certa.
 */
function SessaoAtiva({ children }: { children: ReactNode }) {
  useEffect(() => {
    void conectarRealtime();
    return () => desconectarRealtime();
  }, []);

  return <ProvedorIdentidadeAtiva>{children}</ProvedorIdentidadeAtiva>;
}

const estilos = StyleSheet.create({
  tela: { alignItems: "center", backgroundColor: Cores.fundo, flex: 1, gap: Espaco.cinco, justifyContent: "center", padding: Espaco.cinco },
  bloco: { alignItems: "center", gap: Espaco.tres },
  centro: { textAlign: "center" },
});
