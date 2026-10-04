import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { CampoTexto } from "@/components/ui/campo-texto";
import { Aviso } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { Espaco } from "@/constants/theme";
import { URL_API } from "@/lib/configuracao";
import { clienteAutenticacao, entrarComSenha } from "../lib/cliente-autenticacao";
import { concluirCadastro, type ContaMobile } from "../lib/api-conta";

type Etapa = "senha" | "telefone" | "codigo" | "cadastro";

const TITULOS: Record<Etapa, string> = {
  senha: "Entrar",
  telefone: "Entrar com código",
  codigo: "Código de verificação",
  cadastro: "Complete seu cadastro",
};

/**
 * LOGIN do Mobile, exatamente como no Web — mesma conta, mesma identidade pessoal, mesmos vínculos:
 * - celular ou @usuario + SENHA (`POST /autenticacao/entrar`), o modo padrão;
 * - celular + código (OTP), que continua sendo cadastro e alternativa de entrada.
 * As duas formas criam a MESMA sessão do Better Auth, guardada no SecureStore. Nenhum cadastro paralelo.
 *
 * O código chega por SMS quando houver provedor; em desenvolvimento ele aparece no TERMINAL DA API
 * (OTP_ENTREGA=desenvolvimento), que é como o teste manual é feito hoje.
 *
 * `etapaInicial="cadastro"`: sessão válida de uma conta que ainda não tem identidade pessoal.
 */
export function FluxoLogin({ aoEntrar, etapaInicial = "senha" }: { aoEntrar: (conta: ContaMobile) => void; etapaInicial?: "senha" | "cadastro" }) {
  const [etapa, setEtapa] = useState<Etapa>(etapaInicial);
  const [identificador, setIdentificador] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
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

  const entrar = () =>
    void executar(async () => {
      const resultado = await entrarComSenha(identificador, senha);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      // A senha não fica em memória depois de usada.
      setSenha("");
      const conta = await concluirCadastro.buscar();
      if (conta && conta.cadastroCompleto) aoEntrar(conta);
      else setEtapa("cadastro");
    });

  function trocarModo(proxima: "senha" | "telefone") {
    setErro(null);
    setSenha("");
    setEtapa(proxima);
  }

  return (
    <View style={estilos.container}>
      <Texto variante="subtitulo" accessibilityRole="header">
        {TITULOS[etapa]}
      </Texto>

      {etapa === "senha" && (
        <>
          <CampoTexto
            rotulo="Usuário"
            value={identificador}
            onChangeText={setIdentificador}
            placeholder="@usuario ou celular"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            returnKeyType="next"
          />
          <CampoTexto
            rotulo="Senha"
            value={senha}
            onChangeText={setSenha}
            placeholder="Sua senha"
            secureTextEntry={!mostrarSenha}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            returnKeyType="go"
            onSubmitEditing={() => {
              if (!ocupado && identificador.trim() !== "" && senha !== "") entrar();
            }}
          />
          <Botao aparencia="discreto" rotulo={mostrarSenha ? "Ocultar senha" : "Mostrar senha"} onPress={() => setMostrarSenha((atual) => !atual)} />
          <Botao rotulo="Entrar" larguraTotal carregando={ocupado} disabled={identificador.trim() === "" || senha === ""} onPress={entrar} />
          <Botao aparencia="secundario" larguraTotal rotulo="Entrar com celular (código por SMS)" disabled={ocupado} onPress={() => trocarModo("telefone")} />
        </>
      )}

      {etapa === "telefone" && (
        <>
          <CampoTexto
            rotulo="Celular com DDD"
            value={telefone}
            onChangeText={setTelefone}
            placeholder="(31) 98765-4321"
            keyboardType="phone-pad"
            autoComplete="tel"
            dica="Enviamos um código para confirmar que o número é seu."
          />
          <Botao rotulo="Continuar" larguraTotal carregando={ocupado} disabled={telefone.trim().length < 10} onPress={pedirCodigo} />
          <Botao aparencia="secundario" larguraTotal rotulo="Entrar com usuário e senha" disabled={ocupado} onPress={() => trocarModo("senha")} />
        </>
      )}

      {etapa === "codigo" && (
        <>
          <Texto variante="pequeno" cor="conteudoSuave">
            Código enviado para {telefone}
          </Texto>
          <CampoTexto rotulo="Código" value={codigo} onChangeText={setCodigo} placeholder="000000" keyboardType="number-pad" autoComplete="sms-otp" />
          <Botao rotulo="Verificar" larguraTotal carregando={ocupado} disabled={codigo.trim().length < 6} onPress={verificar} />
          <Botao aparencia="discreto" rotulo="Trocar número" disabled={ocupado} onPress={() => setEtapa("telefone")} />
        </>
      )}

      {etapa === "cadastro" && (
        <>
          <CampoTexto rotulo="Seu nome" value={nome} onChangeText={setNome} placeholder="Como as pessoas veem você" />
          <CampoTexto
            rotulo="Nome de usuário"
            value={usuario}
            onChangeText={setUsuario}
            placeholder="@usuario"
            autoCapitalize="none"
            autoCorrect={false}
            dica="É assim que as pessoas encontram você no Jaa."
          />
          <Botao rotulo="Concluir cadastro" larguraTotal carregando={ocupado} disabled={nome.trim() === "" || usuario.trim() === ""} onPress={criarIdentidade} />
        </>
      )}

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {/* Apoio de desenvolvimento: para qual servidor o app está falando. */}
      {__DEV__ && (
        <Texto variante="pequeno" cor="conteudoSuave">
          Servidor: {URL_API}
        </Texto>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({ container: { gap: Espaco.tres } });
