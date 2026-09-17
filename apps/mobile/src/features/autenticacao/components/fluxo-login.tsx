import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { clienteAutenticacao } from "../lib/cliente-autenticacao";
import { concluirCadastro, type ContaMobile } from "../lib/api-conta";

/**
 * LOGIN do Mobile: celular + código (OTP), exatamente como no Web — mesma conta, mesma identidade
 * pessoal, mesmos vínculos. Nenhuma senha e nenhum cadastro paralelo.
 *
 * O código chega por SMS quando houver provedor; em desenvolvimento ele aparece no TERMINAL DA API
 * (OTP_ENTREGA=desenvolvimento), que é como o teste manual é feito hoje.
 */
export function FluxoLogin({ aoEntrar }: { aoEntrar: (conta: ContaMobile) => void }) {
  const [etapa, setEtapa] = useState<"telefone" | "codigo" | "cadastro">("telefone");
  const [telefone, setTelefone] = useState("");
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [usuario, setUsuario] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function executar(acao: () => Promise<void>) {
    setOcupado(true);
    setErro(null);
    try {
      await acao();
    } finally {
      setOcupado(false);
    }
  }

  const pedirCodigo = () =>
    void executar(async () => {
      const { error } = await clienteAutenticacao.phoneNumber.sendOtp({ phoneNumber: telefone });
      if (error) {
        setErro(error.message ?? "Não foi possível enviar o código.");
        return;
      }
      setEtapa("codigo");
    });

  const verificar = () =>
    void executar(async () => {
      const { error } = await clienteAutenticacao.phoneNumber.verify({ phoneNumber: telefone, code: codigo });
      if (error) {
        setErro(error.message ?? "Código inválido.");
        return;
      }
      // Conta nova (sem identidade pessoal) precisa completar o cadastro, como no Web.
      const conta = await concluirCadastro.buscar();
      if (conta && conta.cadastroCompleto) aoEntrar(conta);
      else setEtapa("cadastro");
    });

  const criarIdentidade = () =>
    void executar(async () => {
      const resultado = await concluirCadastro.criar({ nomeExibicao: nome, nomeUsuario: usuario });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      const conta = await concluirCadastro.buscar();
      if (conta) aoEntrar(conta);
    });

  return (
    <View style={estilos.container}>
      <ThemedText type="title">Entrar no Jaa</ThemedText>

      {etapa === "telefone" && (
        <>
          <ThemedText type="small">Celular com DDD</ThemedText>
          <TextInput
            style={estilos.campo}
            value={telefone}
            onChangeText={setTelefone}
            placeholder="(31) 98765-4321"
            keyboardType="phone-pad"
            autoComplete="tel"
          />
          <Botao rotulo="Continuar" aoTocar={pedirCodigo} desabilitado={ocupado || telefone.trim().length < 10} />
        </>
      )}

      {etapa === "codigo" && (
        <>
          <ThemedText type="small">Código enviado para {telefone}</ThemedText>
          <TextInput style={estilos.campo} value={codigo} onChangeText={setCodigo} placeholder="000000" keyboardType="number-pad" autoComplete="sms-otp" />
          <Botao rotulo="Verificar" aoTocar={verificar} desabilitado={ocupado || codigo.trim().length < 6} />
          <Pressable accessibilityRole="button" onPress={() => setEtapa("telefone")}>
            <ThemedText type="link">Trocar número</ThemedText>
          </Pressable>
        </>
      )}

      {etapa === "cadastro" && (
        <>
          <ThemedText type="small">Complete seu cadastro</ThemedText>
          <TextInput style={estilos.campo} value={nome} onChangeText={setNome} placeholder="Seu nome" />
          <TextInput style={estilos.campo} value={usuario} onChangeText={setUsuario} placeholder="@usuario" autoCapitalize="none" />
          <Botao rotulo="Concluir cadastro" aoTocar={criarIdentidade} desabilitado={ocupado || nome.trim() === "" || usuario.trim() === ""} />
        </>
      )}

      {erro && <ThemedText type="small">{erro}</ThemedText>}
    </View>
  );
}

function Botao({ rotulo, aoTocar, desabilitado }: { rotulo: string; aoTocar: () => void; desabilitado: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={desabilitado} onPress={aoTocar} style={[estilos.botao, desabilitado && estilos.botaoDesabilitado]}>
      <ThemedText type="smallBold">{rotulo}</ThemedText>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  container: { gap: 10 },
  campo: { borderColor: "#a1a1aa", borderRadius: 8, borderWidth: 1, color: "#111", paddingHorizontal: 12, paddingVertical: 10 },
  botao: { alignSelf: "flex-start", borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  botaoDesabilitado: { opacity: 0.5 },
});
