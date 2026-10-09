import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { CampoTexto } from "@/components/ui/campo-texto";
import { Icone } from "@/components/ui/icone";
import { Aviso, Cartao } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { Espaco } from "@/constants/theme";
import { clienteAutenticacao } from "@/features/autenticacao/lib/cliente-autenticacao";
import { mensagemDoCodigo } from "@/features/autenticacao/lib/mensagens-codigo";
import { buscarSituacaoEmail } from "../lib/api-perfil";
import { emailVisivel, prepararNovoEmail, somenteDigitosDoCodigo, textosDoEmail } from "../lib/email-da-conta";

type Passo = "ver" | "informar" | "codigo";

/**
 * E-MAIL da conta. Mostra o endereço real (nunca o técnico do cadastro por celular) e permite
 * cadastrar ou alterar — sempre com um código enviado ao endereço NOVO: só depois de confirmado o
 * e-mail da conta muda. São as mesmas rotas do Better Auth usadas pela API (`request-email-change` e
 * `change-email`); nenhuma regra mora aqui.
 *
 * A resposta do pedido é a mesma quer o endereço esteja livre, quer já seja de outra conta: neste
 * segundo caso nenhum código chega, e a confirmação simplesmente não acontece.
 */
export function FormularioEmail() {
  // undefined = ainda carregando.
  const [emailAtual, setEmailAtual] = useState<string | null | undefined>(undefined);
  const [disponivel, setDisponivel] = useState(false);
  const [passo, setPasso] = useState<Passo>("ver");
  const [novoEmail, setNovoEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let ativo = true;
    void buscarSituacaoEmail().then((resposta) => {
      if (!ativo) return;
      if (resposta.ok) {
        setEmailAtual(emailVisivel(resposta.dados.email));
        setDisponivel(resposta.dados.disponivel);
      } else {
        setEmailAtual(null);
        setErro(resposta.mensagem);
      }
    });
    return () => {
      ativo = false;
    };
  }, []);

  const textos = textosDoEmail(emailAtual ?? null);
  const preparado = prepararNovoEmail(novoEmail, emailAtual ?? null);

  async function executar(acao: () => Promise<void>) {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      await acao();
    } catch {
      setErro(mensagemDoCodigo(null));
    } finally {
      setOcupado(false);
    }
  }

  function comecar() {
    setSalvo(false);
    setErro(null);
    setNovoEmail("");
    setCodigo("");
    setPasso("informar");
  }

  function cancelar() {
    setErro(null);
    setNovoEmail("");
    setCodigo("");
    setPasso("ver");
  }

  const pedirCodigo = () =>
    void executar(async () => {
      if (!preparado.ok) return;
      const { error } = await clienteAutenticacao.emailOtp.requestEmailChange({ newEmail: preparado.email });
      if (error) {
        setErro(mensagemDoCodigo(error));
        return;
      }
      setCodigo("");
      setPasso("codigo");
    });

  const confirmar = () =>
    void executar(async () => {
      if (!preparado.ok) return;
      const { error } = await clienteAutenticacao.emailOtp.changeEmail({ newEmail: preparado.email, otp: codigo });
      if (error) {
        setErro(mensagemDoCodigo(error));
        return;
      }
      // O que vale é o que o servidor gravou: a tela relê o e-mail da conta.
      const situacao = await buscarSituacaoEmail();
      setEmailAtual(situacao.ok ? emailVisivel(situacao.dados.email) : emailVisivel(preparado.email));
      setNovoEmail("");
      setCodigo("");
      setPasso("ver");
      setSalvo(true);
    });

  return (
    <Cartao style={estilos.cartao}>
      <View>
        <Texto variante="pequeno" cor="conteudoSuave">
          E-mail
        </Texto>
        <Texto cor={emailAtual ? "conteudo" : "conteudoSuave"}>{emailAtual === undefined ? "Carregando…" : textos.valor}</Texto>
      </View>

      {passo === "ver" && emailAtual !== undefined && disponivel && <Botao aparencia="secundario" rotulo={textos.acao} onPress={comecar} />}
      {passo === "ver" && emailAtual !== undefined && !disponivel && (
        <Texto variante="pequeno" cor="conteudoSuave">
          No momento não é possível cadastrar ou alterar o e-mail.
        </Texto>
      )}

      {passo === "informar" && (
        <>
          <CampoTexto
            rotulo={textos.campo}
            value={novoEmail}
            onChangeText={setNovoEmail}
            placeholder="voce@exemplo.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            dica="Enviamos um código de 6 números para este endereço. O e-mail só muda depois de você confirmar."
          />
          {!preparado.ok && preparado.mensagem && <Aviso tom="erro">{preparado.mensagem}</Aviso>}
          <Botao rotulo="Enviar código" carregando={ocupado} textoCarregando="Enviando…" disabled={ocupado || !preparado.ok} onPress={pedirCodigo} />
          <Botao aparencia="discreto" centralizado rotulo="Cancelar" disabled={ocupado} onPress={cancelar} />
        </>
      )}

      {passo === "codigo" && preparado.ok && (
        <>
          <Texto cor="conteudoSuave">Se o endereço puder ser usado, enviamos um código para {preparado.email}. Ele vale por 5 minutos.</Texto>
          <CampoTexto rotulo="Código" value={codigo} onChangeText={(texto) => setCodigo(somenteDigitosDoCodigo(texto))} placeholder="000000" keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} />
          <Botao rotulo="Confirmar e-mail" carregando={ocupado} textoCarregando="Confirmando…" disabled={ocupado || codigo.length !== 6} onPress={confirmar} />
          <Botao aparencia="discreto" centralizado rotulo="Trocar endereço" disabled={ocupado} onPress={() => setPasso("informar")} />
          <Botao aparencia="discreto" centralizado rotulo="Cancelar" disabled={ocupado} onPress={cancelar} />
        </>
      )}

      {salvo && passo === "ver" && (
        <View accessibilityLiveRegion="polite" style={estilos.confirmacao}>
          <Icone nome="check" tamanho={16} cor="marca" />
          <Texto cor="marca" style={estilos.flex}>
            E-mail confirmado. Agora você também pode entrar com ele.
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
