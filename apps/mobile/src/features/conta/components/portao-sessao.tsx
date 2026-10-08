import { useEffect, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { TelaDeCarregamento } from "@/components/ui/tela-carregamento";
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

  // Carregando (ou sem conseguir falar com o servidor): a arte de carregamento do Jaaa, a mesma do início.
  return (
    <TelaDeCarregamento>
      {erro && !carregando ? (
        <View style={estilos.bloco}>
          <Texto variante="corpoForte" style={estilos.centro}>
            Não foi possível falar com o Jaaa
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
    </TelaDeCarregamento>
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
  bloco: { alignItems: "center", gap: Espaco.tres },
  centro: { textAlign: "center" },
});
