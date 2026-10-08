import {
  EVENTO_CONVERSA_ESTADO_PESSOAL,
  EVENTO_MENSAGEM_ATUALIZADA,
  EVENTO_MENSAGEM_EXCLUIDA_PARA_MIM,
  EVENTO_MENSAGEM_NOVA,
  EVENTO_MENSAGENS_ENTREGUES,
  EVENTO_MENSAGENS_LIDAS,
  eventoConversaEstadoPessoalSchema,
  eventoMensagemAtualizadaSchema,
  eventoMensagemExcluidaParaMimSchema,
  eventoMensagemNovaSchema,
  eventoMensagensEntreguesSchema,
  eventoMensagensLidasSchema,
  type EnderecoCliente,
  type GrupoOpcoesPublico,
  type Mensagem,
  type ParticipanteConversa,
  type TipoIdentidade,
} from "@jaa/contratos";
import { avisarUmaVez } from "@/lib/sons/avisar";
import { aparelhoLivreParaSom } from "../lib/som-nativo";
import { useIsFocused, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, BackHandler, FlatList, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icone } from "@/components/ui/icone";
import { ROTULO_ACAO_MENSAGEM, acoesDisponiveisDaMensagem, conteudoParaPrevia, type IdAcaoMensagem } from "../lib/acoes-mensagem";
import { MenuAcoes, type AcaoMenu } from "@/components/ui/menu-acoes";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";
import { useIdentidadeDaConversa } from "@/features/conversas/hooks/use-identidade-da-conversa";
import { AvisoDoPedido, PainelCarrinho, type ConfirmacaoPedido } from "@/features/carrinho/components/painel-carrinho";
import { useCarrinho } from "@/features/carrinho/hooks/use-carrinho";
import { useFreteEntrega } from "@/features/carrinho/hooks/use-frete-entrega";
import { escolhasDaMontagem, itensParaPedido, quantidadeTotal, type Carrinho, type EscolhaCarrinho } from "@/features/carrinho/lib/carrinho";
import { CatalogoDaEmpresa } from "@/features/catalogo/components/catalogo-da-empresa";
import { useFuncionamento } from "@/features/catalogo/hooks/use-funcionamento";
import { ehEmpresaFechada, motivoDoBloqueio } from "@/features/catalogo/lib/funcionamento";
import { EtapaEnderecoEntrega } from "@/features/enderecos/components/etapa-endereco-entrega";
import { useStatusPedido } from "@/features/pedidos/hooks/use-status-pedido";
import { criarPedido } from "@/features/pedidos/lib/api-pedidos";
import { gerarIdCliente } from "@/lib/id-cliente";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { useAppVisivel } from "@/lib/use-app-visivel";
import { useAtividadeConversa } from "../hooks/use-atividade-conversa";
import { useBloqueioConversa } from "../hooks/use-bloqueio-conversa";
import { rotaDaConversa } from "../lib/abrir-conversa";
import {
  abrirConversaDireta,
  confirmarLeituraConversa,
  editarMensagem,
  enviarMensagem,
  enviarMensagemAudio,
  enviarMensagemImagem,
  excluirMensagemParaMim,
  excluirMensagemParaTodos,
  listarMensagens,
} from "../lib/api-conversas";
import { useGravacaoAudio } from "../hooks/use-gravacao-audio";
import { useUrlsAudios, useUrlsImagens } from "../hooks/use-urls-imagens";
import { destinoDaTentativaDeAudio, mensagemDeFalhaAudio, modoDoCompositor, podeGravar, tentativaDeAudioJaChegou, type TentativaAudio } from "../lib/audio-conversa";
import { BalaoAudioPendente } from "./balao-audio-pendente";
import { AudioProntoParaEnviar, GravandoAudio } from "./gravacao-audio-compositor";
import { OPCOES_ANEXO, anexarImagem, destinoDaTentativa, mensagemDeFalhaImagem, tentativaJaChegou, type ImagemPreparada, type OrigemImagem, type TentativaImagem } from "../lib/imagem-conversa";
import { obterImagem, prepararImagem } from "../lib/seletor-imagem";
import { BalaoImagemPendente } from "./balao-imagem-pendente";
import { PreviaImagemCompositor } from "./previa-imagem-compositor";
import { VisualizadorImagem } from "./visualizador-imagem";
import { confirmarRecebimentos } from "../lib/confirmar-recebimentos";
import { definirConversaEmLeitura } from "../lib/conversa-em-leitura";
import {
  atualizarPedidoNasMensagens,
  conversaVazia,
  ocultarMensagem,
  receberAtualizacao,
  receberEntrega,
  receberLeitura,
  receberMensagens,
  ultimaMensagemRecebida,
} from "../lib/estados-mensagens";
import { executarAcaoConversaNoServidor } from "../lib/executar-acao-conversa";
import { mesmoDia, rotuloDoDia } from "../lib/horarios";
import { resumirConteudoParaPrevia, rotuloAutorResposta } from "../lib/respostas";
import { AcoesDaConversa, type AcaoConversa, type AlvoAcaoConversa } from "./acoes-conversa";
import { BalaoMensagem } from "./balao-mensagem";
import { BotaoCabecalho, CabecalhoConversa } from "./cabecalho-conversa";
import { ReferenciaResposta } from "./referencia-resposta";

/*
 * A CONVERSA ABERTA: cabeçalho fixo, mensagens rolando no meio e compositor embaixo — a `ConversaTecnica`
 * da Web no formato de celular. Autorização, remetente, persistência e idempotência continuam sendo
 * impostos pela API; esta camada só apresenta.
 *
 * Os painéis de comércio seguem o comportamento da Web abaixo de `xl` (uma tela principal por vez):
 *   - o CARDÁPIO ocupa o lugar das mensagens, e o compositor continua no rodapé;
 *   - "Seu pedido", o endereço e o detalhe do pedido tomam a TELA, com a seta de voltar no cabeçalho.
 */

// A referência de resposta faz parte da tentativa: reenviar reutiliza idCliente, conteúdo e referência.
type TentativaEnvio = { idCliente: string; conteudo: string; mensagemRespondidaId?: string };

// Pedido a criar; reenviar a mesma confirmação reutiliza idCliente (idempotência imposta pela API).
type TentativaPedido = { idCliente: string; assinatura: string };

type RespostaEmComposicao = { mensagemId: string; nomeAutor: string; previaConteudo: string; conteudoTruncado: boolean };

// Aberta pela lista ou pelo @usuario; a autorização de leitura/envio continua sendo da API.
export type ConversaAberta = {
  id: string;
  outraIdentidade: ParticipanteConversa;
  // Prévia da foto trazida pela rota (ou null); a identidade atual é relida da API na tela.
  previaFotoUrl?: string | null;
};

/** Remonta a conversa quando ela é LIMPA (aqui ou em outro aparelho) e fecha quando é APAGADA. */
/** Mensagem ACEITA pelo servidor: confirmação discreta, uma vez por mensagem, só com o áudio livre. */
function avisarEnvio(mensagemId: string) {
  if (aparelhoLivreParaSom()) avisarUmaVez("mensagemEnviada", mensagemId);
}

