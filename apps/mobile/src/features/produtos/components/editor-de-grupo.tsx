import {
  DIAS_SEMANA,
  INSTRUCAO_GRUPO_OPCOES_TAMANHO_MAXIMO,
  MAXIMO_OPCOES_POR_GRUPO,
  NOME_DIA_SEMANA,
  NOME_GRUPO_OPCOES_TAMANHO_MAXIMO,
  NOME_OPCAO_TAMANHO_MAXIMO,
  ROTULO_DIA_SEMANA,
  avisoDeMinimoDoDia,
  opcoesOferecidasNoDia,
  type DiaSemana,
  type GrupoOpcoesProduto,
  type ProgramacaoSemanalGrupo,
} from "@jaa/contratos";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, BackHandler, Pressable, StyleSheet, Switch, TextInput, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { CampoTexto } from "@/components/ui/campo-texto";
import { Icone } from "@/components/ui/icone";
import { Aviso, Carregando, Cartao, Secao, Selo } from "@/components/ui/superficies";
import { Tela } from "@/components/ui/tela";
import { Texto } from "@/components/ui/texto";
import { ALTURA_TOQUE, Cores, Espaco, Raio } from "@/constants/theme";
import { atualizarGrupoOpcoes, atualizarOpcao, consultarProgramacaoSemanal, criarGrupoOpcoes, criarOpcao, definirOpcoesDoDia, definirProgramacaoSemanal, removerOpcao } from "../lib/api-personalizacao";
import { SIGLA_DIA, alternarOpcao, aplicarAOutrosDias, destinosPossiveis, diaDeHojeNoAparelho, mensagemDaAplicacao, naOrdemDoGrupo, opcoesSalvasDoDia, rascunhoAlterado } from "../lib/edicao-semana";
import { comOpcaoGravada, grupoAlterado, planejarGravacao, rascunhoInicial, semAOpcao, type OpcaoEmRascunho, type RascunhoDoGrupo } from "../lib/rascunho-do-grupo";
import { BarraDeAcoes, BotaoIcone, Marcacao, TopoComVoltar, mensagemDe } from "./pecas";

/*
 * EDITOR DE UM GRUPO de opções — o mesmo da Web (`editor-de-grupo.tsx`), em tela inteira, duas abas:
 *  - "Opções e regras": nome, instrução, mínimo/máximo e as opções (nome, acréscimo, ativa). Tudo fica
 *    em RASCUNHO e só "Salvar grupo" grava;
 *  - "Programação semanal": um dia por vez, com "Salvar dia".
 *
 * Vale para QUALQUER grupo: nenhum nome é especial. O mesmo editor cria um grupo novo (`grupo` null).
 *
 * ALTERAÇÃO NÃO SALVA nunca se perde em silêncio: fechar com rascunho pendente (do grupo ou do dia) e
 * trocar de dia com marcações pendentes perguntam antes. Apagar pede confirmação e é imediato.
 *
 * A API grava uma coisa por vez. "Salvar grupo" faz as gravações em sequência e, a cada resposta,
 * adota a lista que o SERVIDOR devolveu: se uma falhar, o que já foi salvo fica salvo, o resto
 * continua na tela e salvar de novo retoma de onde parou (sem criar opção em dobro).
 */

type Aba = "opcoes" | "semana";

interface EstadoDaAplicacao {
  destinos: readonly DiaSemana[];
  mensagem: { tom: "sucesso" | "erro"; texto: string } | null;
}

