import { TAMANHO_PIN, somenteDigitosDoPin } from "@jaa/contratos";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { CampoTexto } from "@/components/ui/campo-texto";
import { Aviso } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco } from "@/constants/theme";
import { clienteAutenticacao, entrarComSenha } from "../lib/cliente-autenticacao";
import { buscarMetodosDeEntrada, concluirCadastro, type ContaMobile } from "../lib/api-conta";
import { MENSAGENS_BIOMETRIA, entradaInicial } from "../lib/biometria";
import { biometria } from "../lib/biometria-dispositivo";
import { mensagemDoCodigo } from "../lib/mensagens-codigo";
import { criarPin, dispositivoTemPin, entrarComPin, removerPin, situacaoDoDispositivo, usarContaNoAparelho } from "../lib/pin-dispositivo";

type Etapa = "senha" | "escolherCanal" | "telefone" | "email" | "codigo" | "cadastro" | "pin" | "criarPin" | "biometria" | "ativarBiometria";

// O que a pessoa escolheu na primeira tela. Só muda o TÍTULO das etapas seguintes: o código, recebido
// no canal escolhido, é o mesmo — cria a conta de quem é novo e entra na de quem já tem.
type Proposito = "codigo" | "criar";
const TITULO_DO_PROPOSITO: Record<Proposito, string> = { codigo: "Entrar com código", criar: "Criar conta" };

// Título e frase de apoio de cada etapa: dizem onde a pessoa está e o que fazer, em uma linha cada.
// A PRIMEIRA tela (senha) não tem título nem frase: logo, campos e três ações bastam. Nas etapas do
// código, o título vem do que a pessoa escolheu (`TITULO_DO_PROPOSITO`).
const TEXTOS: Record<Etapa, { titulo: string | null; apoio: string | null }> = {
  senha: { titulo: null, apoio: null },
  escolherCanal: { titulo: null, apoio: "Onde você quer receber o código?" },
  telefone: { titulo: null, apoio: "Informe o seu celular." },
  email: { titulo: null, apoio: "Informe o seu e-mail." },
  codigo: { titulo: "Código de verificação", apoio: "Digite o código de 6 dígitos que enviamos." },
  cadastro: { titulo: "Complete seu cadastro", apoio: "Falta pouco: diga como você aparece no Jaaa." },
  pin: { titulo: "Entrar com PIN", apoio: "Digite o PIN de 6 números que você criou neste aparelho." },
  criarPin: { titulo: "Criar PIN", apoio: "Com um PIN de 6 números você entra neste aparelho sem precisar de um novo código. Ele só vale aqui." },
  biometria: { titulo: "Entrar com biometria", apoio: "Use a biometria deste aparelho para entrar." },
  ativarBiometria: { titulo: "Ativar biometria", apoio: "Entre mais rápido neste aparelho usando a biometria do sistema. O PIN continua valendo." },
};

/**
 * PRIMEIRA TELA, limpa: Usuário, Senha, [Entrar], "ou", [Entrar com código], [Criar conta] — sem
 * título, sem frase e sem nada técnico. As duas ações secundárias abrem UMA etapa de escolha do canal
 * (SMS/Celular ou E-mail) e seguem pelos MESMOS fluxos de código de sempre; sem e-mail ligado no
 * servidor, a escolha é pulada e vai direto ao celular.
 *
 * LOGIN do Mobile, exatamente como no Web — mesma conta, mesma identidade pessoal, mesmos vínculos:
 * - celular, e-mail ou @usuario + SENHA (`POST /autenticacao/entrar`), o modo padrão;
 * - código recebido no CELULAR ou no E-MAIL (à escolha da pessoa), que é o cadastro e a alternativa de
 *   entrada. O e-mail só aparece quando o servidor o tem ligado (`/autenticacao/metodos`).
 * As duas formas criam a MESMA sessão do Better Auth, guardada no SecureStore. Nenhum cadastro paralelo.
 *
 * O código chega por SMS quando houver provedor; em desenvolvimento ele aparece no TERMINAL DA API
 * (OTP_ENTREGA=desenvolvimento), que é como o teste manual é feito hoje.
 *
 * PIN DO DISPOSITIVO: em aparelho que a pessoa já autorizou, a primeira tela é "Entrar com PIN", com
 * "Usar SMS ou e-mail" sempre à vista; depois de entrar com o código, a tela oferece criar o PIN (ou
 * "Agora não"). A credencial do aparelho fica no armazenamento seguro (`pin-dispositivo.ts`).
 *
 * BIOMETRIA (Android): em aparelho autorizado que a ativou, a entrada começa por ela —
 * BIOMETRIA → PIN → SMS ou e-mail, sempre com as alternativas à vista. Se a pessoa cancelar, não for
 * reconhecida ou a biometria do aparelho mudar, a tela fica no PIN; o código só é pedido quando ELA
 * escolhe. Depois de criar o PIN (ou de entrar com ele), a tela oferece "Ativar biometria" ou "Agora
 * não". Quem confere a digital/rosto é o sistema; o Jaaa nunca vê dado biométrico (`biometria.ts`).
 *
 * VÁRIAS CONTAS NO MESMO APARELHO: PIN e biometria são de cada conta (`cofre-dispositivo.ts`). A tela
 * oferece os da conta que entrou por último; para trocar de conta a pessoa usa "Usar SMS ou e-mail" (ou
 * a senha). Ao entrar, a conta passa a ser a do aparelho — sem apagar nem revogar nada da anterior.
 *
 * `etapaInicial="cadastro"`: sessão válida de uma conta que ainda não tem identidade pessoal.
 */
