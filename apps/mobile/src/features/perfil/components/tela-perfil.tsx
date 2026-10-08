import { ROTULO_STATUS, ROTULO_VISIBILIDADE, perfilFoiAlterado, statusEscolhidoSchema, visibilidadePerfilSchema, type MeuPerfil, type StatusEscolhido, type VisibilidadePerfil } from "@jaa/contratos";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from "react-native";
import { AvatarIdentidade } from "@/components/ui/avatar";
import { Botao } from "@/components/ui/botao";
import { CampoTexto } from "@/components/ui/campo-texto";
import { Icone } from "@/components/ui/icone";
import { MenuAcoes } from "@/components/ui/menu-acoes";
import { SobreApp } from "@/components/ui/sobre-app";
import { Aviso, Carregando, Cartao, Secao } from "@/components/ui/superficies";
import { Tela } from "@/components/ui/tela";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";
import { useContextoConta } from "@/features/conta/components/provedor-contexto-conta";
import { MinhasEmpresas } from "@/features/empresas/components/minhas-empresas";
import { TelaPerfilProfissional } from "@/features/profissional/components/tela-perfil-profissional";
import { buscarMeuPerfil, enviarFotoPerfil, removerFotoPerfil, salvarPerfil, salvarPrivacidade } from "../lib/api-perfil";
import { opcoesDaFoto, removerFotoDoPerfil, trocarFotoDoPerfil, type OrigemFoto, type ResultadoFoto } from "../lib/foto-perfil";
import { obterFoto, prepararFoto } from "../lib/seletor-foto";
import { FormularioSenha } from "./formulario-senha";
import { LinkPublico } from "./link-publico";

/*
 * PERFIL da identidade ATUANTE — pessoa ou empresa, a mesma tela da Web (`AreaPerfil`).
 *
 * Três blocos, na ordem em que as pessoas pensam: quem eu sou (foto, nome, frase), como estou (status
 * escolhido) e quem vê o quê (privacidade). Depois, o que é da CONTA e só existe para a pessoa: link
 * público, Perfil profissional (abre DENTRO de Perfil, como na Web), senha e Minhas empresas.
 */