export function EditorDeGrupo({
  empresaId,
  produtoId,
  grupo,
  idsDosGrupos,
  aoFechar,
  aoGrupos,
  aoCriado,
  aoMudarAtivacao,
  aoPedirExcluir,
  aoAvisar,
}: {
  empresaId: string;
  produtoId: string;
  // null = grupo novo, ainda não gravado.
  grupo: GrupoOpcoesProduto | null;
  // Para reconhecer o grupo recém-criado na lista que o servidor devolve.
  idsDosGrupos: readonly string[];
  aoFechar: () => void;
  // A lista de grupos como o servidor a devolveu depois de uma gravação.
  aoGrupos: (grupos: GrupoOpcoesProduto[]) => void;
  aoCriado: (grupoId: string) => void;
  // Só a chave da programação semanal mudou (o resto da lista continua como estava).
  aoMudarAtivacao: (grupoId: string, ativa: boolean) => void;
  aoPedirExcluir: (grupo: GrupoOpcoesProduto) => void;
  // "Grupo criado" / "Grupo atualizado", dito na tela do produto depois que o editor fecha.
  aoAvisar: (texto: string) => void;
}) {
  const [aba, setAba] = useState<Aba>("opcoes");
  const [rascunho, setRascunho] = useState<RascunhoDoGrupo>(() => rascunhoInicial(grupo));
  const [erro, setErro] = useState<string | null>(null);
  const [trabalhando, setTrabalhando] = useState(false);
  const contador = useRef(0);
  // A linha recém-adicionada recebe o foco: digitar o nome é o próximo gesto natural.
  const [focar, setFocar] = useState<string | null>(null);

  // Programação semanal.
  const [programacao, setProgramacao] = useState<ProgramacaoSemanalGrupo | null>(null);
  const [erroSemana, setErroSemana] = useState<string | null>(null);
  const [hoje] = useState<DiaSemana>(() => diaDeHojeNoAparelho());
  const [dia, setDia] = useState<DiaSemana>(hoje);
  // null = igual ao que está salvo. Só existe enquanto o gestor mexe nas marcações do dia.
  const [rascunhoDoDia, setRascunhoDoDia] = useState<string[] | null>(null);
  const [aplicacao, setAplicacao] = useState<EstadoDaAplicacao | null>(null);
  // Retorno de sucesso na PRÓPRIA barra ("Terça: dia salvo").
  const [recado, setRecado] = useState<string | null>(null);

  const grupoId = grupo?.id ?? null;
  const ativa = grupo?.programacaoSemanal ?? false;
  // Opção criada ou apagada muda o que existe para programar: a programação é relida.
  const opcoesDoGrupo = grupo?.opcoes.map((opcao) => opcao.id).join(",") ?? "";

  useEffect(() => {
    if (!ativa || !grupoId) return;
    let atual = true;
    void consultarProgramacaoSemanal(empresaId, produtoId, grupoId).then((resultado) => {
      if (!atual) return;
      if (resultado.ok) setProgramacao(resultado.dados);
      else setErroSemana(mensagemDe(resultado));
    });
    return () => {
      atual = false;
    };
  }, [ativa, empresaId, produtoId, grupoId, opcoesDoGrupo]);

  const salvas = opcoesSalvasDoDia(ativa ? programacao : null, dia);
  const marcacoes = rascunhoDoDia ?? salvas;
  const diaAlterado = ativa && rascunhoAlterado(salvas, marcacoes);
  const regrasAlteradas = grupoAlterado(grupo, rascunho);

  const confirmarDescarte = useCallback((alvo: "dia" | "tudo", diaAtual: DiaSemana, depois: () => void) => {
    Alert.alert(
      alvo === "dia" ? `Descartar as alterações de ${ROTULO_DIA_SEMANA[diaAtual].toLowerCase()}?` : "Sair sem salvar?",
      alvo === "dia" ? "As marcações que você fez neste dia ainda não foram salvas." : "Há alterações neste grupo que ainda não foram salvas.",
      [
        { text: "Continuar editando", style: "cancel" },
        { text: "Descartar", style: "destructive", onPress: depois },
      ],
    );
  }, []);

  const fechar = useCallback(() => {
    if (trabalhando) return;
    if (diaAlterado || regrasAlteradas) confirmarDescarte("tudo", dia, aoFechar);
    else aoFechar();
  }, [trabalhando, diaAlterado, regrasAlteradas, confirmarDescarte, dia, aoFechar]);

  // O "Voltar" do Android fecha o editor (perguntando, se houver algo pendente).
  useEffect(() => {
    const assinatura = BackHandler.addEventListener("hardwareBackPress", () => {
      fechar();
      return true;
    });
    return () => assinatura.remove();
  }, [fechar]);

  const mudar = (valores: Partial<RascunhoDoGrupo>) => setRascunho((atual) => ({ ...atual, ...valores }));
  const mudarOpcao = (chave: string, valores: Partial<OpcaoEmRascunho>) => setRascunho((atual) => ({ ...atual, opcoes: atual.opcoes.map((opcao) => (opcao.chave === chave ? { ...opcao, ...valores } : opcao)) }));

  function adicionarOpcao() {
    contador.current += 1;
    const chave = `nova-${contador.current}`;
    setFocar(chave);
    setRascunho((atual) => ({ ...atual, opcoes: [...atual.opcoes, { chave, id: null, nome: "", acrescimo: "", ativa: true }] }));
  }

  async function salvarGrupo() {
    if (trabalhando) return;
    const resultado = planejarGravacao(grupo, rascunho);
    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }
    const { plano } = resultado;
    setErro(null);
    setTrabalhando(true);
    let emEdicao = rascunho;
    let idDoGrupo = grupoId;
    let conhecidas = new Set(grupo?.opcoes.map((opcao) => opcao.id) ?? []);
    let gravouAlgo = false;
    const falhar = (mensagem: string) => {
      setRascunho(emEdicao);
      setErro(gravouAlgo ? `${mensagem} O que já tinha sido salvo continua salvo; toque em “Salvar grupo” para tentar o restante.` : mensagem);
    };
    try {
      if (plano.criar) {
        const criado = await criarGrupoOpcoes(empresaId, produtoId, plano.criar);
        if (!criado.ok) return falhar(mensagemDe(criado));
        const novo = criado.dados.grupos.find((item) => !idsDosGrupos.includes(item.id));
        if (!novo) return falhar("O grupo foi criado, mas não foi possível abri-lo. Feche e abra o grupo na lista.");
        idDoGrupo = novo.id;
        gravouAlgo = true;
        aoGrupos(criado.dados.grupos);
        aoCriado(novo.id);
      } else if (plano.grupo && idDoGrupo) {
        const atualizado = await atualizarGrupoOpcoes(empresaId, produtoId, idDoGrupo, plano.grupo);
        if (!atualizado.ok) return falhar(mensagemDe(atualizado));
        gravouAlgo = true;
        aoGrupos(atualizado.dados.grupos);
      }
      if (!idDoGrupo) return;
      for (const alterada of plano.alteradas) {
        const resposta = await atualizarOpcao(empresaId, produtoId, idDoGrupo, alterada.id, alterada.entrada);
        if (!resposta.ok) return falhar(mensagemDe(resposta));
        gravouAlgo = true;
        aoGrupos(resposta.dados.grupos);
      }
      for (const nova of plano.novas) {
        const resposta = await criarOpcao(empresaId, produtoId, idDoGrupo, nova.entrada);
        if (!resposta.ok) return falhar(mensagemDe(resposta));
        gravouAlgo = true;
        const opcoes = resposta.dados.grupos.find((item) => item.id === idDoGrupo)?.opcoes ?? [];
        const criada = opcoes.find((opcao) => !conhecidas.has(opcao.id));
        conhecidas = new Set(opcoes.map((opcao) => opcao.id));
        // A linha passa a apontar para a opção criada: salvar de novo depois de uma falha não a duplica.
        if (criada) emEdicao = comOpcaoGravada(emEdicao, nova.chave, criada.id);
        aoGrupos(resposta.dados.grupos);
      }
      setRascunho(emEdicao);
      aoAvisar(plano.criar ? "Grupo criado" : "Grupo atualizado");
      // Sem alteração pendente no dia, salvar conclui a tarefa: o editor fecha, como na criação.
      if (!diaAlterado) aoFechar();
    } finally {
      setTrabalhando(false);
    }
  }

  async function apagarOpcao(chave: string, id: string) {
    if (!grupoId) return;
    setErro(null);
    setTrabalhando(true);
    try {
      const resposta = await removerOpcao(empresaId, produtoId, grupoId, id);
      if (!resposta.ok) {
        setErro(mensagemDe(resposta));
        return;
      }
      setRascunho((atual) => semAOpcao(atual, chave));
      aoGrupos(resposta.dados.grupos);
    } finally {
      setTrabalhando(false);
    }
  }

  function pedirParaApagarOpcao(opcao: OpcaoEmRascunho) {
    // Linha que ainda não existe no servidor: não há o que confirmar nem o que apagar lá.
    if (!opcao.id) {
      setRascunho((atual) => semAOpcao(atual, opcao.chave));
      return;
    }
    const id = opcao.id;
    Alert.alert(`Excluir a opção “${opcao.nome.trim() || "sem nome"}”?`, "Ela sai deste grupo e de todos os dias da programação. Pedidos já feitos não mudam.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir opção", style: "destructive", onPress: () => void apagarOpcao(opcao.chave, id) },
    ]);
  }

  async function alternarProgramacao(ligada: boolean) {
    if (!grupoId) return;
    setErroSemana(null);
    setTrabalhando(true);
    try {
      const resultado = await definirProgramacaoSemanal(empresaId, produtoId, grupoId, ligada);
      if (!resultado.ok) {
        setErroSemana(mensagemDe(resultado));
        return;
      }
      setProgramacao(resultado.dados);
      setAplicacao(null);
      setRecado(null);
      aoMudarAtivacao(grupoId, resultado.dados.programacaoSemanal);
    } finally {
      setTrabalhando(false);
    }
  }

  async function salvarDia() {
    if (!grupo || !diaAlterado || trabalhando) return;
    setErroSemana(null);
    setTrabalhando(true);
    try {
      const resultado = await definirOpcoesDoDia(empresaId, produtoId, grupo.id, dia, naOrdemDoGrupo(grupo, marcacoes));
      if (!resultado.ok) {
        // As marcações continuam na tela: nada do que o gestor fez se perde por causa do erro.
        setErroSemana(mensagemDe(resultado));
        return;
      }
      setProgramacao(resultado.dados);
      setRascunhoDoDia(null);
      setRecado(`${ROTULO_DIA_SEMANA[dia]}: dia salvo`);
    } finally {
      setTrabalhando(false);
    }
  }

  async function aplicar() {
    if (!grupo || !aplicacao || aplicacao.destinos.length === 0 || trabalhando) return;
    setTrabalhando(true);
    try {
      const resultado = await aplicarAOutrosDias(aplicacao.destinos, salvas, (destino, opcaoIds) => definirOpcoesDoDia(empresaId, produtoId, grupo.id, destino, opcaoIds));
      // A tela adota o que o servidor REALMENTE gravou — inclusive quando só parte dos dias deu certo.
      if (resultado.programacao) setProgramacao(resultado.programacao);
      const mensagem = mensagemDaAplicacao(resultado);
      if (mensagem.tom === "sucesso") {
        setRecado(mensagem.texto);
        setAplicacao(null);
      } else {
        // O que falhou fica escrito na tela (não some sozinho) e marcado: tentar de novo é um toque.
        setAplicacao({ destinos: resultado.falhas, mensagem });
      }
    } finally {
      setTrabalhando(false);
    }
  }

  function trocarDeDia(novo: DiaSemana) {
    if (novo === dia) return;
    const trocar = () => {
      setRascunhoDoDia(null);
      setAplicacao(null);
      setErroSemana(null);
      setRecado(null);
      setDia(novo);
    };
    if (diaAlterado) confirmarDescarte("dia", dia, trocar);
    else trocar();
  }

  const naSemana = aba === "semana";
  const alteradoNaAba = naSemana ? diaAlterado : regrasAlteradas;
  const estado = alteradoNaAba ? "Alterações ainda não salvas" : naSemana ? (recado ?? (ativa ? "Nenhuma alteração pendente" : undefined)) : grupo ? "Todas as alterações salvas" : undefined;

  return (
    <Tela
      rodape={
        <BarraDeAcoes erro={naSemana ? erroSemana : erro} estado={estado} tom={alteradoNaAba ? "pendente" : naSemana && recado ? "sucesso" : "neutro"}>
          <Botao rotulo={alteradoNaAba ? "Cancelar" : "Fechar"} aparencia="secundario" disabled={trabalhando} onPress={fechar} />
          {naSemana ? (
            <Botao rotulo="Salvar dia" carregando={trabalhando && diaAlterado && !aplicacao} textoCarregando="Salvando…" disabled={!diaAlterado || trabalhando} onPress={() => void salvarDia()} />
          ) : (
            <Botao rotulo="Salvar grupo" carregando={trabalhando} textoCarregando="Salvando…" disabled={!regrasAlteradas || trabalhando} onPress={() => void salvarGrupo()} />
          )}
        </BarraDeAcoes>
      }>
      <TopoComVoltar rotulo="Voltar para o produto" aoVoltar={fechar} />

      <Secao titulo={grupo ? "Editar grupo de opções" : "Novo grupo de opções"} descricao={grupo?.nome ?? "Personalização do produto"}>
        <View accessibilityRole="tablist" style={estilos.abas}>
          <AbaDoEditor rotulo={`Opções e regras (${rascunho.opcoes.length})`} marcada={!naSemana} pendente={regrasAlteradas && naSemana} aoEscolher={() => setAba("opcoes")} />
          <AbaDoEditor
            rotulo="Programação semanal"
            marcada={naSemana}
            pendente={diaAlterado && !naSemana}
            aoEscolher={() => {
              setErro(null);
              setAba("semana");
            }}
          />
        </View>

        {naSemana ? (
          <AbaProgramacaoSemanal
            grupo={grupo}
            programacao={ativa ? programacao : null}
            dia={dia}
            hoje={hoje}
            rascunho={marcacoes}
            alterado={diaAlterado}
            ocupado={trabalhando}
            semProgramacao={erroSemana !== null}
            aplicacao={aplicacao}
            aoAlternarProgramacao={(ligada) => void alternarProgramacao(ligada)}
            aoEscolherDia={trocarDeDia}
            aoAlternarOpcao={(opcaoId, marcada) => setRascunhoDoDia(alternarOpcao(marcacoes, opcaoId, marcada))}
            aoMarcarTodas={() => setRascunhoDoDia(grupo?.opcoes.map((opcao) => opcao.id) ?? [])}
            aoLimpar={() => setRascunhoDoDia([])}
            aoAbrirAplicar={() => setAplicacao({ destinos: [], mensagem: null })}
            aoAlternarDestino={(destino, marcado) =>
              setAplicacao((atual) => (atual ? { destinos: marcado ? [...atual.destinos.filter((item) => item !== destino), destino].sort() : atual.destinos.filter((item) => item !== destino), mensagem: null } : atual))
            }
            aoDefinirDestinos={(destinos) => setAplicacao({ destinos, mensagem: null })}
            aoAplicar={() => void aplicar()}
            aoCancelarAplicar={() => setAplicacao(null)}
          />
        ) : (
          <AbaOpcoesERegras rascunho={rascunho} ocupado={trabalhando} focar={focar} aoMudar={mudar} aoMudarOpcao={mudarOpcao} aoAdicionarOpcao={adicionarOpcao} aoPedirApagarOpcao={pedirParaApagarOpcao} />
        )}

        {grupo && !naSemana && (
          <View style={estilos.excluir}>
            <Botao rotulo="Excluir grupo" aparencia="perigo" disabled={trabalhando} onPress={() => aoPedirExcluir(grupo)} />
          </View>
        )}
      </Secao>
    </Tela>
  );
}

