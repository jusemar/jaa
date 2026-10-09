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
 * SENHA da conta — o mesmo fluxo da Web, pelas mesmas rotas (Better Auth). O cadastro é por código
 * (SMS ou e-mail); a senha é o atalho para entrar depois, sem esperar o código.
 *
 * Trocar exige a senha atual: uma sessão esquecida aberta num aparelho não pode virar troca de senha.
 *
 * Fechado, o cartão mostra só "••••••••" (ou que ainda não há senha) e UMA ação; os campos aparecem
 * quando a pessoa toca em "Alterar senha" / "Criar senha" — e somem de novo ao salvar ou cancelar.
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
  const [aberto, setAberto] = useState(false);

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
      setAberto(false);
    } finally {
      setSalvando(false);
    }
  }

  const olho = { icone: visivel ? ("olhoFechado" as const) : ("olho" as const), rotulo: visivel ? "Ocultar senha" : "Mostrar senha", ativa: visivel, aoTocar: () => setVisivel((atual) => !atual) };

  return (
    <Cartao style={estilos.cartao}>
      <View>
        <Texto variante="pequeno" cor="conteudoSuave">
          Senha
        </Texto>
        <Texto cor={definida ? "conteudo" : "conteudoSuave"}>{definida === null ? "Carregando…" : definida ? "••••••••" : "Nenhuma senha criada"}</Texto>
      </View>
      {!aberto && definida !== null && (
        <Botao
          aparencia="secundario"
          rotulo={definida ? "Alterar senha" : "Criar senha"}
          onPress={() => {
            setErro(null);
            setSalva(false);
            setAberto(true);
          }}
        />
      )}
      {aberto && definida && (
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
      {aberto && (
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
        dica={`Pelo menos ${SENHA_TAMANHO_MINIMO} caracteres. Esqueceu? Você pode entrar com código por SMS ou e-mail.`}
      />
      )}
      {aberto && (
        <Botao
          rotulo={definida ? "Salvar nova senha" : "Criar senha"}
          carregando={salvando}
          textoCarregando="Salvando…"
          disabled={salvando || definida === null || !podeEnviarSenha({ definida, senha, senhaAtual })}
          onPress={() => void enviar()}
        />
      )}
      {aberto && (
        <Botao
          aparencia="discreto"
          centralizado
          rotulo="Cancelar"
          disabled={salvando}
          onPress={() => {
            setErro(null);
            setSenha("");
            setSenhaAtual("");
            setAberto(false);
          }}
        />
      )}
      {salva && (
        <View accessibilityLiveRegion="polite" style={estilos.confirmacao}>
          <Icone nome="check" tamanho={16} cor="marca" />
          <Texto cor="marca" style={estilos.flex}>
            Senha salva. Agora você pode entrar com seu @usuario, celular ou e-mail e a senha.
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