export function TelaPerfil({ ehEmpresa }: { ehEmpresa: boolean }) {
  const router = useRouter();
  const [perfil, setPerfil] = useState<MeuPerfil | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // Confirmação e erro do bloco "Meu perfil", exibidos junto do botão Salvar (onde a pessoa está olhando).
  const [perfilSalvo, setPerfilSalvo] = useState(false);
  const [erroPerfil, setErroPerfil] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [frase, setFrase] = useState("");
  const [cidade, setCidade] = useState("");
  const [sobre, setSobre] = useState("");
  const { recarregar: recarregarContexto } = useContextoConta();
  const [menuFotoAberto, setMenuFotoAberto] = useState(false);
  const [fotoOcupada, setFotoOcupada] = useState<"enviando" | "removendo" | null>(null);
  // Perfil profissional abre DENTRO de Perfil (sem aba nova); só para a pessoa.
  const [profissionalAberto, setProfissionalAberto] = useState(false);

  function receber(dados: MeuPerfil) {
    setPerfil(dados);
    setNome(dados.nomeExibicao);
    setFrase(dados.fraseStatus ?? "");
    setCidade(dados.cidade ?? "");
    setSobre(dados.sobre ?? "");
  }

  useEffect(() => {
    let ativo = true;
    void buscarMeuPerfil().then((resposta) => {
      if (!ativo) return;
      if (resposta.ok) receber(resposta.dados);
      else setErro(resposta.mensagem);
    });
    return () => {
      ativo = false;
    };
  }, []);

  // Status e privacidade: atualiza só o que está salvo, sem desfazer o que a pessoa digita no perfil.
  function aplicar(resposta: Awaited<ReturnType<typeof salvarPerfil>>, mensagem: string) {
    if (resposta.ok) {
      setPerfil(resposta.dados);
      setErro(null);
      setAviso(mensagem);
    } else {
      setAviso(null);
      setErro(resposta.mensagem);
    }
  }

  async function enviarDados() {
    // Um envio por vez, e só quando algo mudou em relação ao que está salvo.
    if (salvando || !perfil || !perfilFoiAlterado(perfil, { nome, frase, cidade, sobre })) return;
    setSalvando(true);
    setPerfilSalvo(false);
    setErroPerfil(null);
    setAviso(null);
    setErro(null);
    try {
      const resposta = await salvarPerfil({ nomeExibicao: nome, fraseStatus: frase, cidade, sobre });
      if (!resposta.ok) {
        // Os campos continuam como a pessoa deixou: nada do que ela digitou se perde.
        setErroPerfil(resposta.mensagem);
        return;
      }
      // A resposta da API vira o novo "último estado salvo": o botão desabilita até a próxima edição.
      receber(resposta.dados);
      setPerfilSalvo(true);
      // Nome e demais dados da identidade no resto do app (topo, "Agindo como") vêm do contexto da conta.
      await recarregarContexto();
    } catch {
      setErroPerfil("Não foi possível salvar o perfil. Verifique a conexão e tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  // Voltar a editar tira a confirmação da tela: "Perfil salvo" só vale enquanto nada mudou.
  function editar(definir: (valor: string) => void) {
    return (valor: string) => {
      setPerfilSalvo(false);
      setErroPerfil(null);
      definir(valor);
    };
  }

  function mudarPrivacidade(entrada: Parameters<typeof salvarPrivacidade>[0]) {
    setSalvando(true);
    void salvarPrivacidade(entrada)
      .then((resposta) => aplicar(resposta, "Preferência salva."))
      .finally(() => setSalvando(false));
  }

  /*
   * Depois do SUCESSO na API: relê o perfil (foto desta tela) e o contexto da conta ("Agindo como" e
   * demais avatares da própria identidade). Antes disso nada muda na tela — se falhar, a foto anterior
   * continua.
   */
  async function aposAlterarFoto() {
    const atualizado = await buscarMeuPerfil();
    if (atualizado.ok) setPerfil(atualizado.dados);
    await recarregarContexto();
  }

  function mostrarResultadoFoto(resultado: ResultadoFoto) {
    // Cancelar a câmera ou a galeria não é erro: nada é dito.
    if (resultado.tipo === "cancelado") return;
    if (resultado.tipo === "concluido") {
      setErro(null);
      setAviso(resultado.mensagem);
    } else {
      setAviso(null);
      setErro(resultado.mensagem);
    }
  }

  function escolherFoto(origem: OrigemFoto) {
    if (fotoOcupada) return;
    setErro(null);
    setAviso(null);
    void trocarFotoDoPerfil(origem, {
      obter: async (qual) => {
        const obtida = await obterFoto(qual);
        // Só mostra "Enviando…" depois que a pessoa escolheu: enquanto a câmera está aberta, nada muda.
        if (obtida.tipo === "imagem") setFotoOcupada("enviando");
        return obtida;
      },
      preparar: prepararFoto,
      enviar: enviarFotoPerfil,
      aoConcluir: aposAlterarFoto,
    })
      .then(mostrarResultadoFoto)
      .catch(() => mostrarResultadoFoto({ tipo: "falha", mensagem: "Não foi possível abrir a câmera ou a galeria." }))
      .finally(() => setFotoOcupada(null));
  }

  function removerFoto() {
    if (fotoOcupada) return;
    setFotoOcupada("removendo");
    void removerFotoDoPerfil({ remover: removerFotoPerfil, aoConcluir: aposAlterarFoto })
      .then(mostrarResultadoFoto)
      .finally(() => setFotoOcupada(null));
  }

  if (profissionalAberto && !ehEmpresa) return <TelaPerfilProfissional aoVoltar={() => setProfissionalAberto(false)} />;

  if (!perfil) return <Tela>{erro ? <Aviso tom="erro">{erro}</Aviso> : <Carregando />}</Tela>;

  const alterado = perfilFoiAlterado(perfil, { nome, frase, cidade, sobre });
  const rotuloFoto = ehEmpresa ? "logo da empresa" : "foto";
  const acoesFoto = opcoesDaFoto(perfil.fotoUrl !== null).map((opcao) =>
    opcao === "camera"
      ? { rotulo: "Tirar foto", executar: () => escolherFoto("camera") }
      : opcao === "galeria"
        ? { rotulo: "Escolher da galeria", executar: () => escolherFoto("galeria") }
        : { rotulo: `Remover ${rotuloFoto}`, executar: removerFoto, perigosa: true },
  );

  return (
    <Tela>
      <Secao titulo={ehEmpresa ? "Perfil da empresa" : "Meu perfil"} descricao={ehEmpresa ? "É isto que seus clientes veem na conversa." : "É isto que as outras pessoas veem de você."}>
        <Cartao style={estilos.cartao}>
          <View style={estilos.foto}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={perfil.fotoUrl ? `Trocar ${rotuloFoto}` : `Adicionar ${rotuloFoto}`}
              accessibilityState={{ busy: fotoOcupada !== null, disabled: fotoOcupada !== null }}
              disabled={fotoOcupada !== null}
              onPress={() => setMenuFotoAberto(true)}
              style={({ pressed }) => [estilos.avatarTocavel, pressed && estilos.pressionado]}>
              <AvatarIdentidade identidade={perfil} fotoUrl={perfil.fotoUrl} tamanho="grande" />
              {fotoOcupada ? (
                <View style={estilos.avatarOcupado}>
                  <ActivityIndicator color={Cores.superficie} />
                </View>
              ) : (
                <View style={estilos.seloCamera}>
                  <Icone nome="camera" tamanho={14} cor="superficie" />
                </View>
              )}
            </Pressable>
            <Texto variante="pequeno" cor="conteudoSuave" style={estilos.flex} accessibilityLiveRegion="polite">
              {fotoOcupada === "enviando"
                ? "Enviando…"
                : fotoOcupada === "removendo"
                  ? "Removendo…"
                  : perfil.fotoUrl
                    ? `Toque na ${rotuloFoto} para trocar ou remover.`
                    : `Sem ${rotuloFoto}, aparecem suas iniciais. Toque para adicionar.`}
            </Texto>
          </View>
          <MenuAcoes titulo={ehEmpresa ? "Logo da empresa" : "Foto do perfil"} aberto={menuFotoAberto} aoFechar={() => setMenuFotoAberto(false)} acoes={acoesFoto} />
          <CampoTexto rotulo="Nome" value={nome} onChangeText={editar(setNome)} maxLength={50} autoComplete="name" />
          <CampoTexto rotulo="@usuario" value={`@${perfil.nomeUsuario}`} editable={false} style={estilos.somenteLeitura} dica="O @usuario é seu endereço no Jaaa e não muda por aqui." />
          <CampoTexto
            rotulo="Frase de status"
            value={frase}
            onChangeText={editar(setFrase)}
            maxLength={140}
            placeholder={ehEmpresa ? "Entregamos até 22h" : "Respondo à noite"}
            dica="Texto curto que aparece junto do seu nome. Opcional."
          />
          <CampoTexto rotulo="Cidade" value={cidade} onChangeText={editar(setCidade)} maxLength={80} placeholder="Belo Horizonte" dica="Opcional." />
          <CampoTexto rotulo={ehEmpresa ? "Sobre a empresa" : "Sobre você"} value={sobre} onChangeText={editar(setSobre)} maxLength={500} multiline style={estilos.textoLongo} dica="Opcional, até 500 caracteres." />
          <Botao rotulo="Salvar perfil" carregando={salvando} textoCarregando="Salvando…" disabled={salvando || !alterado || nome.trim() === ""} onPress={() => void enviarDados()} />
          {perfilSalvo && !alterado && (
            <View accessibilityLiveRegion="polite" style={estilos.confirmacao}>
              <Icone nome="check" tamanho={16} cor="marca" />
              <Texto variante="corpoMedio" cor="marca">
                Perfil salvo.
              </Texto>
            </View>
          )}
          {erroPerfil && <Aviso tom="erro">{erroPerfil}</Aviso>}
        </Cartao>
      </Secao>

      <Secao
        titulo="Seu link público"
        descricao={
          ehEmpresa
            ? "Envie este endereço para seus clientes: ele abre a conversa com a empresa (e o cardápio) direto no navegador."
            : "Envie este endereço para quem quiser falar com você: ele abre a conversa direto no navegador."
        }>
        <Cartao style={estilos.cartao}>
          <LinkPublico nomeUsuario={perfil.nomeUsuario} />
        </Cartao>
      </Secao>

      <Secao titulo="Status" descricao="Você escolhe como aparece. É diferente de estar conectado agora — isso o Jaaa detecta sozinho.">
        <Cartao style={estilos.cartao}>
          <View accessibilityRole="radiogroup" accessibilityLabel="Status" style={estilos.status}>
            {statusEscolhidoSchema.options.map((status: StatusEscolhido) => {
              const marcado = perfil.statusEscolhido === status;
              return (
                <Pressable
                  key={status}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: marcado }}
                  onPress={() => mudarPrivacidade({ statusEscolhido: status })}
                  style={[estilos.opcaoStatus, marcado && estilos.opcaoStatusMarcada]}>
                  <Texto variante="corpoMedio" cor={marcado ? "marca" : "conteudoSuave"}>
                    {ROTULO_STATUS[status]}
                  </Texto>
                </Pressable>
              );
            })}
          </View>
          {perfil.statusEscolhido === "invisivel" && <Aviso tom="atencao">Invisível: ninguém vê seu status nem se você está conectado. Você continua conversando normalmente.</Aviso>}
        </Cartao>
      </Secao>

      <Secao titulo="Privacidade" descricao="Quem pode ver cada coisa. Nada aqui muda quem pode falar com você.">
        <Cartao style={estilos.cartao}>
          <SeletorVisibilidade rotulo="Quem vê minha foto" valor={perfil.privacidade.visibilidadeFoto} aoMudar={(valor) => mudarPrivacidade({ visibilidadeFoto: valor })} />
          <SeletorVisibilidade rotulo="Quem vê meu status e minha frase" valor={perfil.privacidade.visibilidadeStatus} aoMudar={(valor) => mudarPrivacidade({ visibilidadeStatus: valor })} />
          <SeletorVisibilidade rotulo="Quem vê quando estou conectado" valor={perfil.privacidade.visibilidadePresenca} aoMudar={(valor) => mudarPrivacidade({ visibilidadePresenca: valor })} />
          <View style={estilos.buscavel}>
            <Switch
              value={perfil.privacidade.buscavelPorTelefone}
              onValueChange={(valor) => mudarPrivacidade({ buscavelPorTelefone: valor })}
              trackColor={{ true: Cores.marca, false: Cores.borda }}
              thumbColor={Cores.superficie}
              accessibilityLabel="Deixar que me encontrem pelo meu celular"
            />
            <View style={estilos.flex}>
              <Texto variante="corpoMedio">Deixar que me encontrem pelo meu celular</Texto>
              <Texto cor="conteudoSuave">Desligado, ninguém acha você digitando seu número. Seu telefone nunca aparece no resultado da busca.</Texto>
            </View>
          </View>
        </Cartao>
      </Secao>

      {aviso && (
        <Texto cor="marca" accessibilityLiveRegion="polite">
          {aviso}
        </Texto>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {!ehEmpresa && (
        <Secao titulo="Perfil profissional" descricao="Ofereça seus serviços: atividades, horários e onde você atende.">
          <Botao rotulo="Abrir perfil profissional" aparencia="secundario" onPress={() => setProfissionalAberto(true)} />
        </Secao>
      )}

      {!ehEmpresa && (
        <Secao titulo="Conta" descricao="Sua senha para entrar sem esperar código.">
          <FormularioSenha />
        </Secao>
      )}

      {!ehEmpresa && (
        <Secao titulo="Minhas empresas" descricao="Crie uma empresa para vender pelo Jaaa. Para administrá-la, toque no seu nome (no topo) e escolha a empresa.">
          <MinhasEmpresas />
        </Secao>
      )}

      {ehEmpresa && <Aviso>Pedidos, produtos, logística e horários de funcionamento da empresa são administrados no Jaaa Web.</Aviso>}

      {__DEV__ && <Botao aparencia="secundario" rotulo="Diagnóstico do contexto (desenvolvimento)" onPress={() => router.push("/diagnostico")} />}

      <SobreApp />
    </Tela>
  );
}

function SeletorVisibilidade({ rotulo, valor, aoMudar }: { rotulo: string; valor: VisibilidadePerfil; aoMudar: (valor: VisibilidadePerfil) => void }) {
  const [aberto, setAberto] = useState(false);
  return (
    <View style={estilos.seletor}>
      <Texto variante="corpoMedio">{rotulo}</Texto>
      <Pressable accessibilityRole="button" accessibilityLabel={`${rotulo}: ${ROTULO_VISIBILIDADE[valor]}`} onPress={() => setAberto(true)} style={estilos.campoSelecao}>
        <Texto style={estilos.flex}>{ROTULO_VISIBILIDADE[valor]}</Texto>
        <Icone nome="expandir" tamanho={18} />
      </Pressable>
      <MenuAcoes
        titulo={rotulo}
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        acoes={visibilidadePerfilSchema.options.map((opcao: VisibilidadePerfil) => ({ rotulo: ROTULO_VISIBILIDADE[opcao], executar: () => aoMudar(opcao) }))}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  cartao: { gap: Espaco.quatro, padding: Espaco.quatro },
  foto: { alignItems: "center", flexDirection: "row", gap: Espaco.quatro },
  avatarTocavel: { borderRadius: 999 },
  pressionado: { opacity: 0.7 },
  avatarOcupado: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0, alignItems: "center", backgroundColor: "rgba(0,0,0,0.35)", borderRadius: 999, justifyContent: "center" },
  seloCamera: {
    alignItems: "center",
    backgroundColor: Cores.marca,
    borderColor: Cores.superficie,
    borderRadius: 999,
    borderWidth: 2,
    bottom: -2,
    height: 26,
    justifyContent: "center",
    position: "absolute",
    right: -2,
    width: 26,
  },
  confirmacao: { alignItems: "center", flexDirection: "row", gap: Espaco.dois, justifyContent: "center" },
  somenteLeitura: { opacity: 0.6 },
  textoLongo: { minHeight: 96, paddingVertical: Espaco.dois, textAlignVertical: "top" },
  status: { flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois },
  opcaoStatus: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: Espaco.quatro },
  opcaoStatusMarcada: { backgroundColor: Cores.marcaSuave, borderColor: Cores.marca },
  seletor: { gap: 6 },
  campoSelecao: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, flexDirection: "row", minHeight: 44, paddingHorizontal: Espaco.tres },
  buscavel: { alignItems: "flex-start", backgroundColor: Cores.superficieSuave, borderRadius: Raio.bloco, flexDirection: "row", gap: Espaco.tres, padding: Espaco.tres },
});