function AbaDoEditor({ rotulo, marcada, pendente, aoEscolher }: { rotulo: string; marcada: boolean; pendente: boolean; aoEscolher: () => void }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityLabel={pendente ? `${rotulo}, com alterações não salvas` : rotulo} accessibilityState={{ selected: marcada }} onPress={aoEscolher} style={[estilos.aba, marcada && estilos.abaMarcada]}>
      <Texto variante="pequenoMedio" cor={marcada ? "marca" : "conteudoSuave"} style={estilos.centro}>
        {rotulo}
      </Texto>
      {pendente && <View style={estilos.pendente} />}
    </Pressable>
  );
}

/** Aba "Opções e regras": as regras do grupo em cima e, abaixo, um bloco por opção. */
function AbaOpcoesERegras({
  rascunho,
  ocupado,
  focar,
  aoMudar,
  aoMudarOpcao,
  aoAdicionarOpcao,
  aoPedirApagarOpcao,
}: {
  rascunho: RascunhoDoGrupo;
  ocupado: boolean;
  focar: string | null;
  aoMudar: (valores: Partial<RascunhoDoGrupo>) => void;
  aoMudarOpcao: (chave: string, valores: Partial<OpcaoEmRascunho>) => void;
  aoAdicionarOpcao: () => void;
  aoPedirApagarOpcao: (opcao: OpcaoEmRascunho) => void;
}) {
  return (
    <>
      <Cartao style={estilos.cartao}>
        <CampoTexto rotulo="Nome do grupo" value={rascunho.nome} maxLength={NOME_GRUPO_OPCOES_TAMANHO_MAXIMO} placeholder="Ex.: Acompanhamentos" editable={!ocupado} onChangeText={(nome) => aoMudar({ nome })} />
        <CampoTexto rotulo="Instrução para o cliente" value={rascunho.instrucao} maxLength={INSTRUCAO_GRUPO_OPCOES_TAMANHO_MAXIMO} placeholder="Ex.: Escolha seus favoritos" editable={!ocupado} onChangeText={(instrucao) => aoMudar({ instrucao })} />
        <View style={estilos.duasColunas}>
          <View style={estilos.flex}>
            <CampoTexto rotulo="Mínimo de escolhas" value={rascunho.minimo} keyboardType="number-pad" maxLength={3} dica="0 para tornar o grupo opcional." editable={!ocupado} onChangeText={(minimo) => aoMudar({ minimo })} />
          </View>
          <View style={estilos.flex}>
            <CampoTexto rotulo="Máximo de escolhas" value={rascunho.maximo} keyboardType="number-pad" maxLength={3} dica="Limite de opções por pedido." editable={!ocupado} onChangeText={(maximo) => aoMudar({ maximo })} />
          </View>
        </View>
      </Cartao>

      <Cartao accessibilityLabel="Opções" style={estilos.cartao}>
        <Texto variante="miniForte" cor="conteudoSuave" style={estilos.sobretitulo}>
          Opções
        </Texto>
        {rascunho.opcoes.length === 0 && <Texto cor="conteudoSuave">Este grupo ainda não tem opções. Sem opções, ele não aparece para o cliente.</Texto>}

        {rascunho.opcoes.map((opcao, indice) => {
          const nome = opcao.nome.trim() || `opção ${indice + 1}`;
          return (
            <View key={opcao.chave} style={estilos.opcao}>
              <TextInput
                accessibilityLabel={`Nome da opção ${indice + 1}`}
                value={opcao.nome}
                maxLength={NOME_OPCAO_TAMANHO_MAXIMO}
                placeholder="Nome da opção"
                placeholderTextColor="#A2AAAB"
                editable={!ocupado}
                autoFocus={opcao.chave === focar}
                onChangeText={(texto) => aoMudarOpcao(opcao.chave, { nome: texto })}
                style={estilos.campo}
              />
              <View style={estilos.controlesDaOpcao}>
                <View style={estilos.acrescimo}>
                  <Texto variante="pequeno" cor="conteudoSuave">
                    Acréscimo (R$)
                  </Texto>
                  <TextInput
                    accessibilityLabel={`Acréscimo de ${nome}`}
                    value={opcao.acrescimo}
                    keyboardType="decimal-pad"
                    placeholder="0,00"
                    placeholderTextColor="#A2AAAB"
                    editable={!ocupado}
                    onChangeText={(texto) => aoMudarOpcao(opcao.chave, { acrescimo: texto })}
                    style={estilos.campo}
                  />
                </View>
                <View style={estilos.ativa}>
                  <Texto variante="pequeno" cor="conteudoSuave">
                    Ativa
                  </Texto>
                  <Switch value={opcao.ativa} disabled={ocupado} onValueChange={(ativa) => aoMudarOpcao(opcao.chave, { ativa })} trackColor={{ true: Cores.marca, false: Cores.borda }} thumbColor={Cores.superficie} accessibilityLabel={`Disponibilidade de ${nome}`} />
                </View>
                <BotaoIcone icone="lixeira" rotulo={`Excluir ${nome}`} desabilitado={ocupado} aoTocar={() => aoPedirApagarOpcao(opcao)} />
              </View>
            </View>
          );
        })}

        {rascunho.opcoes.length < MAXIMO_OPCOES_POR_GRUPO ? <Botao rotulo="Adicionar opção" aparencia="secundario" disabled={ocupado} onPress={aoAdicionarOpcao} /> : <Aviso tom="atencao">Este grupo já tem o máximo de {MAXIMO_OPCOES_POR_GRUPO} opções.</Aviso>}
      </Cartao>

    </>
  );
}

