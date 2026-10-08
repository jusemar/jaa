import { SENHA_TAMANHO_MINIMO } from "@jaa/contratos";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { CampoTexto } from "@/components/ui/campo-texto";
import { Icone } from "@/components/ui/icone";
import { Aviso, Cartao } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { Espaco } from "@/constants/theme";
import { buscarSituacaoSenha, salvarSenha } from "../lib/api-perfil";
import { podeEnviarSenha } from "../lib/senha";

/**
 * SENHA da conta — o mesmo fluxo da Web, pelas mesmas rotas (Better Auth). O cadastro continua sendo
 * por código no celular; a senha é o atalho para entrar depois, sem esperar SMS.
 *
 * Trocar exige a senha atual: uma sessão esquecida aberta num aparelho não pode virar troca de senha.
 */
export function FormularioSenha() {
  // null = ainda não se sabe se a conta já tem senha.
  const [definida, setDefinida] = useState<boolean | null>(null);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [senha, setSenha] = useState("");
  const [visivel, setVisivel] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salva, setSalva] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    void buscarSituacaoSenha().then((resposta) => {
      if (!ativo) return;
      if (resposta.ok) setDefinida(resposta.dados.definida);
      else setErro(resposta.mensagem);
    });
    return () => {
      ativo = false;
    };
  }, []);

  async function enviar() {
    if (salvando || definida === null || !podeEnviarSenha({ definida, senha, senhaAtual })) return;
    setSalvando(true);
    setErro(null);
    setSalva(false);
    try {
      const resposta = await salvarSenha(senha, definida ? senhaAtual : undefined);
      if (!resposta.ok) {
        setErro(resposta.status === 0 ? "Sem conexão. Tente de novo." : resposta.mensagem);
        return;
      }
      setDefinida(true);
      setSalva(true);
      setSenha("");
      setSenhaAtual("");
    } finally {
      setSalvando(false);
    }
  }

  const olho = { icone: visivel ? ("olhoFechado" as const) : ("olho" as const), rotulo: visivel ? "Ocultar senha" : "Mostrar senha", ativa: visivel, aoTocar: () => setVisivel((atual) => !atual) };

  return (
    <Cartao style={estilos.cartao}>
      {definida && (
        <CampoTexto
          rotulo="Senha atual"
          value={senhaAtual}
          secureTextEntry={!visivel}
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(texto) => {
            setSalva(false);
            setSenhaAtual(texto);
          }}
          acao={olho}
        />
      )}
      <CampoTexto
        rotulo={definida ? "Nova senha" : "Criar senha"}
        value={senha}
        secureTextEntry={!visivel}
        autoComplete="new-password"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={(texto) => {
          setSalva(false);
          setSenha(texto);
        }}
        acao={olho}
        dica={`Pelo menos ${SENHA_TAMANHO_MINIMO} caracteres. Esqueceu? Você sempre pode entrar com o código enviado para o seu celular.`}
      />
      <Botao
        rotulo={definida ? "Alterar senha" : "Criar senha"}
        carregando={salvando}
        textoCarregando="Salvando…"
        disabled={salvando || definida === null || !podeEnviarSenha({ definida, senha, senhaAtual })}
        onPress={() => void enviar()}
      />
      {salva && (
        <View accessibilityLiveRegion="polite" style={estilos.confirmacao}>
          <Icone nome="check" tamanho={16} cor="marca" />
          <Texto cor="marca" style={estilos.flex}>
            Senha salva. Agora você pode entrar com seu celular ou @usuario e a senha.
          </Texto>
        </View>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </Cartao>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  cartao: { gap: Espaco.quatro, padding: Espaco.quatro },
  confirmacao: { alignItems: "flex-start", flexDirection: "row", gap: Espaco.dois },
});