export function TelaConversa(props: { identidadeId: string; tipoIdentidade: TipoIdentidade; conversa: ConversaAberta }) {
  const router = useRouter();
  const [versaoLimpeza, setVersaoLimpeza] = useState(0);
  const conversaId = props.conversa.id;

  useEffect(() => {
    const socket = obterClienteRealtime();
    const aoMudar = (evento: unknown) => {
      const lido = eventoConversaEstadoPessoalSchema.safeParse(evento);
      if (!lido.success || lido.data.conversaId !== conversaId) return;
      if (lido.data.acao === "apagada") router.back();
      else setVersaoLimpeza((versao) => versao + 1);
    };
    socket.on(EVENTO_CONVERSA_ESTADO_PESSOAL, aoMudar);
    return () => {
      socket.off(EVENTO_CONVERSA_ESTADO_PESSOAL, aoMudar);
    };
  }, [conversaId, router]);

  async function executarAcaoConversa(acao: AcaoConversa, alvo: AlvoAcaoConversa): Promise<string | null> {
    const falha = await executarAcaoConversaNoServidor(acao, alvo);
    if (falha) return falha;
    if (acao === "apagar") router.back();
    else if (acao === "limpar") setVersaoLimpeza((versao) => versao + 1);
    return null;
  }

  // `key`: limpar recomeça o estado (histórico, envio pendente, atividade) do zero, já sem o que foi limpo.
  return <Conversa key={`${conversaId}:${versaoLimpeza}`} {...props} aoAcaoConversa={executarAcaoConversa} />;
}

