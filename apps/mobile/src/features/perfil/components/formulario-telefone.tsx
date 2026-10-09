import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { CampoTexto } from "@/components/ui/campo-texto";
import { Icone } from "@/components/ui/icone";
import { Aviso, Cartao } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { Espaco } from "@/constants/theme";
import { buscarSituacaoTelefone, confirmarTelefone, pedirCodigoTelefone } from "../lib/api-telefone";
import { somenteDigitosDoCodigo } from "../lib/email-da-conta";
import { formatarCelularDigitado, prepararNovoTelefone, textosDoTelefone } from "../lib/telefone-da-conta";

type Passo = "ver" | "informar" | "codigo";

/**
 * TELEFONE da conta. Mostra o número e permite cadastrar ou alterar — sempre com um código enviado por
 * SMS ao número NOVO: só depois de confirmado o telefone da conta muda. Número que já é de outra conta
 * é recusado pelo servidor ANTES de qualquer SMS. O e-mail não participa deste fluxo.
 *
 * É dado de CONTA: nada aqui lê ou altera a preferência de privacidade "deixar que me encontrem pelo
 * meu celular". Fechado, o cartão mostra só o número e UMA ação.
 */
export function FormularioTelefone() {
  // undefined = ainda carregando.
  const [telefoneAtual, setTelefoneAtual] = useState<string | null | undefined>(undefined);
  const [passo, setPasso] = useState<Passo>("ver");
  const [novoTelefone, setNovoTelefone] = useState("");
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let ativo = true;
    void buscarSituacaoTelefone().then((resposta) => {
      if (!ativo) return;
      if (resposta.ok) setTelefoneAtual(resposta.dados.telefone);
      else {
        setTelefoneAtual(null);
        setErro(resposta.mensagem);
      }
    });
    return () => {
      ativo = false;
    };
  }, []);

  const textos = textosDoTelefone(telefoneAtual ?? null);
  const preparado = prepararNovoTelefone(novoTelefone, telefoneAtual ?? null);

  async function executar(acao: () => Promise<void>) {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      await acao();
    } finally {
      setOcupado(false);
    }
  }

  function comecar() {
    setSalvo(false);
    setErro(null);
    setNovoTelefone("");
    setCodigo("");
    setPasso("informar");
  }

  function cancelar() {
    setErro(null);
    setNovoTelefone("");
    setCodigo("");
    setPasso("ver");
  }

  const pedirCodigo = () =>
    void executar(async () => {
      if (!preparado.ok) return;
      // O servidor confere o número (inclusive se já é de outra conta) ANTES de enviar o SMS.
      const resposta = await pedirCodigoTelefone(preparado.telefone);
      if (!resposta.ok) {
        setErro(resposta.mensagem);
        return;
      }
      setCodigo("");
      setPasso("codigo");
    });

  const confirmar = () =>
    void executar(async () => {
      if (!preparado.ok) return;
      const resposta = await confirmarTelefone(preparado.telefone, codigo);
      if (!resposta.ok) {
        setErro(resposta.mensagem);
        return;
      }
      // O que vale é o que o servidor gravou.
      setTelefoneAtual(resposta.dados.telefone);
      setNovoTelefone("");
      setCodigo("");
      setPasso("ver");
      setSalvo(true);
    });

  return (
    <Cartao style={estilos.cartao}>
      <View>
        <Texto variante="pequeno" cor="conteudoSuave">
          Telefone
        </Texto>
        <Texto cor={telefoneAtual ? "conteudo" : "conteudoSuave"}>{telefoneAtual === undefined ? "Carregando…" : textos.valor}</Texto>
      </View>

      {passo === "ver" && telefoneAtual !== undefined && <Botao aparencia="secundario" rotulo={textos.acao} onPress={comecar} />}

      {passo === "informar" && (
        <>
          <CampoTexto
            rotulo={textos.campo}
            value={novoTelefone}
            onChangeText={(texto) => setNovoTelefone(formatarCelularDigitado(texto))}
            placeholder="(00) 00000-0000"
            keyboardType="phone-pad"
            autoComplete="tel"
            maxLength={15}
            dica="Enviamos um código por SMS para este número. O telefone só muda depois de você confirmar."
          />
          {!preparado.ok && preparado.mensagem && <Aviso tom="erro">{preparado.mensagem}</Aviso>}
          <Botao rotulo="Enviar código" carregando={ocupado} textoCarregando="Enviando…" disabled={ocupado || !preparado.ok} onPress={pedirCodigo} />
          <Botao aparencia="discreto" centralizado rotulo="Cancelar" disabled={ocupado} onPress={cancelar} />
        </>
      )}

      {passo === "codigo" && preparado.ok && (
        <>
          <Texto cor="conteudoSuave">Enviamos um código de 6 números por SMS para {novoTelefone}. Ele vale por 5 minutos.</Texto>
          <CampoTexto rotulo="Código" value={codigo} onChangeText={(texto) => setCodigo(somenteDigitosDoCodigo(texto))} placeholder="000000" keyboardType="number-pad" autoComplete="sms-otp" maxLength={6} />
          <Botao rotulo="Confirmar telefone" carregando={ocupado} textoCarregando="Confirmando…" disabled={ocupado || codigo.length !== 6} onPress={confirmar} />
          <Botao aparencia="discreto" centralizado rotulo="Trocar número" disabled={ocupado} onPress={() => setPasso("informar")} />
          <Botao aparencia="discreto" centralizado rotulo="Cancelar" disabled={ocupado} onPress={cancelar} />
        </>
      )}

      {salvo && passo === "ver" && (
        <View accessibilityLiveRegion="polite" style={estilos.confirmacao}>
          <Icone nome="check" tamanho={16} cor="marca" />
          <Texto cor="marca" style={estilos.flex}>
            Telefone confirmado.
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