export function FluxoLogin({ aoEntrar, etapaInicial = "senha" }: { aoEntrar: (conta: ContaMobile) => void; etapaInicial?: "senha" | "cadastro" }) {
  const [etapa, setEtapa] = useState<Etapa>(etapaInicial);
  const [identificador, setIdentificador] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [telefone, setTelefone] = useState("");
  const [proposito, setProposito] = useState<Proposito>("codigo");
  const [email, setEmail] = useState("");
  // Canal do código em andamento: decide para onde a confirmação vai e para onde "trocar" volta.
  const [canal, setCanal] = useState<"telefone" | "email">("telefone");
  const [emailDisponivel, setEmailDisponivel] = useState(false);
  // PIN: o que a pessoa digita vive só nestes campos e é apagado assim que é usado.
  const [pin, setPin] = useState("");
  const [confirmacaoPin, setConfirmacaoPin] = useState("");
  const [pinDisponivel, setPinDisponivel] = useState(false);
  // Entrou pelo CÓDIGO nesta visita: é o momento em que o servidor aceita criar o PIN.
  const [entrouPorCodigo, setEntrouPorCodigo] = useState(false);
  const [contaPronta, setContaPronta] = useState<ContaMobile | null>(null);
  // Biometria ativa NESTE aparelho (servidor e aparelho de acordo).
  const [biometriaAtiva, setBiometriaAtiva] = useState(false);
  // O aviso do sistema abre sozinho só uma vez, ao chegar; depois é a pessoa quem toca.
  const avisoJaAberto = useRef(false);
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [usuario, setUsuario] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let ativo = true;
    void buscarMetodosDeEntrada().then((metodos) => {
      if (ativo) setEmailDisponivel(metodos.email);
    });
    return () => {
      ativo = false;
    };
  }, []);

  // Aparelho já autorizado: a entrada começa pelo PIN (sem código novo).
  useEffect(() => {
    if (etapaInicial !== "senha") return;
    let ativo = true;
    void (async () => {
      const situacao = await situacaoDoDispositivo();
      const noAparelho = situacao.autorizado && (await biometria.ativaNoAparelho());
      // Servidor e aparelho discordam (biometria desativada de um lado só): limpa o que sobrou aqui.
      if (situacao.autorizado && noAparelho && !situacao.biometria) await biometria.esquecerNoAparelho();
      if (!ativo || !situacao.autorizado) return;
      const comeco = entradaInicial({ autorizado: true, biometriaNoServidor: situacao.biometria, biometriaNoAparelho: noAparelho });
      setPinDisponivel(true);
      setBiometriaAtiva(comeco === "biometria");
      setEtapa((atual) => (atual === "senha" && comeco !== "codigo" ? comeco : atual));
    })();
    return () => {
      ativo = false;
    };
  }, [etapaInicial]);

  const emailLimpo = email.trim();

  /**
   * A conta ENTROU: ela passa a ser a deste aparelho (é dela o PIN/biometria que a próxima entrada
   * vai oferecer). Só então o app abre. Nada de outra conta é apagado ou revogado.
   */
  async function concluirEntrada(conta: ContaMobile) {
    await usarContaNoAparelho(conta.identidadePessoal?.id);
    aoEntrar(conta);
  }

  /**
   * Conta pronta e aparelho com PIN: oferece ATIVAR a biometria quando o aparelho a tem e ela ainda
   * não está ativa. `insistir`: logo depois de criar o PIN a oferta sempre aparece; depois de entrar
   * com o PIN, só se a pessoa não tiver dito "Agora não" antes.
   */
  async function abrirOferecendoBiometria(conta: ContaMobile, insistir: boolean) {
    const oferecer = biometria.aparelhoCompativel() && !(await biometria.ativaNoAparelho()) && (insistir || !(await biometria.ofertaRecusada()));
    if (!oferecer) {
      await concluirEntrada(conta);
      return;
    }
    setContaPronta(conta);
    setErro(null);
    setEtapa("ativarBiometria");
  }

  // Conta pronta para abrir: quem acabou de entrar com o código vê antes a oferta de criar o PIN.
  function abrir(conta: ContaMobile, peloCodigo: boolean) {
    if (!peloCodigo) {
      void concluirEntrada(conta);
      return;
    }
    // Entrou por código como ESTA conta: o PIN que ela criar agora vai para as chaves dela.
    void usarContaNoAparelho(conta.identidadePessoal?.id);
    setContaPronta(conta);
    setPin("");
    setConfirmacaoPin("");
    setEtapa("criarPin");
  }

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
        setErro(mensagemDoCodigo(error));
        return;
      }
      setCodigo("");
      setCanal("telefone");
      setEtapa("codigo");
    });

  // O mesmo pedido cria a conta ou entra: a resposta não diz qual dos dois é.
  const pedirCodigoPorEmail = () =>
    void executar(async () => {
      const { error } = await clienteAutenticacao.emailOtp.sendVerificationOtp({ email: emailLimpo, type: "sign-in" });
      if (error) {
        setErro(mensagemDoCodigo(error));
        return;
      }
      setCodigo("");
      setCanal("email");
      setEtapa("codigo");
    });

  const verificar = () =>
    void executar(async () => {
      const { error } =
        canal === "email"
          ? await clienteAutenticacao.signIn.emailOtp({ email: emailLimpo, otp: codigo.trim() })
          : await clienteAutenticacao.phoneNumber.verify({ phoneNumber: telefone, code: codigo.trim() });
      if (error) {
        setErro(mensagemDoCodigo(error));
        return;
      }
      // Conta nova (sem identidade pessoal) precisa completar o cadastro, como no Web.
      setEntrouPorCodigo(true);
      const conta = await concluirCadastro.buscar();
      if (conta && conta.cadastroCompleto) abrir(conta, true);
      else setEtapa("cadastro");
    });

  const entrarPeloPin = () =>
    void executar(async () => {
      const resultado = await entrarComPin(pin);
      // O PIN não fica em memória depois de usado, tenha dado certo ou não.
      setPin("");
      if (resultado.ok) {
        const conta = await concluirCadastro.buscar();
        if (conta && conta.cadastroCompleto) await abrirOferecendoBiometria(conta, false);
        else setEtapa("cadastro");
        return;
      }
      setErro(resultado.mensagem);
      // Depois de erros demais o servidor encerra a autorização: sem PIN, a entrada volta a ser o código.
      if (!resultado.bloqueado && !(await dispositivoTemPin())) {
        setPinDisponivel(false);
        setBiometriaAtiva(false);
        setEtapa("senha");
      }
    });

  /** A biometria do sistema libera o segredo do aparelho; o servidor confere e abre a sessão. */
  const entrarPelaBiometria = () =>
    void executar(async () => {
      const resultado = await biometria.entrar();
      if (resultado === "ok") {
        const conta = await concluirCadastro.buscar();
        if (conta && conta.cadastroCompleto) await concluirEntrada(conta);
        else setEtapa("cadastro");
        return;
      }
      if (resultado === "cancelada") {
        // Fica na mesma tela: "Usar PIN" está logo abaixo.
        setErro(MENSAGENS_BIOMETRIA.cancelada);
        return;
      }
      if (resultado === "sem-conexao") {
        setErro(MENSAGENS_BIOMETRIA.semConexao);
        return;
      }
      // Bloqueada pelo sistema, ou não existe mais neste aparelho: o caminho agora é o PIN.
      // Nunca o código: SMS/e-mail só saem quando a pessoa escolhe.
      if (resultado === "desativada") setBiometriaAtiva(false);
      setPin("");
      setEtapa("pin");
      setErro(resultado === "bloqueada" ? MENSAGENS_BIOMETRIA.bloqueada : MENSAGENS_BIOMETRIA.desativada);
    });

  // Aparelho que começa pela biometria: o aviso do sistema abre sozinho uma vez.
  useEffect(() => {
    if (etapa !== "biometria" || avisoJaAberto.current) return;
    avisoJaAberto.current = true;
    entrarPelaBiometria();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dispara só ao chegar na etapa
  }, [etapa]);

  const ativarBiometriaDoAparelho = () =>
    void executar(async () => {
      const resultado = await biometria.ativar();
      if (resultado === "ok") {
        setBiometriaAtiva(true);
        if (contaPronta) await concluirEntrada(contaPronta);
        return;
      }
      setErro(resultado === "sem-conexao" ? MENSAGENS_BIOMETRIA.semConexao : resultado === "indisponivel" ? MENSAGENS_BIOMETRIA.indisponivel : MENSAGENS_BIOMETRIA.naoAtivada);
    });

  const agoraNaoParaBiometria = () =>
    void executar(async () => {
      await biometria.recusarOferta();
      if (contaPronta) await concluirEntrada(contaPronta);
    });

  const criarPinDoAparelho = () =>
    void executar(async () => {
      if (pin !== confirmacaoPin) {
        setErro("Os dois PINs não são iguais.");
        return;
      }
      const contaId = contaPronta?.identidadePessoal?.id;
      if (!contaId) {
        setErro("Não foi possível concluir. Tente novamente.");
        return;
      }
      const resultado = await criarPin(contaId, pin, confirmacaoPin);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setPin("");
      setConfirmacaoPin("");
      setPinDisponivel(true);
      // PIN novo = autorização nova: a biometria anterior (se havia) não vale mais.
      setBiometriaAtiva(false);
      if (contaPronta) await abrirOferecendoBiometria(contaPronta, true);
    });

  const deixarDeUsarPin = () =>
    void executar(async () => {
      // Revoga o dispositivo no servidor e apaga a credencial E a biometria deste aparelho.
      await removerPin();
      setPin("");
      setPinDisponivel(false);
      setBiometriaAtiva(false);
      setEtapa("senha");
    });

  const criarIdentidade = () =>
    void executar(async () => {
      const resultado = await concluirCadastro.criar({ nomeExibicao: nome, nomeUsuario: usuario });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      const conta = await concluirCadastro.buscar();
      if (conta) abrir(conta, entrouPorCodigo);
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
      if (conta && conta.cadastroCompleto) await concluirEntrada(conta);
      else setEtapa("cadastro");
    });

  /**
   * "Entrar com código" / "Criar conta": a pessoa escolhe onde receber o código. Com um canal só
   * (e-mail desligado no servidor) não há o que escolher, e a tela vai direto ao celular.
   */
  function comecarComCodigo(novoProposito: Proposito) {
    setProposito(novoProposito);
    trocarModo(emailDisponivel ? "escolherCanal" : "telefone");
  }

  function trocarModo(proxima: "senha" | "escolherCanal" | "telefone" | "email" | "pin" | "biometria") {
    setErro(null);
    setSenha("");
    setPin("");
    setEtapa(proxima);
  }

  const textos = TEXTOS[etapa];
  const titulo = etapa === "escolherCanal" || etapa === "telefone" || etapa === "email" ? TITULO_DO_PROPOSITO[proposito] : textos.titulo;
  const apoio = etapa === "codigo" ? `Código enviado para ${canal === "email" ? emailLimpo : telefone}. Ele vale por 5 minutos.` : textos.apoio;

  return (
    <View style={estilos.container}>
      {(titulo || apoio) && (
        <View style={estilos.cabecalho}>
          {titulo && (
            <Texto variante="titulo" accessibilityRole="header">
              {titulo}
            </Texto>
          )}
          {apoio && <Texto cor="conteudoSuave">{apoio}</Texto>}
        </View>
      )}

      {etapa === "biometria" && (
        <>
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <Botao rotulo="Entrar com biometria" larguraTotal carregando={ocupado} onPress={entrarPelaBiometria} />
          <Divisor />
          <Botao aparencia="secundario" larguraTotal rotulo="Usar PIN" disabled={ocupado} onPress={() => trocarModo("pin")} />
          <Botao aparencia="discreto" centralizado rotulo="Usar SMS ou e-mail" disabled={ocupado} onPress={() => trocarModo("senha")} />
        </>
      )}

      {etapa === "ativarBiometria" && (
        <>
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <Botao rotulo="Ativar biometria" larguraTotal carregando={ocupado} onPress={ativarBiometriaDoAparelho} />
          <Botao aparencia="discreto" centralizado rotulo="Agora não" disabled={ocupado} onPress={agoraNaoParaBiometria} />
        </>
      )}

      {etapa === "pin" && (
        <>
          <CampoTexto
            rotulo="PIN"
            value={pin}
            onChangeText={(texto) => setPin(somenteDigitosDoPin(texto))}
            placeholder="000000"
            keyboardType="number-pad"
            secureTextEntry
            maxLength={TAMANHO_PIN}
            autoComplete="off"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => {
              if (!ocupado && pin.length === TAMANHO_PIN) entrarPeloPin();
            }}
          />
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <Botao rotulo="Entrar com PIN" larguraTotal carregando={ocupado} disabled={pin.length !== TAMANHO_PIN} onPress={entrarPeloPin} />
          <Divisor />
          {biometriaAtiva && <Botao aparencia="secundario" larguraTotal rotulo="Entrar com biometria" disabled={ocupado} onPress={() => trocarModo("biometria")} />}
          <Botao aparencia="secundario" larguraTotal rotulo="Usar SMS ou e-mail" disabled={ocupado} onPress={() => trocarModo("senha")} />
          <Botao aparencia="discreto" centralizado rotulo="Não usar mais PIN neste aparelho" disabled={ocupado} onPress={deixarDeUsarPin} />
        </>
      )}

      {etapa === "criarPin" && (
        <>
          <View style={estilos.campos}>
            <CampoTexto
              rotulo="PIN"
              value={pin}
              onChangeText={(texto) => setPin(somenteDigitosDoPin(texto))}
              placeholder="000000"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={TAMANHO_PIN}
              autoComplete="off"
              autoCorrect={false}
            />
            <CampoTexto
              rotulo="Confirmar PIN"
              value={confirmacaoPin}
              onChangeText={(texto) => setConfirmacaoPin(somenteDigitosDoPin(texto))}
              placeholder="000000"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={TAMANHO_PIN}
              autoComplete="off"
              autoCorrect={false}
            />
          </View>
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <Botao rotulo="Criar PIN" larguraTotal carregando={ocupado} disabled={pin.length !== TAMANHO_PIN || confirmacaoPin.length !== TAMANHO_PIN} onPress={criarPinDoAparelho} />
          <Botao aparencia="discreto" centralizado rotulo="Agora não" disabled={ocupado} onPress={() => contaPronta && void concluirEntrada(contaPronta)} />
        </>
      )}

      {etapa === "escolherCanal" && (
        <>
          <Botao aparencia="secundario" larguraTotal rotulo={proposito === "criar" ? "Celular" : "SMS"} disabled={ocupado} onPress={() => trocarModo("telefone")} />
          <Botao aparencia="secundario" larguraTotal rotulo="E-mail" disabled={ocupado} onPress={() => trocarModo("email")} />
          <Botao aparencia="discreto" centralizado rotulo="Voltar" disabled={ocupado} onPress={() => trocarModo("senha")} />
        </>
      )}

      {etapa === "senha" && (
        <>
          <View style={estilos.campos}>
            <CampoTexto
              rotulo="Usuário"
              value={identificador}
              onChangeText={setIdentificador}
              placeholder="@usuario, celular ou e-mail"
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
              // O olho dentro do campo: aberto = tocar mostra; fechado = a senha está à vista, tocar oculta.
              acao={{ icone: mostrarSenha ? "olhoFechado" : "olho", rotulo: mostrarSenha ? "Ocultar senha" : "Mostrar senha", ativa: mostrarSenha, aoTocar: () => setMostrarSenha((atual) => !atual) }}
            />
          </View>
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <Botao rotulo="Entrar" larguraTotal carregando={ocupado} disabled={identificador.trim() === "" || senha === ""} onPress={entrar} />
          <Divisor />
          <Botao aparencia="secundario" larguraTotal rotulo="Entrar com código" disabled={ocupado} onPress={() => comecarComCodigo("codigo")} />
          <Botao aparencia="secundario" larguraTotal rotulo="Criar conta" disabled={ocupado} onPress={() => comecarComCodigo("criar")} />
          {/* Só em aparelho já autorizado, para quem veio de "Usar SMS ou e-mail": o caminho de volta. */}
          {(biometriaAtiva || pinDisponivel) && (
            <Botao aparencia="discreto" centralizado rotulo={biometriaAtiva ? "Entrar com biometria" : "Entrar com PIN"} disabled={ocupado} onPress={() => trocarModo(biometriaAtiva ? "biometria" : "pin")} />
          )}
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
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <Botao rotulo="Continuar" larguraTotal carregando={ocupado} disabled={telefone.trim().length < 10} onPress={pedirCodigo} />
          {emailDisponivel && <Divisor />}
          {emailDisponivel && <Botao aparencia="secundario" larguraTotal rotulo="Usar e-mail" disabled={ocupado} onPress={() => trocarModo("email")} />}
          <Botao aparencia="discreto" centralizado rotulo="Voltar" disabled={ocupado} onPress={() => trocarModo("senha")} />
        </>
      )}

      {etapa === "email" && (
        <>
          <CampoTexto
            rotulo="E-mail"
            value={email}
            onChangeText={setEmail}
            placeholder="voce@exemplo.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            dica="Enviamos um código para confirmar que o endereço é seu."
          />
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <Botao rotulo="Continuar" larguraTotal carregando={ocupado} disabled={!emailLimpo.includes("@") || emailLimpo.length < 5} onPress={pedirCodigoPorEmail} />
          <Divisor />
          <Botao aparencia="secundario" larguraTotal rotulo="Usar telefone" disabled={ocupado} onPress={() => trocarModo("telefone")} />
          <Botao aparencia="discreto" centralizado rotulo="Voltar" disabled={ocupado} onPress={() => trocarModo("senha")} />
        </>
      )}

      {etapa === "codigo" && (
        <>
          {canal === "email" ? (
            <CampoTexto rotulo="Código" value={codigo} onChangeText={setCodigo} placeholder="000000" keyboardType="number-pad" autoComplete="one-time-code" />
          ) : (
            <CampoTexto rotulo="Código" value={codigo} onChangeText={setCodigo} placeholder="000000" keyboardType="number-pad" autoComplete="sms-otp" />
          )}
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <Botao rotulo="Verificar" larguraTotal carregando={ocupado} disabled={codigo.trim().length < 6} onPress={verificar} />
          <Botao aparencia="discreto" centralizado rotulo={canal === "email" ? "Trocar e-mail" : "Trocar número"} disabled={ocupado} onPress={() => trocarModo(canal)} />
        </>
      )}

      {etapa === "cadastro" && (
        <>
          <View style={estilos.campos}>
            <CampoTexto rotulo="Seu nome" value={nome} onChangeText={setNome} placeholder="Como as pessoas veem você" />
            <CampoTexto
              rotulo="Nome de usuário"
              value={usuario}
              onChangeText={setUsuario}
              placeholder="@usuario"
              autoCapitalize="none"
              autoCorrect={false}
              dica="É assim que as pessoas encontram você no Jaaa."
            />
          </View>
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <Botao rotulo="Concluir cadastro" larguraTotal carregando={ocupado} disabled={nome.trim() === "" || usuario.trim() === ""} onPress={criarIdentidade} />
        </>
      )}
    </View>
  );
}

/** "ou" entre a ação principal e a alternativa: separa sem criar outra caixa. */
function Divisor() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={estilos.divisor}>
      <View style={estilos.linha} />
      <Texto variante="pequeno" cor="conteudoSuave">
        ou
      </Texto>
      <View style={estilos.linha} />
    </View>
  );
}

const estilos = StyleSheet.create({
  container: { gap: Espaco.quatro },
  cabecalho: { gap: Espaco.um },
  campos: { gap: Espaco.tres },
  divisor: { alignItems: "center", flexDirection: "row", gap: Espaco.tres },
  linha: { backgroundColor: Cores.borda, flex: 1, height: StyleSheet.hairlineWidth },
});