const rotuloDeOpcoes = (total: number) => (total === 1 ? "1 opção" : `${total} opções`);

/**
 * Aba "Programação semanal" (só apresentação): a chave liga/desliga, as sete posições (Seg…Dom), o dia
 * escolhido com as opções JÁ cadastradas para marcar e "Copiar para outros dias". Nada é gravado a
 * cada toque: o gestor marca o que quiser e toca em "Salvar dia".
 *
 * Não mexe em mínimo/máximo: decide apenas QUAIS opções existem em cada dia. A disponibilidade normal
 * da opção continua mandando.
 */
function AbaProgramacaoSemanal({
  grupo,
  programacao,
  dia,
  hoje,
  rascunho,
  alterado,
  ocupado,
  semProgramacao,
  aplicacao,
  aoAlternarProgramacao,
  aoEscolherDia,
  aoAlternarOpcao,
  aoMarcarTodas,
  aoLimpar,
  aoAbrirAplicar,
  aoAlternarDestino,
  aoDefinirDestinos,
  aoAplicar,
  aoCancelarAplicar,
}: {
  // null = grupo ainda não salvo: não há o que programar.
  grupo: GrupoOpcoesProduto | null;
  // null = desligada, ou ligada e ainda carregando.
  programacao: ProgramacaoSemanalGrupo | null;
  dia: DiaSemana;
  hoje: DiaSemana;
  // Marcações do dia NA TELA (podem diferir do que está salvo).
  rascunho: readonly string[];
  alterado: boolean;
  ocupado: boolean;
  // A leitura da programação falhou (o erro aparece na barra): não há o que carregar.
  semProgramacao: boolean;
  aplicacao: EstadoDaAplicacao | null;
  aoAlternarProgramacao: (ligada: boolean) => void;
  aoEscolherDia: (dia: DiaSemana) => void;
  aoAlternarOpcao: (opcaoId: string, marcada: boolean) => void;
  aoMarcarTodas: () => void;
  aoLimpar: () => void;
  aoAbrirAplicar: () => void;
  aoAlternarDestino: (dia: DiaSemana, marcado: boolean) => void;
  aoDefinirDestinos: (dias: DiaSemana[]) => void;
  aoAplicar: () => void;
  aoCancelarAplicar: () => void;
}) {
  if (!grupo) {
    return (
      <Cartao style={estilos.cartao}>
        <Texto variante="corpoMedio">Salve o grupo primeiro</Texto>
        <Texto variante="pequeno" cor="conteudoSuave">
          Depois de criar o grupo e as opções dele, você escolhe aqui o que é oferecido em cada dia da semana.
        </Texto>
      </Cartao>
    );
  }

  const ativa = grupo.programacaoSemanal;
  const marcadas = new Set(rascunho);
  // O aviso acompanha o que está NA TELA: o gestor vê o efeito antes de salvar.
  const aviso = avisoDeMinimoDoDia(grupo, { diaSemana: dia, opcaoIds: [...rascunho] });
  const destinos = destinosPossiveis(dia);

  return (
    <>
      <Cartao style={estilos.cartao}>
        <View style={estilos.linha}>
          <View style={estilos.flex}>
            <Texto variante="corpoMedio">Programação semanal</Texto>
            <Texto variante="pequeno" cor="conteudoSuave">
              Disponibilidade diferente para cada dia da semana.
            </Texto>
          </View>
          <Switch value={ativa} disabled={ocupado || alterado} onValueChange={aoAlternarProgramacao} trackColor={{ true: Cores.marca, false: Cores.borda }} thumbColor={Cores.superficie} accessibilityLabel="Programação semanal" />
        </View>
        {!ativa && (
          <View style={estilos.explicacao}>
            <Texto variante="corpoMedio">As opções estão disponíveis todos os dias</Texto>
            <Texto variante="pequeno" cor="conteudoSuave">
              Ao ligar pela primeira vez, as opções atuais são mantidas em todos os dias. Uma programação já feita é guardada e volta como estava.
            </Texto>
          </View>
        )}
      </Cartao>

      {ativa && (
        <>
          {/* Sete posições em colunas iguais: cabem lado a lado em qualquer celular. */}
          <View accessibilityRole="tablist" accessibilityLabel="Dias da semana" style={estilos.semana}>
            {DIAS_SEMANA.map((posicao) => {
              const selecionado = posicao === dia;
              const programado = programacao?.dias.find((item) => item.diaSemana === posicao) ?? null;
              const total = programado ? opcoesOferecidasNoDia(grupo, programado.opcaoIds) : null;
              const comAviso = programado ? avisoDeMinimoDoDia(grupo, programado) !== null : false;
              return (
                <Pressable
                  key={posicao}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: selecionado }}
                  accessibilityLabel={`${ROTULO_DIA_SEMANA[posicao]}${posicao === hoje ? " (hoje)" : ""}${total !== null ? `: ${rotuloDeOpcoes(total)}` : ""}${comAviso ? ", menos do que o grupo exige" : ""}`}
                  onPress={() => aoEscolherDia(posicao)}
                  style={[estilos.posicao, selecionado && estilos.posicaoMarcada]}>
                  <View style={estilos.sigla}>
                    <Texto variante="pequenoMedio" cor={selecionado ? "marcaConteudo" : "conteudo"}>
                      {SIGLA_DIA[posicao]}
                    </Texto>
                    {posicao === hoje && <View style={[estilos.pontoDeHoje, selecionado && estilos.pontoDeHojeMarcado]} />}
                  </View>
                  <View style={comAviso && estilos.totalComAviso}>
                    <Texto variante={comAviso ? "miniForte" : "mini"} cor={comAviso ? "aviso" : selecionado ? "marcaConteudo" : "conteudoSuave"}>
                      {total ?? "–"}
                    </Texto>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {!programacao && !semProgramacao && <Carregando texto="Carregando a programação…" />}

          {programacao && (
            <Cartao accessibilityLabel={`Opções de ${ROTULO_DIA_SEMANA[dia]}`} style={estilos.cartao}>
              <View style={estilos.cabecalhoDoDia}>
                <Texto variante="subtitulo" style={estilos.flex}>
                  {NOME_DIA_SEMANA[dia].charAt(0).toUpperCase() + NOME_DIA_SEMANA[dia].slice(1)}
                  {dia === hoje && (
                    <Texto variante="pequenoMedio" cor="conteudoSuave">
                      {"  "}hoje
                    </Texto>
                  )}
                </Texto>
              </View>
              {grupo.opcoes.length > 0 && (
                // Copia o dia como está SALVO: com marcação pendente, primeiro "Salvar dia".
                <Botao rotulo={aplicacao ? "Fechar a cópia para outros dias" : "Copiar para outros dias"} aparencia={aplicacao ? "realce" : "secundario"} compacto disabled={ocupado || alterado} onPress={aplicacao ? aoCancelarAplicar : aoAbrirAplicar} />
              )}
              {alterado && grupo.opcoes.length > 0 && (
                <Texto variante="pequeno" cor="conteudoSuave">
                  Salve o dia antes de copiar.
                </Texto>
              )}

              {/* Copiar ESTE dia (já salvo) para outros: reutiliza a programação, não duplica opção nenhuma. */}
              {aplicacao && (
                <View style={estilos.explicacao}>
                  <Texto>Aplicar opções de {ROTULO_DIA_SEMANA[dia].toLowerCase()} em:</Texto>
                  <View style={estilos.destinos}>
                    {destinos.todos.map((destino) => (
                      <View key={destino} style={estilos.destino}>
                        <Marcacao rotulo={ROTULO_DIA_SEMANA[destino]} marcada={aplicacao.destinos.includes(destino)} desabilitada={ocupado} aoMudar={(marcado) => aoAlternarDestino(destino, marcado)} />
                      </View>
                    ))}
                  </View>
                  {aplicacao.mensagem && <Aviso tom={aplicacao.mensagem.tom === "erro" ? "erro" : "informacao"}>{aplicacao.mensagem.texto}</Aviso>}
                  <View style={estilos.atalhos}>
                    <Botao rotulo="Dias úteis" aparencia="discreto" compacto disabled={ocupado} onPress={() => aoDefinirDestinos(destinos.diasUteis)} />
                    <Botao rotulo="Todos os outros" aparencia="discreto" compacto disabled={ocupado} onPress={() => aoDefinirDestinos(destinos.todos)} />
                  </View>
                  <Botao rotulo="Aplicar" carregando={ocupado} textoCarregando="Aplicando…" disabled={ocupado || aplicacao.destinos.length === 0} onPress={aoAplicar} />
                </View>
              )}

              {grupo.opcoes.length === 0 ? (
                <Texto cor="conteudoSuave">Adicione opções na aba Opções e regras.</Texto>
              ) : (
                <>
                  <View style={estilos.atalhos}>
                    <Botao rotulo="Marcar todas" aparencia="discreto" compacto disabled={ocupado} onPress={aoMarcarTodas} />
                    <Botao rotulo="Limpar" aparencia="discreto" compacto disabled={ocupado || rascunho.length === 0} onPress={aoLimpar} />
                  </View>
                  <View>
                    {grupo.opcoes.map((opcao) => {
                      const indisponivel = opcao.disponibilidade !== "disponivel";
                      return (
                        <View key={opcao.id} style={estilos.opcaoDoDia}>
                          <Marcacao
                            rotulo={opcao.nome}
                            marcada={marcadas.has(opcao.id)}
                            desabilitada={ocupado}
                            aoMudar={(marcada) => aoAlternarOpcao(opcao.id, marcada)}
                            // A disponibilidade normal continua mandando: marcar o dia não a torna disponível.
                            depois={indisponivel ? <Selo rotulo="Indisponível" tom="atencao" /> : undefined}
                          />
                        </View>
                      );
                    })}
                  </View>
                </>
              )}

              <View style={estilos.informacao}>
                <Icone nome="informacao" tamanho={14} />
                <Texto variante="pequeno" cor="conteudoSuave" style={estilos.flex}>
                  Opções indisponíveis não aparecem no cardápio, mesmo quando programadas. Opção nova não entra sozinha nos dias: marque onde ela vale.
                </Texto>
              </View>

              {aviso && <Aviso tom="atencao">{aviso}</Aviso>}
            </Cartao>
          )}
        </>
      )}

    </>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  centro: { textAlign: "center" },
  abas: { backgroundColor: Cores.superficieSuave, borderRadius: Raio.bloco, flexDirection: "row", gap: Espaco.um, padding: Espaco.um },
  aba: { alignItems: "center", borderRadius: Raio.compacto, flex: 1, flexDirection: "row", gap: Espaco.um, justifyContent: "center", minHeight: 40, paddingHorizontal: Espaco.dois },
  abaMarcada: { backgroundColor: Cores.superficie },
  pendente: { backgroundColor: Cores.aviso, borderRadius: Raio.total, height: 8, width: 8 },
  cartao: { gap: Espaco.tres, padding: Espaco.quatro },
  duasColunas: { alignItems: "flex-start", flexDirection: "row", gap: Espaco.tres },
  sobretitulo: { letterSpacing: 0.4, textTransform: "uppercase" },
  opcao: { borderTopColor: Cores.borda, borderTopWidth: StyleSheet.hairlineWidth, gap: Espaco.dois, paddingTop: Espaco.tres },
  campo: { backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, color: Cores.conteudo, fontSize: 16, minHeight: ALTURA_TOQUE, paddingHorizontal: Espaco.tres, paddingVertical: 0 },
  controlesDaOpcao: { alignItems: "flex-end", flexDirection: "row", gap: Espaco.tres },
  acrescimo: { flex: 1, gap: Espaco.um, minWidth: 0 },
  ativa: { alignItems: "center", gap: Espaco.um, minHeight: ALTURA_TOQUE },
  excluir: { borderTopColor: Cores.borda, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Espaco.tres },
  linha: { alignItems: "center", flexDirection: "row", gap: Espaco.tres, minHeight: ALTURA_TOQUE },
  explicacao: { backgroundColor: Cores.superficieSuave, borderRadius: Raio.bloco, gap: Espaco.dois, padding: Espaco.tres },
  semana: { flexDirection: "row", gap: Espaco.um },
  posicao: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, flex: 1, gap: Espaco.um, justifyContent: "center", minHeight: 56, minWidth: 0 },
  posicaoMarcada: { backgroundColor: Cores.marca, borderColor: Cores.marca },
  sigla: { alignItems: "center", flexDirection: "row", gap: 3 },
  pontoDeHoje: { backgroundColor: Cores.marca, borderRadius: Raio.total, height: 4, width: 4 },
  pontoDeHojeMarcado: { backgroundColor: Cores.marcaConteudo },
  totalComAviso: { backgroundColor: Cores.ouroSuave, borderRadius: Raio.total, paddingHorizontal: 6, paddingVertical: 1 },
  cabecalhoDoDia: { alignItems: "center", flexDirection: "row", gap: Espaco.dois },
  destinos: { flexDirection: "row", flexWrap: "wrap" },
  destino: { width: "50%" },
  atalhos: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: Espaco.um },
  opcaoDoDia: { borderTopColor: Cores.borda, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: Espaco.um },
  informacao: { alignItems: "flex-start", flexDirection: "row", gap: Espaco.dois },
});