function Conversa({
  identidadeId,
  tipoIdentidade,
  conversa,
  aoAcaoConversa,
}: {
  identidadeId: string;
  // Só identidade PESSOAL compra; a empresa participa da conversa, não faz pedido de si mesma.
  tipoIdentidade: TipoIdentidade;
  conversa: ConversaAberta;
  aoAcaoConversa: (acao: AcaoConversa, alvo: AlvoAcaoConversa) => Promise<string | null>;
}) {
  const router = useRouter();
  const { top, bottom } = useSafeAreaInsets();
  const [reconciliada, setReconciliada] = useState(conversaVazia);
  const mensagens = reconciliada.mensagens;
  const [historicoCarregado, setHistoricoCarregado] = useState(false);
  // "Visível" no app = em primeiro plano E com esta tela em foco (o `document.visibilityState` da Web).
  const appVisivel = useAppVisivel();
  const emFoco = useIsFocused();
  const conversaVisivel = appVisivel && emFoco;
  // Maior marcador de leitura já enviado (ou em envio) por este app para esta conversa.
  const leituraConfirmadaRef = useRef<string | null>(null);
  const [proximoCursor, setProximoCursor] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  // Bloqueio de mensagens com a outra PESSOA (servidor é a verdade).
  const bloqueio = useBloqueioConversa(conversa.outraIdentidade.identidadeId);
  const bloqueada = bloqueio.situacao !== null && (bloqueio.situacao.euBloqueei || bloqueio.situacao.fuiBloqueado);
  const [pendente, setPendente] = useState<TentativaEnvio | null>(null);
  const [respostaSelecionada, setRespondendo] = useState<RespostaEmComposicao | null>(null);
  // Mensagem própria em edição: o compositor passa a salvar o novo conteúdo em vez de enviar.
  const [edicaoSelecionada, setEditando] = useState<Mensagem | null>(null);
  // Resposta/edição só valem enquanto a mensagem continua visível e não excluída.
  const disponivel = (id: string) => mensagens.some((mensagem) => mensagem.id === id && !mensagem.excluidaEm);
  const respondendo = respostaSelecionada && disponivel(respostaSelecionada.mensagemId) ? respostaSelecionada : null;
  const editando = edicaoSelecionada && disponivel(edicaoSelecionada.id) ? edicaoSelecionada : null;
  const campoMensagemRef = useRef<TextInput>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Ações da mensagem tocada: montadas NO TOQUE (não no render), porque focam o campo pela ref.
  const [acoesDaMensagemAberta, setAcoesDaMensagemAberta] = useState<AcaoMenu[] | null>(null);
  const [menuConversaAberto, setMenuConversaAberto] = useState(false);
  // IMAGEM: a escolhida (prévia no compositor), a que está em envio (balão pendente) e a ampliada.
  const [menuAnexoAberto, setMenuAnexoAberto] = useState(false);
  const [imagemSelecionada, setImagemSelecionada] = useState<ImagemPreparada | null>(null);
  const [imagemPendente, setImagemPendente] = useState<{ tentativa: TentativaImagem; situacao: "enviando" | "falhou"; idsAntesDoEnvio: ReadonlySet<string> } | null>(null);
  const [imagemAberta, setImagemAberta] = useState<{ url: string; descricao: string } | null>(null);
  // URLs privadas das imagens desta conversa: só em memória, pedidas em lote, esquecidas ao apagar.
  const { estadoDaImagem, cache: cacheImagens } = useUrlsImagens(conversa.id, mensagens);
  // MENSAGEM DE VOZ: URLs privadas (mesma regra das imagens), gravação e a tentativa em envio.
  const { estadoDaImagem: estadoDoAudio, cache: cacheAudios } = useUrlsAudios(conversa.id, mensagens);
  const [audioPendente, setAudioPendente] = useState<{ tentativa: TentativaAudio; situacao: "enviando" | "falhou"; idsAntesDoEnvio: ReadonlySet<string> } | null>(null);
  const gravacao = useGravacaoAudio({ aoErro: setErro });
  // Catálogo (consulta de cliente) aberto dentro da conversa com uma empresa.
  const [catalogoAberto, setCatalogoAberto] = useState(false);
  // Carrinho + pedido: só existem quando uma pessoa conversa com uma empresa.
  const podeComprar = tipoIdentidade === "pessoal" && conversa.outraIdentidade.tipo === "empresarial";
  const { carrinho, adicionar: adicionarAoCarrinho, substituirPorEmpresa, alterarQuantidade, remover, limpar } = useCarrinho(identidadeId);
  // No celular "Seu pedido" cobriria a conversa: fica guardado até a pessoa pedir.
  const [painelPedidoAberto, setPainelPedidoAberto] = useState(false);
  // Destino escolhido para este pedido (com ponto já confirmado no mapa).
  const [enderecoEntrega, setEnderecoEntrega] = useState<EnderecoCliente | null>(null);
  // Taxa de entrega do destino, informada pelo servidor a cada escolha/troca de endereço.
  const { frete: freteEntrega, consultar: consultarFreteEntrega } = useFreteEntrega(conversa.outraIdentidade.identidadeId);
  const [escolhendoEndereco, setEscolhendoEndereco] = useState(false);
  // Carrinho aberto de OUTRA empresa: pergunta antes de substituir; nunca troca em silêncio.
  const [trocaDeEmpresa, setTrocaDeEmpresa] = useState<{
    empresa: Carrinho["empresa"];
    produto: Parameters<typeof adicionarAoCarrinho>[1];
    quantidade: number;
    escolhas: EscolhaCarrinho[];
    observacao: string | null;
    nomeAtual: string;
  } | null>(null);
  const [tentativaPedido, setTentativaPedido] = useState<TentativaPedido | null>(null);
  const [enviandoPedido, setEnviandoPedido] = useState(false);
  const [erroPedido, setErroPedido] = useState<string | null>(null);
  const atividade = useAtividadeConversa({ conversaId: conversa.id, outraIdentidadeId: conversa.outraIdentidade.identidadeId });

  // A lista (coberta por esta tela) deixa de mostrar o contador desta conversa enquanto ela é lida.
  useEffect(() => {
    if (!emFoco) return;
    definirConversaEmLeitura(conversa.id);
    return () => definirConversaEmLeitura(null);
  }, [conversa.id, emFoco]);

  const adicionar = useCallback((novas: Mensagem[]) => {
    setReconciliada((atual) => receberMensagens(atual, novas));
  }, []);

  useEffect(() => {
    let ativo = true;
    void listarMensagens(conversa.id).then((pagina) => {
      if (!ativo) return;
      if (!pagina.ok) {
        setErro(pagina.mensagem);
        return;
      }
      adicionar(pagina.dados.mensagens);
      setProximoCursor(pagina.dados.proximoCursor);
      setHistoricoCarregado(true);
    });
    return () => {
      ativo = false;
    };
  }, [conversa.id, adicionar]);

  useEffect(() => {
    const socket = obterClienteRealtime();

    const aoReceber = (evento: unknown) => {
      const resultado = eventoMensagemNovaSchema.safeParse(evento);
      if (resultado.success && resultado.data.mensagem.conversaId === conversa.id) adicionar([resultado.data.mensagem]);
    };
    const aoAtualizar = (evento: unknown) => {
      const resultado = eventoMensagemAtualizadaSchema.safeParse(evento);
      if (resultado.success && resultado.data.mensagem.conversaId === conversa.id) {
        setReconciliada((atual) => receberAtualizacao(atual, resultado.data.mensagem));
      }
    };
    const aoExcluirParaMim = (evento: unknown) => {
      const resultado = eventoMensagemExcluidaParaMimSchema.safeParse(evento);
      if (resultado.success && resultado.data.conversaId === conversa.id) {
        setReconciliada((atual) => ocultarMensagem(atual, resultado.data.mensagemId));
      }
    };
    const aoEntregar = (evento: unknown) => {
      const resultado = eventoMensagensEntreguesSchema.safeParse(evento);
      if (resultado.success && resultado.data.conversaId === conversa.id) setReconciliada((atual) => receberEntrega(atual, resultado.data));
    };
    const aoLer = (evento: unknown) => {
      const resultado = eventoMensagensLidasSchema.safeParse(evento);
      if (resultado.success && resultado.data.conversaId === conversa.id) setReconciliada((atual) => receberLeitura(atual, resultado.data));
    };

    // Ao (re)conectar, busca as mais recentes: cobre mensagens chegadas enquanto estava desconectado.
    const aoConectar = () => {
      void listarMensagens(conversa.id).then((pagina) => {
        if (!pagina.ok) return;
        adicionar(pagina.dados.mensagens);
        setHistoricoCarregado(true);
      });
    };

    socket.on(EVENTO_MENSAGEM_NOVA, aoReceber);
    socket.on(EVENTO_MENSAGEM_ATUALIZADA, aoAtualizar);
    socket.on(EVENTO_MENSAGEM_EXCLUIDA_PARA_MIM, aoExcluirParaMim);
    socket.on(EVENTO_MENSAGENS_ENTREGUES, aoEntregar);
    socket.on(EVENTO_MENSAGENS_LIDAS, aoLer);
    socket.on("connect", aoConectar);
    return () => {
      socket.off(EVENTO_MENSAGEM_NOVA, aoReceber);
      socket.off(EVENTO_MENSAGEM_ATUALIZADA, aoAtualizar);
      socket.off(EVENTO_MENSAGEM_EXCLUIDA_PARA_MIM, aoExcluirParaMim);
      socket.off(EVENTO_MENSAGENS_ENTREGUES, aoEntregar);
      socket.off(EVENTO_MENSAGENS_LIDAS, aoLer);
      socket.off("connect", aoConectar);
    };
  }, [conversa.id, adicionar]);

  /*
   * Status do pedido mudou (a empresa avançou ou cancelou): o resumo da MESMA mensagem de pedido é
   * trocado e o acompanhamento na conversa reage sozinho (ele relê o detalhe quando o status muda).
   * Não é mensagem nova — não reordena a conversa nem conta como não lida.
   */
  useStatusPedido(
    useCallback(
      (evento) => {
        if (evento.conversaId !== null && evento.conversaId !== conversa.id) return;
        setReconciliada((atual) => atualizarPedidoNasMensagens(atual, evento.pedido));
      },
      [conversa.id],
    ),
  );

  // Tudo que esta conversa exibe foi recebido por este cliente: confirma o recebimento (ENTREGUE).
  useEffect(() => {
    confirmarRecebimentos(identidadeId, mensagens);
  }, [identidadeId, mensagens]);

  // LIDA somente com a conversa aberta, o histórico já apresentado e a tela visível. Um marcador cobre
  // todas as anteriores; com o app em segundo plano nada é confirmado até ele voltar.
  useEffect(() => {
    if (!historicoCarregado || !conversaVisivel) return;
    const alvo = ultimaMensagemRecebida(mensagens, identidadeId);
    const confirmada = leituraConfirmadaRef.current;
    if (!alvo || (confirmada !== null && alvo.id <= confirmada)) return;

    leituraConfirmadaRef.current = alvo.id;
    void confirmarLeituraConversa(conversa.id, alvo.id).then((resultado) => {
      // Falhou: libera para nova tentativa na próxima mudança (ex.: recarga ao reconectar).
      if (!resultado.ok && leituraConfirmadaRef.current === alvo.id) leituraConfirmadaRef.current = confirmada;
    });
  }, [conversa.id, identidadeId, mensagens, historicoCarregado, conversaVisivel]);

  async function carregarAnteriores() {
    if (!proximoCursor) return;
    const pagina = await listarMensagens(conversa.id, proximoCursor);
    if (!pagina.ok) {
      setErro(pagina.mensagem);
      return;
    }
    adicionar(pagina.dados.mensagens);
    setProximoCursor(pagina.dados.proximoCursor);
  }

  async function enviar(tentativa: TentativaEnvio) {
    setErro(null);
    setOcupado(true);
    setPendente(tentativa);
    try {
      const resultado = await enviarMensagem(conversa.id, tentativa);
      if (resultado.ok) {
        avisarEnvio(resultado.dados.id);
        adicionar([resultado.dados]);
        setPendente(null);
        setTexto("");
        setRespondendo(null);
        return;
      }
      if (resultado.status === 0 || resultado.status >= 500) {
        // Pode ter sido salva ou não: mantém a tentativa para reenviar com o mesmo idCliente.
        setErro("Falha ao enviar. Reenvie para tentar de novo sem duplicar.");
        return;
      }
      setPendente(null);
      setErro(resultado.mensagem);
      // A mensagem citada não vale nesta conversa: descarta a referência e mantém o texto para envio normal.
      if (resultado.codigo === "MENSAGEM_RESPONDIDA_NAO_ENCONTRADA") setRespondendo(null);
      // O servidor recusou por bloqueio (ex.: a outra pessoa acabou de bloquear): mostra o estado real.
      if (resultado.codigo === "COMUNICACAO_BLOQUEADA") void bloqueio.reler();
    } finally {
      setOcupado(false);
    }
  }

  // Galeria ou câmera → imagem preparada (JPEG reduzido) na prévia do compositor. Cancelar não é erro.
  async function escolherImagem(origem: OrigemImagem) {
    setErro(null);
    const resultado = await anexarImagem(origem, { obter: obterImagem, preparar: prepararImagem });
    if (resultado.tipo === "cancelado") return;
    if (resultado.tipo === "falha") {
      setErro(resultado.mensagem);
      return;
    }
    setImagemSelecionada(resultado.imagem);
    campoMensagemRef.current?.focus();
  }

  /*
   * Envia (ou REENVIA) uma tentativa de imagem. A tentativa não muda entre as tentativas: mesmo
   * idCliente, imagem, legenda e resposta — a API devolve 200 com a mensagem já salva se a primeira
   * tiver chegado. A foto aparece na conversa pelo balão pendente desde já.
   */
  async function enviarImagem(tentativa: TentativaImagem, idsAntesDoEnvio: ReadonlySet<string>) {
    setErro(null);
    setImagemPendente({ tentativa, situacao: "enviando", idsAntesDoEnvio });
    const resultado = await enviarMensagemImagem(conversa.id, tentativa);
    if (resultado.ok) {
      avisarEnvio(resultado.dados.id);
      adicionar([resultado.dados]);
      setImagemPendente(null);
      return;
    }
    setErro(mensagemDeFalhaImagem(resultado));
    const destino = destinoDaTentativa(resultado);
    if (destino === "manter") {
      setImagemPendente({ tentativa, situacao: "falhou", idsAntesDoEnvio });
      return;
    }
    setImagemPendente(null);
    if (destino === "sem-resposta") {
      // A mensagem citada não vale mais: a foto volta ao compositor, sem a referência.
      setRespondendo(null);
      setImagemSelecionada(tentativa.imagem);
      setTexto(tentativa.legenda);
    }
    if (resultado.codigo === "COMUNICACAO_BLOQUEADA") void bloqueio.reler();
  }

  /*
   * Envia (ou REENVIA) uma tentativa de áudio: mesmo idCliente, mesmo arquivo, mesma resposta — a API
   * devolve 200 com a mensagem já salva se a primeira tiver chegado.
   */
  async function enviarAudio(tentativa: TentativaAudio, idsAntesDoEnvio: ReadonlySet<string>) {
    setErro(null);
    setAudioPendente({ tentativa, situacao: "enviando", idsAntesDoEnvio });
    const resultado = await enviarMensagemAudio(conversa.id, tentativa);
    if (resultado.ok) {
      avisarEnvio(resultado.dados.id);
      adicionar([resultado.dados]);
      setAudioPendente(null);
      return;
    }
    setErro(mensagemDeFalhaAudio(resultado));
    if (destinoDaTentativaDeAudio(resultado) === "manter") {
      setAudioPendente({ tentativa, situacao: "falhou", idsAntesDoEnvio });
      return;
    }
    setAudioPendente(null);
    if (resultado.codigo === "MENSAGEM_RESPONDIDA_NAO_ENCONTRADA") setRespondendo(null);
    if (resultado.codigo === "COMUNICACAO_BLOQUEADA") void bloqueio.reler();
  }

  // O áudio pronto vira UMA mensagem de áudio (nunca texto + áudio).
  function enviarAudioPronto() {
    if (gravacao.estado.fase !== "pronto" || audioPendente || bloqueada) return;
    const mensagemRespondidaId = respondendo?.mensagemId;
    const tentativa: TentativaAudio = { idCliente: gerarIdCliente(), audio: gravacao.estado.audio, ...(mensagemRespondidaId ? { mensagemRespondidaId } : {}) };
    gravacao.descartar();
    setRespondendo(null);
    void enviarAudio(tentativa, new Set(mensagens.map((mensagem) => mensagem.id)));
  }

  async function salvarEdicao(mensagem: Mensagem, conteudo: string) {
    setErro(null);
    setOcupado(true);
    try {
      const resultado = await editarMensagem(conversa.id, mensagem.id, conteudo);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setReconciliada((atual) => receberAtualizacao(atual, resultado.dados));
      setEditando(null);
      setTexto("");
    } finally {
      setOcupado(false);
    }
  }

  function excluirParaMim(mensagem: Mensagem) {
    Alert.alert("Apagar para mim", "Apagar esta mensagem só para você? As outras pessoas continuarão vendo.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Apagar",
        style: "destructive",
        onPress: () => {
          setErro(null);
          void excluirMensagemParaMim(conversa.id, mensagem.id).then((resultado) => {
            if (!resultado.ok) setErro(resultado.mensagem);
            else setReconciliada((atual) => ocultarMensagem(atual, mensagem.id));
          });
        },
      },
    ]);
  }

  function excluirParaTodos(mensagem: Mensagem) {
    Alert.alert("Apagar para todos", "Apagar esta mensagem para todos? O conteúdo será removido para todos os participantes.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Apagar",
        style: "destructive",
        onPress: () => {
          setErro(null);
          void excluirMensagemParaTodos(conversa.id, mensagem.id).then((resultado) => {
            if (!resultado.ok) setErro(resultado.mensagem);
            else setReconciliada((atual) => receberAtualizacao(atual, resultado.dados));
          });
        },
      },
    ]);
  }

  function aoEnviar() {
    const conteudo = texto.trim();
    // FOTO escolhida: UMA mensagem de imagem, com o texto do campo como legenda (opcional).
    if (imagemSelecionada && !editando) {
      if (bloqueada || imagemPendente) return;
      atividade.pararDigitacao();
      const mensagemRespondidaId = respondendo?.mensagemId;
      const tentativa: TentativaImagem = { idCliente: gerarIdCliente(), imagem: imagemSelecionada, legenda: conteudo, ...(mensagemRespondidaId ? { mensagemRespondidaId } : {}) };
      setImagemSelecionada(null);
      setTexto("");
      setRespondendo(null);
      void enviarImagem(tentativa, new Set(mensagens.map((mensagem) => mensagem.id)));
      return;
    }
    if (!conteudo || ocupado || bloqueada) return;
    if (editando) {
      void salvarEdicao(editando, conteudo);
      return;
    }
    // Enviar encerra o "digitando" imediatamente (o servidor também o encerra ao persistir).
    atividade.pararDigitacao();
    const mensagemRespondidaId = respondendo?.mensagemId;
    const mesmaTentativa = pendente?.conteudo === conteudo && pendente.mensagemRespondidaId === mensagemRespondidaId;
    void enviar(mesmaTentativa ? pendente : { idCliente: gerarIdCliente(), conteudo, ...(mensagemRespondidaId ? { mensagemRespondidaId } : {}) });
  }

  // Responder não interfere no "digitando": só muda a referência da próxima mensagem.
  function responder(mensagem: Mensagem) {
    setRespondendo({
      mensagemId: mensagem.id,
      nomeAutor: rotuloAutorResposta(mensagem.remetenteIdentidadeId, conversa.outraIdentidade.nomeExibicao, identidadeId),
      ...resumirConteudoParaPrevia(conteudoParaPrevia(mensagem)),
    });
    campoMensagemRef.current?.focus();
  }

  // Editar usa o mesmo campo; não é digitação de mensagem nova, então não avisa "digitando".
  function iniciarEdicao(mensagem: Mensagem) {
    atividade.pararDigitacao();
    setRespondendo(null);
    setPendente(null);
    // Editar é de texto: gravação, áudio pronto e foto escolhida (ainda não enviados) saem do compositor.
    gravacao.cancelar();
    gravacao.descartar();
    setImagemSelecionada(null);
    setEditando(mensagem);
    setTexto(mensagem.conteudo);
    campoMensagemRef.current?.focus();
  }

  function cancelarEdicao() {
    setEditando(null);
    setTexto("");
  }

  // Mesmas regras e a mesma ordem do menu da Web (`acoesDisponiveisDaMensagem`); a API impõe cada uma.
  function acoesDaMensagem(mensagem: Mensagem): AcaoMenu[] {
    const executar: Record<IdAcaoMensagem, { icone: AcaoMenu["icone"]; executar: () => void; perigosa?: boolean }> = {
      responder: { icone: "responder", executar: () => responder(mensagem) },
      editar: { icone: "lapis", executar: () => iniciarEdicao(mensagem) },
      "apagar-para-mim": { icone: "lixeira", executar: () => excluirParaMim(mensagem), perigosa: true },
      "apagar-para-todos": { icone: "lixeira", executar: () => excluirParaTodos(mensagem), perigosa: true },
    };
    return acoesDisponiveisDaMensagem(mensagem, identidadeId).map((id) => ({ rotulo: ROTULO_ACAO_MENSAGEM[id], ...executar[id] }));
  }

  function adicionarProduto(
    empresa: Carrinho["empresa"],
    produto: Parameters<typeof adicionarAoCarrinho>[1],
    quantidade: number,
    montagem: { grupos: GrupoOpcoesPublico[]; opcaoIds: string[]; observacao: string | null },
  ) {
    setErroPedido(null);
    // Os nomes e o acréscimo das opções ficam no item só para EXIBIR; o servidor recalcula tudo.
    const escolhas = escolhasDaMontagem(montagem.grupos, montagem.opcaoIds);
    const resultado = adicionarAoCarrinho(empresa, produto, quantidade, escolhas, montagem.observacao);
    if (resultado.tipo === "outra-empresa") {
      setTrocaDeEmpresa({ empresa, produto, quantidade, escolhas, observacao: montagem.observacao, nomeAtual: resultado.empresaAtual.nome });
      return;
    }
    if (resultado.tipo === "limite-de-itens") setErroPedido("O carrinho atingiu o limite de itens diferentes.");
    // No celular o painel NÃO se abre sozinho: quem confirma é a barra "Ver pedido · N itens" do rodapé.
  }

  function confirmarTrocaDeEmpresa() {
    if (!trocaDeEmpresa) return;
    substituirPorEmpresa(trocaDeEmpresa.empresa, trocaDeEmpresa.produto, trocaDeEmpresa.quantidade, trocaDeEmpresa.escolhas, trocaDeEmpresa.observacao);
    setEnderecoEntrega(null);
    void consultarFreteEntrega(null);
    setTrocaDeEmpresa(null);
  }

  /*
   * A empresa está recebendo pedidos agora? Só interessa a quem tem carrinho com ela. O estado e o
   * texto vêm do servidor; a recusa de verdade acontece lá, na confirmação.
   */
  const { funcionamento: funcionamentoDaEmpresa, atualizar: atualizarFuncionamento } = useFuncionamento(carrinho ? conversa.outraIdentidade.identidadeId : null);
  const motivoFechada = motivoDoBloqueio(funcionamentoDaEmpresa);
  const bloqueioDoPedido = motivoFechada
    ? {
        motivo: motivoFechada,
        aoExplicar: () => {
          Alert.alert("Empresa fechada", motivoFechada);
          atualizarFuncionamento();
        },
      }
    : undefined;

  async function confirmarPedido(confirmacao: ConfirmacaoPedido) {
    if (!carrinho) return;
    // Pedido de entrega não é criado sem destino; o servidor confere de novo.
    if (!enderecoEntrega) {
      setEscolhendoEndereco(true);
      return;
    }
    // Sem taxa informada pelo servidor (consultando ou fora da área), não há o que confirmar.
    if (freteEntrega.estado !== "atendido") return;
    const itens = itensParaPedido(carrinho);
    const assinatura = JSON.stringify({ itens, confirmacao, enderecoId: enderecoEntrega.id });
    // Mesmo conteúdo = mesma tentativa: um reenvio após falha de rede não cria um segundo pedido.
    const tentativa = tentativaPedido && tentativaPedido.assinatura === assinatura ? tentativaPedido : { idCliente: gerarIdCliente(), assinatura };
    setTentativaPedido(tentativa);
    setErroPedido(null);
    setEnviandoPedido(true);
    try {
      const resultado = await criarPedido({
        idCliente: tentativa.idCliente,
        empresaIdentidadeId: conversa.outraIdentidade.identidadeId,
        conversaId: conversa.id,
        enderecoId: enderecoEntrega.id,
        itens,
        pagamento:
          confirmacao.forma === "dinheiro"
            ? { forma: "dinheiro", ...(confirmacao.trocoParaCentavos === null ? {} : { trocoParaCentavos: confirmacao.trocoParaCentavos }) }
            : { forma: "cartao" },
      });
      if (!resultado.ok) {
        // A empresa fechou entre montar e confirmar: nada foi criado e o carrinho fica como está.
        if (ehEmpresaFechada(resultado)) atualizarFuncionamento();
        // Falha de rede/servidor: mantém a tentativa para reenviar com o mesmo idCliente.
        setErroPedido(resultado.status === 0 || resultado.status >= 500 ? "Falha ao enviar o pedido. Confirme de novo para tentar sem duplicar." : resultado.mensagem);
        return;
      }
      // Pedido criado: o cardápio sai da frente e o acompanhamento aparece na própria conversa.
      avisarUmaVez("sucesso", `pedido:${resultado.dados.id}`);
      limpar();
      setEnderecoEntrega(null);
      void consultarFreteEntrega(null);
      setTentativaPedido(null);
      setPainelPedidoAberto(false);
      setEscolhendoEndereco(false);
      setCatalogoAberto(false);
    } finally {
      setEnviandoPedido(false);
    }
  }

  // Abre OUTRA conversa direta (ex.: o cliente falando com o entregador a partir do pedido).
  async function conversarCom(nomeUsuario: string) {
    const aberta = await abrirConversaDireta(nomeUsuario);
    if (!aberta.ok) {
      setErro(aberta.mensagem);
      return;
    }
    const outra = aberta.dados.participantes.find((participante) => participante.identidadeId !== identidadeId);
    if (outra) router.push(rotaDaConversa(aberta.dados.id, outra));
  }

  // Identidade ATUAL do outro lado (foto incluída), relida da API; a rota só dá a primeira pintura.
  const outro = useIdentidadeDaConversa(conversa.outraIdentidade, conversa.previaFotoUrl ?? null);
  const itensNoCarrinho = quantidadeTotal(carrinho);
  /*
   * O carrinho é guardado por IDENTIDADE e vale para UMA empresa. Numa conversa com outra empresa ele
   * continua existindo, mas NÃO é exibido aqui: mostrar o pedido da Pizzaria dentro da conversa da
   * Farmácia faria a pessoa confirmar o pedido errado.
   */
  const carrinhoDestaEmpresa = carrinho !== null && carrinho.empresa.identidadeId === outro.identidadeId;
  const temItensNoCarrinho = itensNoCarrinho > 0 && carrinhoDestaEmpresa;
  const carrinhoVisivel = temItensNoCarrinho && painelPedidoAberto;
  // "Seu pedido" tem CONTEÚDO agora? Então ele é a tela, e a conversa e o compositor ficam escondidos.
  const painelPedidoOcupado = trocaDeEmpresa !== null || (carrinhoVisivel && carrinho !== null) || (erroPedido !== null && !carrinhoVisivel);
  // Atalho para o pedido no RODAPÉ: com itens no carrinho e a pessoa na conversa/cardápio.
  const barraPedidoVisivel = podeComprar && temItensNoCarrinho && !painelPedidoOcupado;

  // "Voltar" do Android desfaz primeiro o que está por cima (pedido, endereço, cardápio); só depois sai da conversa.
  useEffect(() => {
    if (!emFoco) return;
    const assinatura = BackHandler.addEventListener("hardwareBackPress", () => {
      if (escolhendoEndereco) setEscolhendoEndereco(false);
      else if (trocaDeEmpresa) setTrocaDeEmpresa(null);
      else if (erroPedido && !carrinhoVisivel) setErroPedido(null);
      else if (painelPedidoAberto) setPainelPedidoAberto(false);
      else if (catalogoAberto) setCatalogoAberto(false);
      else return false;
      return true;
    });
    return () => assinatura.remove();
  }, [emFoco, escolhendoEndereco, trocaDeEmpresa, erroPedido, carrinhoVisivel, painelPedidoAberto, catalogoAberto]);

  // Evento em tempo real pode chegar antes da resposta do envio: aí a foto já está na lista.
  const fotoPendenteVisivel = imagemPendente !== null && !tentativaJaChegou(imagemPendente.tentativa, mensagens, imagemPendente.idsAntesDoEnvio, identidadeId);
  const audioPendenteVisivel = audioPendente !== null && !tentativaDeAudioJaChegou(audioPendente.tentativa, mensagens, audioPendente.idsAntesDoEnvio, identidadeId);
  const anexoDesabilitado = bloqueada || editando !== null || imagemPendente !== null || audioPendente !== null;
  // Um modo de compositor por vez; o microfone só existe no modo normal (campo vazio, nada pendente).
  const modo = modoDoCompositor({
    editando: editando !== null,
    gravando: gravacao.estado.fase === "gravando",
    audioPronto: gravacao.estado.fase === "pronto",
    imagemSelecionada: imagemSelecionada !== null,
    temTexto: texto.trim() !== "",
  });
  const microfoneNoLugarDoEnviar = podeGravar({ modo, bloqueada, midiaPendente: imagemPendente !== null || audioPendente !== null, textoPendente: pendente !== null });
  const rotuloEnvio = editando ? "Salvar" : pendente && !ocupado ? "Reenviar" : "Enviar";
  // Lista INVERTIDA (a mais recente embaixo, junto do compositor): os dados vão do mais novo ao mais antigo.
  const mensagensInvertidas = useMemo(() => [...mensagens].reverse(), [mensagens]);

  if (painelPedidoOcupado) {
    return (
      <View style={estilos.painelPedido}>
        {trocaDeEmpresa && (
          <View accessibilityRole="alert" accessibilityLabel="Trocar de empresa" style={[estilos.trocaDeEmpresa, { marginTop: top + Espaco.quatro }]}>
            <Texto>
              Seu carrinho tem produtos de {trocaDeEmpresa.nomeAtual}. Um pedido é de uma empresa só. Substituir pelo carrinho de {trocaDeEmpresa.empresa.nome}?
            </Texto>
            <View style={estilos.acoesTroca}>
              <Pressable accessibilityRole="button" onPress={confirmarTrocaDeEmpresa} style={estilos.botaoSubstituir}>
                <Texto variante="pequenoMedio" cor="marcaConteudo">
                  Substituir carrinho
                </Texto>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setTrocaDeEmpresa(null)} style={estilos.botaoManter}>
                <Texto variante="pequenoMedio">Manter carrinho atual</Texto>
              </Pressable>
            </View>
          </View>
        )}

        {/* A escolha de endereço substitui visualmente o carrinho, que continua montado por baixo. */}
        {carrinhoVisivel && escolhendoEndereco && (
          // Com o teclado aberto: tocar em "Continuar" funciona no primeiro toque e o campo em foco rola à vista.
          <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={[estilos.rolagemPedido, { paddingTop: top + Espaco.quatro, paddingBottom: bottom + Espaco.quatro }]}>
            <EtapaEnderecoEntrega
              empresaIdentidadeId={outro.identidadeId}
              aoSelecionar={(endereco) => {
                setEnderecoEntrega(endereco);
                // Trocar de endereço pode trocar de zona: a taxa é perguntada de novo ao servidor.
                void consultarFreteEntrega(endereco);
                setEscolhendoEndereco(false);
              }}
              aoVoltar={() => setEscolhendoEndereco(false)}
            />
          </ScrollView>
        )}

        {carrinhoVisivel && carrinho && (
          <View style={escolhendoEndereco ? estilos.oculto : estilos.flex}>
            <PainelCarrinho
              carrinho={carrinho}
              endereco={enderecoEntrega}
              frete={freteEntrega}
              enviando={enviandoPedido}
              erro={erroPedido}
              bloqueio={bloqueioDoPedido}
              aoAlterarQuantidade={alterarQuantidade}
              aoRemover={remover}
              aoTrocarEndereco={() => setEscolhendoEndereco(true)}
              aoConfirmar={(confirmacao) => void confirmarPedido(confirmacao)}
              aoFechar={() => setPainelPedidoAberto(false)}
              aoLimpar={() =>
                Alert.alert("Limpar pedido", "Remover todos os itens do seu pedido?", [
                  { text: "Cancelar", style: "cancel" },
                  {
                    text: "Remover",
                    style: "destructive",
                    onPress: () => {
                      limpar();
                      setEnderecoEntrega(null);
                      void consultarFreteEntrega(null);
                    },
                  },
                ])
              }
            />
          </View>
        )}

        {erroPedido && !carrinhoVisivel && !trocaDeEmpresa && <AvisoDoPedido texto={erroPedido} tom="perigo" aoFechar={() => setErroPedido(null)} />}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={estilos.tela}>
      <CabecalhoConversa
        outraIdentidade={outro}
        presenca={atividade.presenca}
        digitando={atividade.outraDigitando}
        aoVoltar={() => router.back()}
        bloqueada={bloqueada}
        acoes={
          <>
            {outro.tipo === "empresarial" && (
              <>
                <BotaoCabecalho ativo={!catalogoAberto} titulo={catalogoAberto ? "Voltar à conversa" : "Ver cardápio"} aoTocar={() => setCatalogoAberto((aberto) => !aberto)}>
                  <Icone nome={catalogoAberto ? "conversa" : "loja"} cor={catalogoAberto ? "conteudoSuave" : "marca"} />
                </BotaoCabecalho>
                {/* Abre o MESMO painel "Seu pedido" — nunca um segundo carrinho. */}
                {podeComprar && temItensNoCarrinho && (
                  <BotaoCabecalho
                    ativo={false}
                    titulo={`Seu pedido (${itensNoCarrinho} ${itensNoCarrinho === 1 ? "item" : "itens"})`}
                    aoTocar={() => setPainelPedidoAberto(true)}
                    marcador={
                      <View style={estilos.marcadorCesta}>
                        <Texto variante="miniForte" cor="marcaConteudo">
                          {itensNoCarrinho}
                        </Texto>
                      </View>
                    }>
                    <Icone nome="cesta" />
                  </BotaoCabecalho>
                )}
              </>
            )}
            {/* O MESMO menu (e as mesmas ações) do toque longo na lista: limpar, apagar, bloquear/desbloquear. */}
            <BotaoCabecalho ativo={false} titulo={`Opções da conversa com ${outro.nomeExibicao}`} aoTocar={() => setMenuConversaAberto(true)}>
              <Icone nome="maisAcoes" />
            </BotaoCabecalho>
          </>
        }
      />

      {/* CENTRO. O CARDÁPIO ocupa o lugar das mensagens quando aberto; o compositor fica sempre no rodapé. */}
      {catalogoAberto && outro.tipo === "empresarial" ? (
        <ScrollView style={estilos.flex} keyboardShouldPersistTaps="handled">
          <CatalogoDaEmpresa identidadeEmpresaId={outro.identidadeId} aoFechar={() => setCatalogoAberto(false)} {...(podeComprar ? { aoAdicionarAoCarrinho: adicionarProduto } : {})} />
        </ScrollView>
      ) : mensagens.length === 0 && !fotoPendenteVisivel && !audioPendenteVisivel ? (
        <View style={estilos.vazio}>
          {historicoCarregado ? (
            <>
              <Texto variante="corpoForte">Nenhuma mensagem ainda</Texto>
              <Texto cor="conteudoSuave" style={estilos.centro}>
                Escreva a primeira mensagem aqui embaixo.
              </Texto>
            </>
          ) : (
            !erro && <Texto cor="conteudoSuave">Carregando mensagens…</Texto>
          )}
        </View>
      ) : (
        <FlatList
          inverted
          data={mensagensInvertidas}
          keyExtractor={(mensagem) => mensagem.id}
          accessibilityLabel="Mensagens"
          style={estilos.flex}
          contentContainerStyle={estilos.mensagens}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={Espacador}
          // Na lista invertida o "cabeçalho" fica EMBAIXO: é onde entra a foto que ainda está em envio.
          ListHeaderComponent={
            audioPendente && audioPendenteVisivel ? (
              <BalaoAudioPendente
                audio={audioPendente.tentativa.audio}
                situacao={audioPendente.situacao}
                aoReenviar={() => void enviarAudio(audioPendente.tentativa, audioPendente.idsAntesDoEnvio)}
                aoDescartar={() => {
                  setAudioPendente(null);
                  setErro(null);
                }}
              />
            ) : imagemPendente && fotoPendenteVisivel ? (
              <BalaoImagemPendente
                imagem={imagemPendente.tentativa.imagem}
                legenda={imagemPendente.tentativa.legenda}
                situacao={imagemPendente.situacao}
                aoReenviar={() => void enviarImagem(imagemPendente.tentativa, imagemPendente.idsAntesDoEnvio)}
                aoDescartar={() => {
                  setImagemPendente(null);
                  setErro(null);
                }}
              />
            ) : null
          }
          // Na lista invertida o "rodapé" fica no ALTO: é onde mora o histórico mais antigo.
          ListFooterComponent={
            proximoCursor ? (
              <Pressable accessibilityRole="button" onPress={() => void carregarAnteriores()} style={estilos.carregarAnteriores}>
                <Texto variante="pequenoMedio">Carregar anteriores</Texto>
              </Pressable>
            ) : null
          }
          renderItem={({ item: mensagem, index }) => {
            // Na ordem cronológica, a mensagem ANTERIOR é a seguinte desta lista invertida.
            const anterior = mensagensInvertidas[index + 1];
            // Separador de dia: sem marcos, uma conversa longa vira um bloco só.
            const abreDia = !anterior || !mesmoDia(new Date(anterior.criadoEm), new Date(mensagem.criadoEm));
            return (
              <View>
                {abreDia && (
                  <View style={estilos.separadorDia}>
                    <View style={estilos.rotuloDia}>
                      <Texto variante="mini" cor="conteudoSuave" style={estilos.semi}>
                        {rotuloDoDia(mensagem.criadoEm)}
                      </Texto>
                    </View>
                  </View>
                )}
                <BalaoMensagem
                  mensagem={mensagem}
                  identidadeAtualId={identidadeId}
                  nomeRemetente={outro.nomeExibicao}
                  aoPedirAcoes={(tocada) => setAcoesDaMensagemAberta(acoesDaMensagem(tocada))}
                  aoConversarCom={(nomeUsuario) => void conversarCom(nomeUsuario)}
                  estadoImagem={estadoDaImagem(mensagem.id)}
                  estadoAudio={estadoDoAudio(mensagem.id)}
                  aoFalharAudio={(falhou) => void cacheAudios.aoFalharCarregamento(falhou.id)}
                  aoCarregarAudio={(carregou) => cacheAudios.aoCarregar(carregou.id)}
                  aoAbrirImagem={(aberta, url) => setImagemAberta({ url, descricao: aberta.conteudo || "Foto" })}
                  aoFalharImagem={(falhou) => void cacheImagens.aoFalharCarregamento(falhou.id)}
                  aoCarregarImagem={(carregou) => cacheImagens.aoCarregar(carregou.id)}
                />
              </View>
            );
          }}
        />
      )}

      {/* Atalho compacto para o pedido, acima do compositor: o mesmo painel e o mesmo estado do ícone do cabeçalho. */}
      {barraPedidoVisivel && (
        <View style={estilos.faixa}>
          <Pressable accessibilityRole="button" onPress={() => setPainelPedidoAberto(true)} style={({ pressed }) => [estilos.verPedido, pressed && estilos.pressionado]}>
            <View style={estilos.verPedidoRotulo}>
              <Icone nome="cesta" tamanho={16} cor="marcaConteudo" />
              <Texto variante="corpoMedio" cor="marcaConteudo">
                Ver pedido
              </Texto>
            </View>
            <View style={estilos.verPedidoItens}>
              <Texto variante="pequeno" cor="marcaConteudo">
                {itensNoCarrinho} {itensNoCarrinho === 1 ? "item" : "itens"}
              </Texto>
            </View>
          </Pressable>
        </View>
      )}

      {/*
        Compositor: a faixa é TRANSPARENTE (o papel de parede aparece em volta do campo) e o campo é UMA
        PÍLULA — anexar, texto e enviar no mesmo retângulo arredondado, como na Web.
      */}
      <View style={[estilos.faixa, { paddingBottom: Math.max(bottom, Espaco.dois) }]}>
        {respondendo && (
          <View accessibilityLabel="Resposta em composição" style={estilos.contexto}>
            <View style={estilos.flex}>
              <ReferenciaResposta nomeAutor={respondendo.nomeAutor} previaConteudo={respondendo.previaConteudo} conteudoTruncado={respondendo.conteudoTruncado} />
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancelar resposta" hitSlop={8} onPress={() => setRespondendo(null)} style={estilos.cancelarContexto}>
              <Icone nome="fechar" tamanho={16} />
            </Pressable>
          </View>
        )}
        {editando && (
          <View accessibilityLabel="Editando mensagem" style={estilos.contexto}>
            <View style={[estilos.flex, estilos.contextoEdicao]}>
              <Texto variante="pequenoForte" cor="aviso" style={estilos.semi}>
                Editando mensagem
              </Texto>
              <Texto variante="pequeno" cor="conteudoSuave" numberOfLines={2}>
                {editando.conteudo}
              </Texto>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancelar edição" hitSlop={8} onPress={cancelarEdicao} style={estilos.cancelarContexto}>
              <Icone nome="fechar" tamanho={16} />
            </Pressable>
          </View>
        )}

        {imagemSelecionada && !editando && <PreviaImagemCompositor uri={imagemSelecionada.uri} aoRemover={() => setImagemSelecionada(null)} />}

        {/*
          MENSAGEM DE VOZ: enquanto grava, ou com um áudio pronto, estes controles OCUPAM o lugar da
          pílula de texto — um modo por vez, nunca texto e áudio juntos.
        */}
        {modo === "gravando" && gravacao.estado.fase === "gravando" && (
          <GravandoAudio decorridoMs={gravacao.estado.decorridoMs} aoCancelar={gravacao.cancelar} aoParar={gravacao.parar} />
        )}
        {modo === "audio-pronto" && gravacao.estado.fase === "pronto" && (
          <AudioProntoParaEnviar
            uri={gravacao.estado.audio.uri}
            duracaoMs={gravacao.estado.audio.duracaoMs}
            aoDescartar={gravacao.descartar}
            aoEnviar={enviarAudioPronto}
            desabilitado={bloqueada || audioPendente !== null}
          />
        )}

        <View style={[estilos.pilula, (modo === "gravando" || modo === "audio-pronto") && estilos.oculto]}>
          {/* ANEXAR foto (galeria ou câmera). Uma por vez: com uma foto em envio, ela se resolve antes. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Anexar foto"
            disabled={anexoDesabilitado}
            hitSlop={4}
            onPress={() => setMenuAnexoAberto(true)}
            style={({ pressed }) => [estilos.anexo, anexoDesabilitado && estilos.inativo, pressed && estilos.pressionado]}>
            <Icone nome="anexo" />
          </Pressable>
          <TextInput
            ref={campoMensagemRef}
            value={texto}
            editable={!bloqueada}
            placeholder={bloqueada ? "" : imagemSelecionada && !editando ? "Legenda (opcional)…" : "Digite uma mensagem…"}
            placeholderTextColor={Cores.conteudoSuave}
            accessibilityLabel="Mensagem"
            // Focado, o campo fica IGUAL ao repouso (como na Web): sem linha, borda ou anel — só o cursor.
            underlineColorAndroid="transparent"
            onChangeText={(valor) => {
              setTexto(valor);
              if (!editando) atividade.informarTexto(valor);
            }}
            maxLength={4000}
            // Uma linha, como na Web: a tecla de enviar do teclado envia.
            returnKeyType="send"
            submitBehavior="submit"
            onSubmitEditing={aoEnviar}
            style={estilos.campo}
          />
          {/* Campo vazio, nada em composição e nada pendente: o lugar do "enviar" é do microfone. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={microfoneNoLugarDoEnviar ? "Gravar áudio" : rotuloEnvio}
            disabled={microfoneNoLugarDoEnviar ? gravacao.estado.fase === "pedindo-microfone" : ocupado || bloqueada}
            onPress={microfoneNoLugarDoEnviar ? () => void gravacao.iniciar() : aoEnviar}
            style={({ pressed }) => [estilos.enviar, !microfoneNoLugarDoEnviar && rotuloEnvio !== "Enviar" && estilos.enviarComTexto, (ocupado || bloqueada) && estilos.inativo, pressed && estilos.pressionado]}>
            {microfoneNoLugarDoEnviar ? (
              <Icone nome="microfone" tamanho={18} cor="marcaConteudo" />
            ) : rotuloEnvio === "Enviar" ? (
              <Icone nome="enviar" tamanho={16} cor="marcaConteudo" />
            ) : (
              <Texto variante="pequenoMedio" cor="marcaConteudo">
                {rotuloEnvio}
              </Texto>
            )}
          </Pressable>
        </View>

        {erro && (
          <Texto cor="perigo" accessibilityRole="alert" style={estilos.erro}>
            {erro}
          </Texto>
        )}
      </View>

      <MenuAcoes
        titulo="Anexar"
        aberto={menuAnexoAberto}
        aoFechar={() => setMenuAnexoAberto(false)}
        acoes={OPCOES_ANEXO.map((opcao) => ({ rotulo: opcao.rotulo, icone: opcao.icone, executar: () => void escolherImagem(opcao.origem) }))}
      />
      <VisualizadorImagem url={imagemAberta?.url ?? null} descricao={imagemAberta?.descricao ?? "Foto"} aoFechar={() => setImagemAberta(null)} />
      <MenuAcoes aberto={acoesDaMensagemAberta !== null} aoFechar={() => setAcoesDaMensagemAberta(null)} acoes={acoesDaMensagemAberta ?? []} />
      <AcoesDaConversa alvo={{ id: conversa.id, outraIdentidade: outro }} aberto={menuConversaAberto} aoFechar={() => setMenuConversaAberto(false)} aoExecutar={aoAcaoConversa} />
    </KeyboardAvoidingView>
  );
}

function Espacador() {
  return <View style={estilos.espacador} />;
}

const estilos = StyleSheet.create({
  tela: { backgroundColor: Cores.conversaFundo, flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  oculto: { display: "none" },
  painelPedido: { backgroundColor: Cores.superficie, flex: 1 },
  rolagemPedido: { paddingHorizontal: Espaco.quatro },
  trocaDeEmpresa: { backgroundColor: "#FDF8EB", borderColor: Cores.ouro, borderRadius: Raio.bloco, borderWidth: 1, gap: Espaco.dois, marginHorizontal: Espaco.quatro, padding: Espaco.tres },
  acoesTroca: { flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois },
  botaoSubstituir: { alignItems: "center", backgroundColor: Cores.marca, borderRadius: Raio.compacto, justifyContent: "center", minHeight: 40, paddingHorizontal: Espaco.quatro },
  botaoManter: { alignItems: "center", borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, justifyContent: "center", minHeight: 40, paddingHorizontal: Espaco.quatro },
  marcadorCesta: { alignItems: "center", backgroundColor: Cores.marca, borderRadius: 8, height: 16, justifyContent: "center", minWidth: 16, paddingHorizontal: 4, position: "absolute", right: 2, top: 2 },
  vazio: { alignItems: "center", flex: 1, gap: Espaco.um, justifyContent: "center", paddingHorizontal: Espaco.cinco },
  centro: { textAlign: "center" },
  mensagens: { paddingVertical: Espaco.cinco },
  espacador: { height: Espaco.tres },
  carregarAnteriores: { alignItems: "center", alignSelf: "center", backgroundColor: Cores.superficie, borderRadius: Raio.compacto, elevation: 1, justifyContent: "center", marginBottom: Espaco.tres, minHeight: 36, paddingHorizontal: Espaco.quatro },
  separadorDia: { alignItems: "center", paddingBottom: Espaco.tres, paddingTop: Espaco.um },
  rotuloDia: { backgroundColor: Cores.superficie, borderRadius: Raio.total, elevation: 1, paddingHorizontal: Espaco.tres, paddingVertical: Espaco.um },
  semi: { fontWeight: "600" },
  faixa: { gap: 6, paddingHorizontal: Espaco.dois, paddingTop: Espaco.um },
  verPedido: { alignItems: "center", backgroundColor: Cores.marca, borderRadius: Raio.total, elevation: 1, flexDirection: "row", gap: Espaco.dois, justifyContent: "space-between", minHeight: 44, paddingHorizontal: Espaco.quatro },
  verPedidoRotulo: { alignItems: "center", flexDirection: "row", gap: Espaco.dois },
  verPedidoItens: { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: Raio.compacto, paddingHorizontal: Espaco.dois, paddingVertical: 2 },
  pressionado: { opacity: 0.85 },
  contexto: { alignItems: "flex-start", backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.bloco, borderWidth: 1, flexDirection: "row", gap: Espaco.dois, padding: 6 },
  contextoEdicao: { backgroundColor: "rgba(0,157,114,0.05)", borderLeftColor: "#F5D789", borderLeftWidth: 4, borderRadius: 4, paddingHorizontal: Espaco.dois, paddingVertical: Espaco.um },
  cancelarContexto: { alignItems: "center", height: 28, justifyContent: "center", width: 28 },
  pilula: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.total, borderWidth: 1, elevation: 1, flexDirection: "row", gap: Espaco.um, padding: Espaco.um },
  anexo: { alignItems: "center", height: 36, justifyContent: "center", width: 36 },
  campo: { color: Cores.conteudo, flex: 1, fontSize: 16, minHeight: 36, minWidth: 0, paddingHorizontal: Espaco.dois, paddingVertical: 0 },
  enviar: { alignItems: "center", backgroundColor: Cores.marca, borderRadius: Raio.total, height: 36, justifyContent: "center", width: 36 },
  enviarComTexto: { paddingHorizontal: 14, width: "auto" },
  inativo: { opacity: 0.5 },
  erro: { paddingHorizontal: Espaco.dois },
});
