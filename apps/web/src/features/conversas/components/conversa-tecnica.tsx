"use client";

import {
  EVENTO_MENSAGEM_ATUALIZADA,
  EVENTO_MENSAGEM_EXCLUIDA_PARA_MIM,
  EVENTO_MENSAGEM_NOVA,
  EVENTO_MENSAGENS_ENTREGUES,
  EVENTO_MENSAGENS_LIDAS,
  eventoMensagemAtualizadaSchema,
  eventoMensagemExcluidaParaMimSchema,
  eventoMensagemNovaSchema,
  eventoMensagensEntreguesSchema,
  eventoMensagensLidasSchema,
  type ExclusaoParaMim,
  type GrupoOpcoesPublico,
  type Mensagem,
  type IdentidadeVisivel,
  type EnderecoCliente,
  type TipoIdentidade,
} from "@jaa/contratos";
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  IconeCesta,
  IconeConversa,
  IconeEnviar,
  IconeLoja,
  IconePedidos,
} from "@/components/ui/icones";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { useAtividadeConversa } from "../hooks/use-atividade-conversa";
import { useDocumentoVisivel } from "../hooks/use-documento-visivel";
import { useTelaLarga } from "../hooks/use-tela-larga";
import {
  confirmarLeituraConversa,
  editarMensagem,
  enviarMensagem,
  enviarMensagemAudio,
  enviarMensagemImagem,
  excluirMensagemParaMim,
  excluirMensagemParaTodos,
  listarMensagens,
} from "../lib/api-conversas";
import { confirmarRecebimentos } from "../lib/confirmar-recebimentos";
import {
  conversaVazia,
  ocultarMensagem,
  receberAtualizacao,
  receberEntrega,
  receberLeitura,
  receberMensagens,
  atualizarPedidoNasMensagens,
  ultimaMensagemRecebida,
} from "../lib/estados-mensagens";
import { mesmoDia, rotuloDoDia } from "../lib/horarios";
import {
  resumirConteudoParaPrevia,
  rotuloAutorResposta,
} from "../lib/respostas";
import { CatalogoDaEmpresa } from "@/features/catalogo/components/catalogo-da-empresa";
import { useFuncionamento } from "@/features/catalogo/hooks/use-funcionamento";
import {
  PainelCarrinho,
  PainelPedidoVazio,
  type ConfirmacaoPedido,
} from "@/features/carrinho/components/painel-carrinho";
import { EtapaEnderecoEntrega } from "@/features/enderecos/components/etapa-endereco-entrega";
import { useCarrinho } from "@/features/carrinho/hooks/use-carrinho";
import { useFreteEntrega } from "@/features/carrinho/hooks/use-frete-entrega";
import {
  escolhasDaMontagem,
  itensParaPedido,
  quantidadeTotal,
  type Carrinho,
  type EscolhaCarrinho,
} from "@/features/carrinho/lib/carrinho";
import { useStatusPedido } from "@/features/pedidos/hooks/use-status-pedido";
import { criarPedido } from "@/features/pedidos/lib/api-pedidos";
import { BalaoAudioPendente } from "./balao-audio-pendente";
import { BalaoImagemPendente } from "./balao-imagem-pendente";
import { AudioProntoParaEnviar, BotaoGravarAudio, GravandoAudio } from "./gravacao-audio-compositor";
import { useGravacaoAudio } from "../hooks/use-gravacao-audio";
import { destinoDaTentativaDeAudio, mensagemDeFalhaAudio, modoDoCompositor, podeGravar, tentativaDeAudioJaChegou, type TentativaAudio } from "../lib/audio-conversa";
import { BalaoMensagem } from "./balao-mensagem";
import { BotaoAnexarImagem } from "./botao-anexar-imagem";
import { LightboxImagem } from "./lightbox-imagem";
import { PreviaImagemCompositor } from "./previa-imagem-compositor";
import { useUrlsAudios, useUrlsImagens } from "../hooks/use-urls-imagens";
import {
  conteudoParaPrevia,
  destinoDaTentativa,
  mensagemDeFalhaImagem,
  tentativaJaChegou,
  validarArquivoImagem,
  type TentativaImagem,
} from "../lib/imagem-conversa";
import { criarUrlsLocais } from "../lib/urls-locais";
import { BarraContextoCompositor } from "./barra-contexto-compositor";
import { avisar } from "@/components/ui/avisos";
import { PerfilDaIdentidade } from "@/features/perfil/components/perfil-da-identidade";
import { definirConversaAberta } from "../lib/conversa-em-leitura";
import { CabecalhoConversa } from "./cabecalho-conversa";
import { useBloqueioConversa } from "../hooks/use-bloqueio-conversa";
import { AcoesDaConversa, type AcaoConversa, type AlvoAcaoConversa } from "./acoes-conversa";
import {
  PreviaRespostaCompositor,
  type RespostaEmComposicao,
} from "./previa-resposta-compositor";

/*
 * A CONVERSA ABERTA: cabeçalho fixo, mensagens rolando no meio e compositor embaixo — o formato da
 * referência de UI/UX aprovada. Autorização, remetente, persistência e idempotência continuam sendo
 * impostos pela API; esta camada só apresenta.
 *
 * Os painéis de comércio (cardápio, "Seu pedido", endereço, acompanhamento) têm rolagem própria e
 * mudam de LUGAR conforme a tela, sem mudar de componente nem de estado:
 *
 *   - no desktop largo (xl) são a TERCEIRA COLUNA, ao lado da conversa — é o formato
 *     "Conversas | Conversa | Seu pedido" da referência de UI/UX aprovada;
 *   - abaixo disso ficam acima das mensagens, com altura limitada.
 *
 * Em qualquer um dos casos eles nunca empurram o compositor para fora da tela.
 */

/**
 * Botão do cabeçalho da conversa: SÓ ÍCONE. O texto vive em `aria-label` e `title`, então o
 * significado continua disponível para leitor de tela e ao passar o mouse, sem ocupar a barra.
 * `aria-pressed` comunica o estado ligado/desligado; `aria-expanded`, quando o botão abre um painel.
 */
function BotaoCabecalho({
  ativo,
  expandido,
  titulo,
  marcador,
  dados,
  aoClicar,
  children,
}: {
  ativo: boolean;
  expandido?: boolean;
  titulo: string;
  // Badge posicionado sobre o ícone (ex.: quantidade do carrinho).
  marcador?: ReactNode;
  dados?: Record<string, boolean>;
  aoClicar: () => void;
  children: ReactNode;
}) {
  return (
    <button
      {...dados}
      type="button"
      onClick={aoClicar}
      title={titulo}
      aria-label={titulo}
      {...(expandido === undefined
        ? { "aria-pressed": ativo }
        : { "aria-expanded": expandido })}
      className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-jaa-compacto border transition-colors sm:h-9 sm:w-9 ${
        ativo
          ? "border-selecionado-borda bg-selecionado-fundo text-marca"
          : "border-transparent text-conteudo-suave hover:bg-realce hover:text-conteudo"
      }`}
    >
      {children}
      {marcador}
    </button>
  );
}

// A referência de resposta faz parte da tentativa: reenviar reutiliza idCliente, conteúdo e referência.
type TentativaEnvio = {
  idCliente: string;
  conteudo: string;
  mensagemRespondidaId?: string;
};

// Pedido a criar; reenviar a mesma confirmação reutiliza idCliente (idempotência imposta pela API).
type TentativaPedido = { idCliente: string; assinatura: string };

// Aberta pela lista ou pelo @usuario; a autorização de leitura/envio continua sendo da API.
export type ConversaAberta = {
  id: string;
  outraIdentidade: IdentidadeVisivel;
  // Vinda do Link do Jaa de uma empresa com cardápio: a conversa já abre com ele à mostra.
  abrirCardapio?: boolean;
};

export function ConversaTecnica({
  identidadeId,
  tipoIdentidade = "pessoal",
  conversa,
  aoVoltar,
  inicioCabecalho,
  aoAbrirPedidos,
  aoMensagemConfirmada,
  aoMensagemAtualizada,
  aoMensagemExcluidaParaMim,
  aoConversarCom,
  aoAcaoConversa,
}: {
  identidadeId: string;
  // Só identidade PESSOAL compra; a empresa participa da conversa, não faz pedido de si mesma.
  tipoIdentidade?: TipoIdentidade;
  conversa: ConversaAberta;
  // Só no celular: a conversa ocupa a tela toda e o cabeçalho ganha o caminho de volta para a lista.
  aoVoltar?: () => void;
  // Controle do layout (reabrir o painel lateral recolhido), exibido no começo do cabeçalho.
  inicioCabecalho?: ReactNode;
  /*
   * Abre a área de pedidos que JÁ existe no aplicativo. Ausente quando a identidade atual não tem
   * essa área — não se inventa destino nem fluxo novo de pedidos para preencher um ícone.
   */
  aoAbrirPedidos?: (() => void) | undefined;
  // A resposta HTTP do envio também atualiza a lista, mesmo sem realtime.
  aoMensagemConfirmada: (mensagem: Mensagem) => void;
  // Idem para alterações (edição/exclusão) feitas por esta aba.
  aoMensagemAtualizada: (mensagem: Mensagem) => void;
  aoMensagemExcluidaParaMim: (exclusao: ExclusaoParaMim) => void;
  // Abre OUTRA conversa direta (ex.: o cliente falando com o entregador a partir do pedido).
  aoConversarCom?: ((nomeUsuario: string) => void) | undefined;
  // O MESMO executor de ações do menu da lista (limpar, apagar, bloquear/desbloquear).
  aoAcaoConversa?: ((acao: AcaoConversa, alvo: AlvoAcaoConversa) => Promise<string | null>) | undefined;
}) {
  const [reconciliada, setReconciliada] = useState(conversaVazia);
  const mensagens = reconciliada.mensagens;
  const [historicoCarregado, setHistoricoCarregado] = useState(false);
  const documentoVisivel = useDocumentoVisivel();
  // Maior marcador de leitura já enviado (ou em envio) por esta aba para esta conversa.
  const leituraConfirmadaRef = useRef<string | null>(null);
  const [proximoCursor, setProximoCursor] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  // Bloqueio de mensagens com a outra PESSOA (servidor é a verdade). Bloquear/desbloquear fica no menu da lista.
  const bloqueio = useBloqueioConversa(conversa.outraIdentidade.identidadeId);
  const bloqueada = bloqueio.situacao !== null && (bloqueio.situacao.euBloqueei || bloqueio.situacao.fuiBloqueado);
  const [pendente, setPendente] = useState<TentativaEnvio | null>(null);
  // IMAGEM escolhida (prévia local) antes do envio: o campo de texto passa a ser a legenda.
  const [imagemSelecionada, setImagemSelecionada] = useState<{ arquivo: File; previaUrl: string } | null>(null);
  /*
   * Tentativa de IMAGEM em envio ou que falhou: aparece como balão local até a resposta da API.
   * Guarda a tentativa inteira (idCliente, arquivo, legenda, resposta) para o Reenviar ser o MESMO envio.
   */
  const [imagemPendente, setImagemPendente] = useState<{
    tentativa: TentativaImagem;
    situacao: "enviando" | "falhou";
    idsAntesDoEnvio: ReadonlySet<string>;
  } | null>(null);
  const [imagemAberta, setImagemAberta] = useState<{ mensagemId: string; descricao: string } | null>(null);
  // Prévias locais (object URLs): toda URL criada é revogada — ao trocar, cancelar, concluir ou sair.
  // MENSAGEM DE VOZ em envio (ou que falhou): mesma mecânica da foto pendente.
  const [audioPendente, setAudioPendente] = useState<{ tentativa: TentativaAudio; situacao: "enviando" | "falhou"; idsAntesDoEnvio: ReadonlySet<string> } | null>(null);
  const [urlsLocais] = useState(() => criarUrlsLocais());
  useEffect(() => () => urlsLocais.revogarTodas(), [urlsLocais]);
  const [respostaSelecionada, setRespondendo] =
    useState<RespostaEmComposicao | null>(null);
  // Mensagem própria em edição: o compositor passa a salvar o novo conteúdo em vez de enviar.
  const [edicaoSelecionada, setEditando] = useState<Mensagem | null>(null);
  // Resposta/edição só valem enquanto a mensagem continua visível e não excluída (ex.: excluída em outra aba).
  const disponivel = (id: string) =>
    mensagens.some((mensagem) => mensagem.id === id && !mensagem.excluidaEm);
  const respondendo =
    respostaSelecionada && disponivel(respostaSelecionada.mensagemId)
      ? respostaSelecionada
      : null;
  const editando =
    edicaoSelecionada && disponivel(edicaoSelecionada.id)
      ? edicaoSelecionada
      : null;
  const campoMensagemRef = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Catálogo (consulta de cliente) aberto dentro da conversa com uma empresa.
  const [catalogoAberto, setCatalogoAberto] = useState(
    conversa.abrirCardapio === true && conversa.outraIdentidade.tipo === "empresarial",
  );
  /*
   * O som de mensagem (no app inteiro) precisa saber qual conversa está NA TELA. Com o cardápio no
   * lugar das mensagens a pessoa não as está vendo: a conversa deixa de contar, e a mensagem toca.
   * Fechar a conversa ou sair para outra área limpa o registro.
   */
  const mensagensAVista = !catalogoAberto;
  useEffect(() => {
    definirConversaAberta(mensagensAVista ? conversa.id : null);
    return () => definirConversaAberta(null);
  }, [conversa.id, mensagensAVista]);
  // "Copiar" no menu da mensagem: o texto vai para a área de transferência, com um aviso curto.
  async function copiarMensagem(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      avisar.sucesso("Mensagem copiada");
    } catch {
      avisar.erro("Não foi possível copiar a mensagem.");
    }
  }
  // Perfil da outra identidade, aberto pelo nome/foto do cabeçalho.
  const [perfilAberto, setPerfilAberto] = useState(false);
  const fecharPerfil = useCallback(() => setPerfilAberto(false), []);
  // Carrinho + pedido: só existem quando uma pessoa conversa com uma empresa.
  const podeComprar =
    tipoIdentidade === "pessoal" &&
    conversa.outraIdentidade.tipo === "empresarial";
  const {
    carrinho,
    adicionar: adicionarAoCarrinho,
    substituirPorEmpresa,
    alterarQuantidade,
    remover,
    limpar,
    sincronizarImagens,
  } = useCarrinho(identidadeId);
  /*
   * "Seu pedido" tem TRÊS estados de propósito, porque a expectativa muda com o tamanho da tela:
   *
   *   - "automatico": no desktop largo ele é uma COLUNA permanente (aparece só por haver itens);
   *     no celular, onde cobriria a conversa, fica guardado até a pessoa pedir;
   *   - "aberto"/"fechado": a pessoa decidiu, e a decisão vale nos dois tamanhos.
   *
   * Assim a visibilidade é DERIVADA (sem efeito sincronizando estado com o tamanho da tela), e
   * adicionar um item volta para "automatico" em vez de forçar o painel no celular.
   */
  const [painelPedido, setPainelPedido] = useState<
    "automatico" | "aberto" | "fechado"
  >("automatico");
  const telaLarga = useTelaLarga();
  // Destino escolhido para este pedido (com ponto já confirmado no mapa).
  const [enderecoEntrega, setEnderecoEntrega] =
    useState<EnderecoCliente | null>(null);
  // Taxa de entrega do destino, informada pelo servidor a cada escolha/troca de endereço.
  const { frete: freteEntrega, consultar: consultarFreteEntrega } =
    useFreteEntrega(conversa.outraIdentidade.identidadeId);
  const [escolhendoEndereco, setEscolhendoEndereco] = useState(false);
  // Carrinho aberto de OUTRA empresa: pergunta antes de substituir; nunca troca em silêncio.
  const [trocaDeEmpresa, setTrocaDeEmpresa] = useState<{
    empresa: Carrinho["empresa"];
    produto: Parameters<typeof adicionarAoCarrinho>[1];
    quantidade: number;
    // A montagem também é guardada: substituir o carrinho não pode perder o que a pessoa escolheu.
    escolhas: EscolhaCarrinho[];
    observacao: string | null;
    nomeAtual: string;
  } | null>(null);
  const [tentativaPedido, setTentativaPedido] =
    useState<TentativaPedido | null>(null);
  const [enviandoPedido, setEnviandoPedido] = useState(false);
  const [erroPedido, setErroPedido] = useState<string | null>(null);
  // Posição do PRÓPRIO pedido na saída (situação + quantas entregas antes). Nunca a rota.
  const atividade = useAtividadeConversa({
    conversaId: conversa.id,
    outraIdentidadeId: conversa.outraIdentidade.identidadeId,
  });
  const listaMensagensRef = useRef<HTMLOListElement>(null);
  const ultimaMensagemId = mensagens.at(-1)?.id;
  // URLs privadas das imagens desta conversa: só em memória, pedidas em lote, renovadas quando vencem.
  const { estadoDaImagem, cache: cacheImagens } = useUrlsImagens(conversa.id, mensagens);
  // Mesma regra para os áudios (outra rota, o mesmo cache em memória).
  const { estadoDaImagem: estadoDoAudio, cache: cacheAudios } = useUrlsAudios(conversa.id, mensagens);
  const imagemPendenteId = imagemPendente?.tentativa.idCliente ?? audioPendente?.tentativa.idCliente;

  // Mantém a mensagem mais recente visível quando chega ou é enviada uma nova (inclusive a foto em envio).
  useEffect(() => {
    const lista = listaMensagensRef.current;
    if (lista && (ultimaMensagemId || imagemPendenteId)) lista.scrollTop = lista.scrollHeight;
  }, [ultimaMensagemId, imagemPendenteId]);

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
      if (
        resultado.success &&
        resultado.data.mensagem.conversaId === conversa.id
      ) {
        adicionar([resultado.data.mensagem]);
      }
    };
    const aoAtualizar = (evento: unknown) => {
      const resultado = eventoMensagemAtualizadaSchema.safeParse(evento);
      if (
        resultado.success &&
        resultado.data.mensagem.conversaId === conversa.id
      ) {
        setReconciliada((atual) =>
          receberAtualizacao(atual, resultado.data.mensagem),
        );
      }
    };
    const aoExcluirParaMim = (evento: unknown) => {
      const resultado = eventoMensagemExcluidaParaMimSchema.safeParse(evento);
      if (resultado.success && resultado.data.conversaId === conversa.id) {
        setReconciliada((atual) =>
          ocultarMensagem(atual, resultado.data.mensagemId),
        );
      }
    };
    const aoEntregar = (evento: unknown) => {
      const resultado = eventoMensagensEntreguesSchema.safeParse(evento);
      if (resultado.success && resultado.data.conversaId === conversa.id) {
        setReconciliada((atual) => receberEntrega(atual, resultado.data));
      }
    };
    const aoLer = (evento: unknown) => {
      const resultado = eventoMensagensLidasSchema.safeParse(evento);
      if (resultado.success && resultado.data.conversaId === conversa.id) {
        setReconciliada((atual) => receberLeitura(atual, resultado.data));
      }
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

  // LIDA somente com a conversa aberta (este componente montado), o histórico já apresentado e a aba
  // visível. Um marcador cobre todas as anteriores; mensagens que chegam com a conversa aberta e
  // visível avançam o marcador. Em segundo plano nada é confirmado até a aba voltar a ficar visível.
  useEffect(() => {
    if (!historicoCarregado || !documentoVisivel) return;
    const alvo = ultimaMensagemRecebida(mensagens, identidadeId);
    const confirmada = leituraConfirmadaRef.current;
    if (!alvo || (confirmada !== null && alvo.id <= confirmada)) return;

    leituraConfirmadaRef.current = alvo.id;
    void confirmarLeituraConversa(conversa.id, alvo.id).then((resultado) => {
      // Falhou: libera para nova tentativa na próxima mudança (ex.: recarga ao reconectar).
      if (!resultado.ok && leituraConfirmadaRef.current === alvo.id)
        leituraConfirmadaRef.current = confirmada;
    });
  }, [
    conversa.id,
    identidadeId,
    mensagens,
    historicoCarregado,
    documentoVisivel,
  ]);

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
        adicionar([resultado.dados]);
        aoMensagemConfirmada(resultado.dados);
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
      if (resultado.codigo === "MENSAGEM_RESPONDIDA_NAO_ENCONTRADA")
        setRespondendo(null);
      // O servidor recusou por bloqueio (ex.: a outra pessoa acabou de bloquear): mostra o estado real.
      if (resultado.codigo === "COMUNICACAO_BLOQUEADA") void bloqueio.reler();
    } finally {
      setOcupado(false);
    }
  }

  function escolherImagem(arquivo: File) {
    const problema = validarArquivoImagem(arquivo);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro(null);
    urlsLocais.revogar(imagemSelecionada?.previaUrl);
    setImagemSelecionada({ arquivo, previaUrl: urlsLocais.criar(arquivo) });
    campoMensagemRef.current?.focus();
  }

  function removerImagemSelecionada() {
    urlsLocais.revogar(imagemSelecionada?.previaUrl);
    setImagemSelecionada(null);
    campoMensagemRef.current?.focus();
  }

  /*
   * Envia (ou REENVIA) uma tentativa de imagem. A tentativa não muda entre as tentativas: mesmo
   * idCliente, arquivo, legenda e resposta — a API devolve 200 com a mensagem já salva se a primeira
   * tiver chegado. A foto aparece na conversa pelo balão pendente desde já.
   */
  async function enviarImagem(tentativa: TentativaImagem, idsAntesDoEnvio: ReadonlySet<string>) {
    setErro(null);
    setImagemPendente({ tentativa, situacao: "enviando", idsAntesDoEnvio });
    const resultado = await enviarMensagemImagem(conversa.id, tentativa);
    if (resultado.ok) {
      adicionar([resultado.dados]);
      aoMensagemConfirmada(resultado.dados);
      urlsLocais.revogar(tentativa.previaUrl);
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
      // A mensagem citada não vale mais: a foto volta ao compositor (mesma prévia), sem a referência.
      setRespondendo(null);
      setImagemSelecionada({ arquivo: tentativa.arquivo, previaUrl: tentativa.previaUrl });
      setTexto(tentativa.legenda);
    } else {
      urlsLocais.revogar(tentativa.previaUrl);
    }
    if (resultado.codigo === "COMUNICACAO_BLOQUEADA") void bloqueio.reler();
  }

  function descartarImagemPendente() {
    urlsLocais.revogar(imagemPendente?.tentativa.previaUrl);
    setImagemPendente(null);
    setErro(null);
  }

  const fecharImagem = useCallback(() => setImagemAberta(null), []);

  // Gravação da mensagem de voz: gravar → parar → ouvir → enviar ou descartar.
  const gravacao = useGravacaoAudio({ criarUrl: urlsLocais.criar, revogarUrl: urlsLocais.revogar, aoErro: setErro });

  /*
   * Envia (ou REENVIA) uma tentativa de áudio: mesmo idCliente, mesmo arquivo, mesma resposta — a API
   * devolve 200 com a mensagem já salva se a primeira tiver chegado. O áudio aparece na conversa pelo
   * balão pendente desde já.
   */
  async function enviarAudio(tentativa: TentativaAudio, idsAntesDoEnvio: ReadonlySet<string>) {
    setErro(null);
    setAudioPendente({ tentativa, situacao: "enviando", idsAntesDoEnvio });
    const resultado = await enviarMensagemAudio(conversa.id, tentativa);
    if (resultado.ok) {
      adicionar([resultado.dados]);
      aoMensagemConfirmada(resultado.dados);
      urlsLocais.revogar(tentativa.previaUrl);
      setAudioPendente(null);
      return;
    }
    setErro(mensagemDeFalhaAudio(resultado));
    if (destinoDaTentativaDeAudio(resultado) === "manter") {
      setAudioPendente({ tentativa, situacao: "falhou", idsAntesDoEnvio });
      return;
    }
    // Recusa definitiva (ou a mensagem citada não vale mais): o áudio não tem como seguir.
    urlsLocais.revogar(tentativa.previaUrl);
    setAudioPendente(null);
    if (resultado.codigo === "MENSAGEM_RESPONDIDA_NAO_ENCONTRADA") setRespondendo(null);
    if (resultado.codigo === "COMUNICACAO_BLOQUEADA") void bloqueio.reler();
  }

  // O áudio pronto vira UMA mensagem de áudio (nunca texto + áudio); a prévia passa a ser do balão pendente.
  function enviarAudioPronto() {
    if (gravacao.estado.fase !== "pronto" || audioPendente || bloqueada) return;
    const { arquivo, duracaoMs, previaUrl } = gravacao.estado.audio;
    const mensagemRespondidaId = respondendo?.mensagemId;
    const tentativa: TentativaAudio = { idCliente: crypto.randomUUID(), arquivo, duracaoMs, previaUrl, ...(mensagemRespondidaId ? { mensagemRespondidaId } : {}) };
    gravacao.descartar(false);
    setRespondendo(null);
    void enviarAudio(tentativa, new Set(mensagens.map((mensagem) => mensagem.id)));
  }

  function descartarAudioPendente() {
    urlsLocais.revogar(audioPendente?.tentativa.previaUrl);
    setAudioPendente(null);
    setErro(null);
  }

  async function salvarEdicao(mensagem: Mensagem, conteudo: string) {
    setErro(null);
    setOcupado(true);
    try {
      const resultado = await editarMensagem(
        conversa.id,
        mensagem.id,
        conteudo,
      );
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setReconciliada((atual) => receberAtualizacao(atual, resultado.dados));
      aoMensagemAtualizada(resultado.dados);
      setEditando(null);
      setTexto("");
    } finally {
      setOcupado(false);
    }
  }

  async function excluirParaMim(mensagem: Mensagem) {
    if (
      !window.confirm(
        "Excluir esta mensagem só para você? As outras pessoas continuarão vendo.",
      )
    )
      return;
    setErro(null);
    const resultado = await excluirMensagemParaMim(conversa.id, mensagem.id);
    if (!resultado.ok) {
      setErro(resultado.mensagem);
      return;
    }
    setReconciliada((atual) => ocultarMensagem(atual, mensagem.id));
    // Imagem excluída para mim: a URL sai da memória e não é mais pedida.
    cacheImagens.esquecer(mensagem.id);
    cacheAudios.esquecer(mensagem.id);
    aoMensagemExcluidaParaMim(resultado.dados);
  }

  async function excluirParaTodos(mensagem: Mensagem) {
    if (
      !window.confirm(
        "Excluir esta mensagem para todos? O conteúdo será removido para todos os participantes.",
      )
    )
      return;
    setErro(null);
    const resultado = await excluirMensagemParaTodos(conversa.id, mensagem.id);
    if (!resultado.ok) {
      setErro(resultado.mensagem);
      return;
    }
    setReconciliada((atual) => receberAtualizacao(atual, resultado.dados));
    // Tombstone: a imagem some para todos; a URL não é guardada nem renovada.
    cacheImagens.esquecer(mensagem.id);
    cacheAudios.esquecer(mensagem.id);
    aoMensagemAtualizada(resultado.dados);
  }

  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const conteudo = texto.trim();
    // IMAGEM: uma ação de envio cria UMA mensagem de imagem; o texto digitado é a legenda (opcional).
    if (imagemSelecionada && !editando) {
      if (imagemPendente) return;
      atividade.pararDigitacao();
      const mensagemRespondidaId = respondendo?.mensagemId;
      const tentativa: TentativaImagem = {
        idCliente: crypto.randomUUID(),
        arquivo: imagemSelecionada.arquivo,
        legenda: conteudo,
        previaUrl: imagemSelecionada.previaUrl,
        ...(mensagemRespondidaId ? { mensagemRespondidaId } : {}),
      };
      // O compositor fica livre: a tentativa (e a prévia) passam a viver no balão pendente.
      setImagemSelecionada(null);
      setTexto("");
      setRespondendo(null);
      void enviarImagem(tentativa, new Set(mensagens.map((mensagem) => mensagem.id)));
      return;
    }
    if (!conteudo) return;
    if (editando) {
      void salvarEdicao(editando, conteudo);
      return;
    }
    // Enviar encerra o "digitando" imediatamente (o servidor também o encerra ao persistir).
    atividade.pararDigitacao();
    const mensagemRespondidaId = respondendo?.mensagemId;
    const mesmaTentativa =
      pendente?.conteudo === conteudo &&
      pendente.mensagemRespondidaId === mensagemRespondidaId;
    void enviar(
      mesmaTentativa
        ? pendente
        : {
            idCliente: crypto.randomUUID(),
            conteudo,
            ...(mensagemRespondidaId ? { mensagemRespondidaId } : {}),
          },
    );
  }

  // Responder não interfere no "digitando": só muda a referência da próxima mensagem.
  function responder(mensagem: Mensagem) {
    setRespondendo({
      mensagemId: mensagem.id,
      nomeAutor: rotuloAutorResposta(
        mensagem.remetenteIdentidadeId,
        conversa.outraIdentidade.nomeExibicao,
        identidadeId,
      ),
      // Imagem sem legenda é citada como "Foto" (nunca miniatura nem URL da imagem privada).
      ...resumirConteudoParaPrevia(conteudoParaPrevia(mensagem)),
    });
    campoMensagemRef.current?.focus();
  }

  function cancelarResposta() {
    setRespondendo(null);
    campoMensagemRef.current?.focus();
  }

  // Editar usa o mesmo campo; não é digitação de mensagem nova, então não avisa "digitando".
  function iniciarEdicao(mensagem: Mensagem) {
    atividade.pararDigitacao();
    setRespondendo(null);
    setPendente(null);
    // Editar é sobre um texto já enviado: gravação, áudio pronto e foto ainda não enviados são descartados.
    gravacao.cancelar();
    gravacao.descartar();
    urlsLocais.revogar(imagemSelecionada?.previaUrl);
    setImagemSelecionada(null);
    setEditando(mensagem);
    setTexto(mensagem.conteudo);
    campoMensagemRef.current?.focus();
  }

  function cancelarEdicao() {
    setEditando(null);
    setTexto("");
    campoMensagemRef.current?.focus();
  }

  function adicionarProduto(
    empresa: Carrinho["empresa"],
    produto: Parameters<typeof adicionarAoCarrinho>[1],
    quantidade: number,
    montagem: {
      grupos: GrupoOpcoesPublico[];
      opcaoIds: string[];
      observacao: string | null;
    },
  ) {
    setErroPedido(null);
    // Os nomes e o acréscimo das opções ficam no item só para EXIBIR; o servidor recalcula tudo.
    const escolhas = escolhasDaMontagem(montagem.grupos, montagem.opcaoIds);
    const resultado = adicionarAoCarrinho(
      empresa,
      produto,
      quantidade,
      escolhas,
      montagem.observacao,
    );
    if (resultado.tipo === "outra-empresa") {
      setTrocaDeEmpresa({
        empresa,
        produto,
        quantidade,
        escolhas,
        observacao: montagem.observacao,
        nomeAtual: resultado.empresaAtual.nome,
      });
      return;
    }
    if (resultado.tipo === "limite-de-itens") {
      setErroPedido("O carrinho atingiu o limite de itens diferentes.");
      return;
    }
    /*
     * No desktop, "Seu pedido" é a coluna ao lado e abre junto. Em tela estreita o painel é a tela
     * inteira e NÃO se abre sozinho: quem confirma é a barra "Ver pedido · N itens" do rodapé, que
     * aparece já com a contagem nova. Adicionar o segundo item continua sem exigir voltar.
     */
    setPainelPedido("automatico");
  }

  function confirmarTrocaDeEmpresa() {
    if (!trocaDeEmpresa) return;
    substituirPorEmpresa(
      trocaDeEmpresa.empresa,
      trocaDeEmpresa.produto,
      trocaDeEmpresa.quantidade,
      trocaDeEmpresa.escolhas,
      trocaDeEmpresa.observacao,
    );
    setEnderecoEntrega(null);
    void consultarFreteEntrega(null);
    setTrocaDeEmpresa(null);
    setPainelPedido("automatico");
  }

  /*
   * A empresa está recebendo pedidos agora? Só interessa a quem tem carrinho com ela. O estado e o
   * texto vêm do servidor; a recusa de verdade acontece lá, na confirmação.
   */
  const { funcionamento: funcionamentoDaEmpresa, atualizar: atualizarFuncionamento } = useFuncionamento(carrinho ? conversa.outraIdentidade.identidadeId : null);
  const motivoDoBloqueio = funcionamentoDaEmpresa && !funcionamentoDaEmpresa.estado.abertoAgora ? funcionamentoDaEmpresa.estado.aviso : null;
  const bloqueioDoPedido = motivoDoBloqueio
    ? {
        motivo: motivoDoBloqueio,
        aoExplicar: () => {
          avisar.alerta(motivoDoBloqueio);
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
    const assinatura = JSON.stringify({
      itens,
      confirmacao,
      enderecoId: enderecoEntrega.id,
    });
    // Mesmo conteúdo = mesma tentativa: um reenvio após falha de rede não cria um segundo pedido.
    const tentativa =
      tentativaPedido && tentativaPedido.assinatura === assinatura
        ? tentativaPedido
        : { idCliente: crypto.randomUUID(), assinatura };
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
            ? {
                forma: "dinheiro",
                ...(confirmacao.trocoParaCentavos === null
                  ? {}
                  : { trocoParaCentavos: confirmacao.trocoParaCentavos }),
              }
            : { forma: "cartao" },
      });
      if (!resultado.ok) {
        // A empresa fechou entre montar e confirmar: nada foi criado e o carrinho fica como está.
        if (resultado.codigo === "EMPRESA_FECHADA") atualizarFuncionamento();
        // Falha de rede/servidor: mantém a tentativa para reenviar com o mesmo idCliente.
        setErroPedido(
          resultado.status === 0 || resultado.status >= 500
            ? "Falha ao enviar o pedido. Confirme de novo para tentar sem duplicar."
            : resultado.mensagem,
        );
        return;
      }
      limpar();
      setEnderecoEntrega(null);
      void consultarFreteEntrega(null);
      setTentativaPedido(null);
      setPainelPedido("automatico");
      setEscolhendoEndereco(false);
      // O pedido foi feito: o cardápio sai da frente e o acompanhamento aparece na própria conversa
      // (a mensagem do pedido chega por `mensagem:nova`, já aberta).
      setCatalogoAberto(false);
    } finally {
      setEnviandoPedido(false);
    }
  }

  const outro = conversa.outraIdentidade;
  const itensNoCarrinho = quantidadeTotal(carrinho);
  /*
   * O carrinho é guardado por IDENTIDADE e vale para UMA empresa. Numa conversa com outra empresa ele
   * continua existindo (não se perde), mas NÃO é exibido aqui: mostrar o pedido da Pizzaria dentro da
   * conversa da Farmácia faria a pessoa confirmar o pedido errado. Ao adicionar um produto, a troca
   * de empresa continua sendo perguntada explicitamente.
   */
  const carrinhoDestaEmpresa =
    carrinho !== null && carrinho.empresa.identidadeId === outro.identidadeId;
  const temItensNoCarrinho = itensNoCarrinho > 0 && carrinhoDestaEmpresa;
  // Carrinho restaurado do navegador já aparece na coluna do desktop, sem exigir um clique.
  const carrinhoVisivel =
    temItensNoCarrinho &&
    (painelPedido === "aberto" || (painelPedido === "automatico" && telaLarga));
  /*
   * Coluna do pedido AINDA VAZIA: no desktop, com o cardápio aberto, ela já aparece convidando a
   * escolher — é o comportamento da referência, e evita a terceira coluna surgindo do nada no
   * primeiro item. No celular não existe: ali o espaço é da conversa e do cardápio.
   */
  const pedidoVazioVisivel =
    podeComprar &&
    !temItensNoCarrinho &&
    catalogoAberto &&
    telaLarga &&
    painelPedido !== "fechado";

  /*
   * O painel "Seu pedido" tem CONTEÚDO agora? É isso que decide, abaixo de `xl`, se ele virou a tela
   * inteira (uma tela principal por vez, como na referência) ou se nem existe. Antes era `empty:hidden`
   * no CSS, que resolvia só o "some quando vazio" — não dava para esconder a conversa e o compositor
   * a partir dele.
   */
  const painelPedidoOcupado =
    pedidoVazioVisivel ||
    trocaDeEmpresa !== null ||
    (carrinhoVisivel && carrinho !== null) ||
    (erroPedido !== null && !carrinhoVisivel);
  /*
   * Atalho para o pedido no RODAPÉ, só na largura em que ele não é coluna: com itens no carrinho e a
   * pessoa na conversa/cardápio, é o caminho curto para revisar — o mesmo painel, o mesmo estado.
   */
  const barraPedidoVisivel =
    podeComprar && temItensNoCarrinho && !painelPedidoOcupado;

  // Um modo de compositor por vez; o microfone só existe no modo normal (campo vazio, nada pendente).
  const modo = modoDoCompositor({
    editando: editando !== null,
    gravando: gravacao.estado.fase === "gravando",
    audioPronto: gravacao.estado.fase === "pronto",
    imagemSelecionada: imagemSelecionada !== null,
    temTexto: texto.trim() !== "",
  });
  const microfoneNoLugarDoEnviar = podeGravar({ modo, bloqueada, midiaPendente: imagemPendente !== null || audioPendente !== null, textoPendente: pendente !== null });

  const rotuloEnvio = editando
    ? "Salvar"
    : pendente && !ocupado
      ? "Reenviar"
      : "Enviar";

  return (
    <section
      aria-label="Conversa"
      // chat-wallpaper: o padrão SVG fica PARADO atrás das mensagens que rolam (ver globals.css).
      className="chat-wallpaper flex min-h-0 min-w-0 flex-1 flex-col"
    >
      {/*
        Abaixo de `xl` o pedido é a TELA: mostrar também o cabeçalho da conversa empilharia duas
        barras de 72px numa tela de celular, e a saída dali é a seta do próprio painel. Nas três
        colunas o cabeçalho é permanente, porque a conversa continua ao lado.
      */}
      <div
        className={`shrink-0 ${painelPedidoOcupado ? "hidden xl:block" : "block"}`}
      >
        <CabecalhoConversa
          outraIdentidade={outro}
          presenca={atividade.presenca}
          digitando={atividade.outraDigitando}
          {...(aoVoltar ? { aoVoltar } : {})}
          aoAbrirPerfil={() => setPerfilAberto(true)}
          inicio={inicioCabecalho}
          bloqueada={bloqueada}
          acoes={
            <div className="flex items-center gap-1">
            {outro.tipo === "empresarial" && (
              /*
                CABEÇALHO SÓ COM ÍCONES: rótulo escrito virava três palavras competindo com o nome da
                empresa em tela estreita. O significado vai em `aria-label` + `title` (dica ao passar o
                mouse), e o estado ativo aparece no próprio botão — cor sozinha não conta como
                informação, por isso `aria-pressed`/`aria-expanded`.
                Alvo de toque de 44px no celular e 36px do `sm` para cima, como nos demais controles.
              */
              <div className="flex items-center gap-1">
                <BotaoCabecalho
                  ativo={!catalogoAberto}
                  titulo={catalogoAberto ? "Voltar à conversa" : "Ver cardápio"}
                  aoClicar={() => setCatalogoAberto((aberto) => !aberto)}
                >
                  {catalogoAberto ? (
                    <IconeConversa className="h-5 w-5" />
                  ) : (
                    <IconeLoja className="h-5 w-5" />
                  )}
                </BotaoCabecalho>

                {/* Leva para a área de pedidos que JÁ existe; só aparece quando ela existe para esta identidade. */}
                {aoAbrirPedidos && (
                  <BotaoCabecalho
                    ativo={false}
                    titulo="Meus pedidos"
                    aoClicar={aoAbrirPedidos}
                  >
                    <IconePedidos className="h-5 w-5" />
                  </BotaoCabecalho>
                )}

                {podeComprar && temItensNoCarrinho && (
                  /*
                    Abre e fecha o MESMO painel "Seu pedido" (`painelPedido`) — nunca um segundo
                    carrinho. Fica disponível em todas as larguras, inclusive com a coluna aberta.
                  */
                  <BotaoCabecalho
                    ativo={carrinhoVisivel}
                    expandido={carrinhoVisivel}
                    marcador={
                      <span
                        aria-hidden
                        className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-marca px-1 text-[10px] font-bold leading-none text-marca-conteudo"
                      >
                        {itensNoCarrinho}
                      </span>
                    }
                    dados={{ "data-abrir-carrinho": true }}
                    titulo={
                      carrinhoVisivel
                        ? "Ocultar seu pedido"
                        : `Seu pedido (${itensNoCarrinho} ${itensNoCarrinho === 1 ? "item" : "itens"})`
                    }
                    aoClicar={() =>
                      setPainelPedido(carrinhoVisivel ? "fechado" : "aberto")
                    }
                  >
                    <IconeCesta className="h-5 w-5" />
                  </BotaoCabecalho>
                )}
              </div>
            )}
            {/* O MESMO menu (e as mesmas ações) do "⋯" da lista: limpar, apagar, bloquear/desbloquear. */}
            {aoAcaoConversa && <AcoesDaConversa alvo={{ id: conversa.id, outraIdentidade: outro }} aoExecutar={aoAcaoConversa} />}
            </div>
          }
        />
      </div>

      {/*
        Corpo da conversa em GRID — e não em flex — por causa da ALTURA do painel do pedido: em flex
        ele era irmão da coluna central e esticava por toda a altura dela, descendo por cima da faixa
        do compositor. No grid, cada um ocupa a sua célula e o painel termina exatamente onde a área
        rolável termina, sem nenhuma altura fixa.

        UMA TELA PRINCIPAL POR VEZ até `xl`, como na referência (que usa um único breakpoint e
        alterna `hidden`/`flex` por painel): sem espaço para lista | conversa/cardápio | pedido, as
        colunas NÃO são comprimidas — o painel do pedido ocupa a tela e a conversa some, com a seta
        de voltar no cabeçalho dele. A lista de conversas faz o mesmo um nível acima
        (`mensageiro-tecnico`). De `xl` para cima as três colunas convivem.

          xl (três colunas, com a lista fora daqui)   abaixo de xl
          ┌──────────────┬───────────┐                ┌──────────────┐  ┌──────────────┐
          │ centro       │ pedido    │ 1fr            │ centro       │  │ pedido       │
          ├──────────────┤           │                ├──────────────┤  │ (tela toda)  │
          │ compositor   │           │ auto           │ ver pedido   │  │              │
          └──────────────┴───────────┘                ├──────────────┤  │              │
                                                      │ compositor   │  │              │
                                                      └──────────────┘  └──────────────┘

        A coluna do pedido é `auto`: sem painel aberto ela vira 0 e o centro ocupa a largura toda —
        nada de coluna fantasma reservada.
      */}
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto_auto] xl:grid-cols-[minmax(0,1fr)_auto] xl:grid-rows-[minmax(0,1fr)_auto]">
        {/*
          Painel do PEDIDO: rola por conta própria (`min-h-0` é o que permite a rolagem interna
          acontecer em vez de estourar a célula). Abaixo de `xl` ele cobre as três linhas — é a tela
          do pedido, e a conversa e o compositor ficam escondidos; de `xl` para cima é a coluna da
          direita, com largura própria, e continua cobrindo TODAS as linhas: é isso que faz a ação
          principal do pedido terminar na mesma linha visual do compositor, sem altura fixa e sem
          sobrepor nada — quem divide o espaço é o grid.
        */}
        <aside
          aria-label="Seu pedido"
          className={`col-start-1 row-start-1 row-span-3 min-h-0 min-w-0 flex-col gap-3 overflow-y-auto bg-superficie xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:w-[20.625rem] xl:border-l xl:border-borda ${painelPedidoOcupado ? "flex" : "hidden"}`}
        >
          {pedidoVazioVisivel && (
            <PainelPedidoVazio aoFechar={() => setPainelPedido("fechado")} />
          )}
          {trocaDeEmpresa && (
            <div
              role="alertdialog"
              aria-label="Trocar de empresa"
              className="m-4 flex flex-col gap-2 rounded-jaa border border-ouro/60 bg-[color-mix(in_oklab,var(--cor-ouro)_10%,var(--cor-superficie))] p-3 text-sm"
            >
              <p>
                Seu carrinho tem produtos de {trocaDeEmpresa.nomeAtual}. Um
                pedido é de uma empresa só. Substituir pelo carrinho de{" "}
                {trocaDeEmpresa.empresa.nome}?
              </p>
              <span className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={confirmarTrocaDeEmpresa}
                  className="min-h-10 rounded-jaa-compacto bg-marca px-4 text-xs font-medium text-marca-conteudo"
                >
                  Substituir carrinho
                </button>
                <button
                  type="button"
                  onClick={() => setTrocaDeEmpresa(null)}
                  className="min-h-10 rounded-jaa-compacto border border-borda px-4 text-xs font-medium"
                >
                  Manter carrinho atual
                </button>
              </span>
            </div>
          )}
          {/* A escolha substitui visualmente o carrinho. O carrinho continua montado, apenas oculto,
            para preservar inclusive forma de pagamento e troco enquanto a pessoa escolhe. */}
          {carrinhoVisivel && escolhendoEndereco && (
            <div key="escolha-endereco" className="p-4">
              <EtapaEnderecoEntrega
                empresaIdentidadeId={conversa.outraIdentidade.identidadeId}
                aoSelecionar={(endereco) => {
                  setEnderecoEntrega(endereco);
                  // Trocar de endereço pode trocar de zona: a taxa é perguntada de novo ao servidor.
                  void consultarFreteEntrega(endereco);
                  setEscolhendoEndereco(false);
                }}
                aoVoltar={() => setEscolhendoEndereco(false)}
              />
            </div>
          )}
          {carrinhoVisivel && carrinho && (
            <div
              key="painel-carrinho"
              className={escolhendoEndereco ? "hidden" : "contents"}
            >
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
                aoFechar={() => setPainelPedido("fechado")}
                aoLimpar={() => {
                  if (window.confirm("Remover todos os itens do seu pedido?")) {
                    limpar();
                    setEnderecoEntrega(null);
                    void consultarFreteEntrega(null);
                  }
                }}
              />
            </div>
          )}
          {erroPedido && !carrinhoVisivel && (
            <p role="alert" className="px-4 py-3 text-sm text-perigo">
              {erroPedido}
            </p>
          )}
        </aside>

        {/*
          CENTRO. O CARDÁPIO ocupa o lugar das mensagens quando aberto — é o comportamento da
          referência: a pessoa conversa, toca em "Ver cardápio", escolhe e volta. O compositor fica
          sempre no rodapé, então dá para escrever para a empresa mesmo com o cardápio aberto.
        */}
        <div
          className={`col-start-1 row-start-1 min-h-0 min-w-0 flex-col xl:flex ${painelPedidoOcupado ? "hidden" : "flex"}`}
        >
          {catalogoAberto && outro.tipo === "empresarial" ? (
            <div className="painel-entrando min-h-0 flex-1 overflow-y-auto">
              <CatalogoDaEmpresa
                identidadeEmpresaId={outro.identidadeId}
                aoFechar={() => setCatalogoAberto(false)}
                aoCarregarCatalogo={sincronizarImagens}
                {...(podeComprar
                  ? { aoAdicionarAoCarrinho: adicionarProduto }
                  : {})}
              />
            </div>
          ) : (
            <ol
              ref={listaMensagensRef}
              aria-label="Mensagens"
              className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 overflow-y-auto px-4 py-6 sm:px-8"
            >
              {proximoCursor && (
                <li className="flex justify-center pb-2">
                  <button
                    type="button"
                    onClick={() => void carregarAnteriores()}
                    className="min-h-9 rounded-jaa-compacto bg-superficie px-4 text-xs font-medium shadow-suave hover:bg-realce"
                  >
                    Carregar anteriores
                  </button>
                </li>
              )}

              {mensagens.length === 0 && (
                <li className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
                  <p className="fonte-display text-sm font-semibold">
                    Nenhuma mensagem ainda
                  </p>
                  <p className="max-w-xs text-sm text-conteudo-suave">
                    Escreva a primeira mensagem aqui embaixo.
                  </p>
                </li>
              )}

              {mensagens.map((mensagem, indice) => {
                const anterior = mensagens[indice - 1];
                // Separador de dia: sem marcos, uma conversa longa vira um bloco só.
                const abreDia =
                  !anterior ||
                  !mesmoDia(
                    new Date(anterior.criadoEm),
                    new Date(mensagem.criadoEm),
                  );
                return (
                  <Fragment key={mensagem.id}>
                    {abreDia && (
                      <li
                        data-separador-dia
                        className="flex justify-center py-1"
                      >
                        <span className="rounded-full bg-superficie px-3 py-1 text-[11px] font-semibold text-conteudo-suave shadow-suave">
                          {rotuloDoDia(mensagem.criadoEm)}
                        </span>
                      </li>
                    )}
                    <BalaoMensagem
                      mensagem={mensagem}
                      identidadeAtualId={identidadeId}
                      nomeRemetente={outro.nomeExibicao}
                      aoResponder={responder}
                      aoCopiar={(texto) => void copiarMensagem(texto)}
                      aoAbrirConversa={aoConversarCom}
                      aoEditar={iniciarEdicao}
                      aoExcluirParaMim={(alvo) => void excluirParaMim(alvo)}
                      aoExcluirParaTodos={(alvo) => void excluirParaTodos(alvo)}
                      {...(mensagem.tipo === "audio"
                        ? {
                            estadoAudio: estadoDoAudio(mensagem.id),
                            aoFalharAudio: (alvo: Mensagem) => void cacheAudios.aoFalharCarregamento(alvo.id),
                            aoCarregarAudio: (alvo: Mensagem) => cacheAudios.aoCarregar(alvo.id),
                          }
                        : {})}
                      {...(mensagem.tipo === "imagem"
                        ? {
                            estadoImagem: estadoDaImagem(mensagem.id),
                            aoAbrirImagem: (alvo: Mensagem) =>
                              setImagemAberta({ mensagemId: alvo.id, descricao: alvo.conteudo || "Foto" }),
                            aoFalharImagem: (alvo: Mensagem) => void cacheImagens.aoFalharCarregamento(alvo.id),
                            aoCarregarImagem: (alvo: Mensagem) => cacheImagens.aoCarregar(alvo.id),
                          }
                        : {})}
                    />
                  </Fragment>
                );
              })}

              {/*
                Foto em envio (ou que falhou): balão local com a prévia. Se a mensagem oficial já
                chegou pelo tempo real antes da resposta do envio, ele não é mostrado — sem foto dupla.
              */}
              {imagemPendente &&
                !(
                  imagemPendente.situacao === "enviando" &&
                  tentativaJaChegou(imagemPendente.tentativa, mensagens, imagemPendente.idsAntesDoEnvio, identidadeId)
                ) && (
                  <BalaoImagemPendente
                    previaUrl={imagemPendente.tentativa.previaUrl}
                    legenda={imagemPendente.tentativa.legenda}
                    situacao={imagemPendente.situacao}
                    aoReenviar={() => void enviarImagem(imagemPendente.tentativa, imagemPendente.idsAntesDoEnvio)}
                    aoDescartar={descartarImagemPendente}
                  />
                )}

              {/* Áudio em envio (ou que falhou): mesma regra — sem áudio duplo se o tempo real chegar antes. */}
              {audioPendente &&
                !(audioPendente.situacao === "enviando" && tentativaDeAudioJaChegou(audioPendente.tentativa, mensagens, audioPendente.idsAntesDoEnvio, identidadeId)) && (
                  <BalaoAudioPendente
                    previaUrl={audioPendente.tentativa.previaUrl}
                    duracaoMs={audioPendente.tentativa.duracaoMs}
                    situacao={audioPendente.situacao}
                    aoReenviar={() => void enviarAudio(audioPendente.tentativa, audioPendente.idsAntesDoEnvio)}
                    aoDescartar={descartarAudioPendente}
                  />
                )}
            </ol>
          )}
        </div>

        {/*
          Atalho compacto para o pedido, acima do compositor e só onde ele não é coluna. É o mesmo
          painel e o mesmo estado do ícone do cabeçalho — nunca um segundo carrinho.
        */}
        {barraPedidoVisivel && (
          <div className="col-start-1 row-start-2 min-w-0 px-2 pt-2 sm:px-4 xl:hidden">
            <button
              type="button"
              data-ver-pedido
              onClick={() => setPainelPedido("aberto")}
              className="mx-auto flex min-h-11 w-full max-w-3xl items-center justify-between gap-2 rounded-full bg-marca px-4 text-sm font-medium text-marca-conteudo shadow-suave transition-colors hover:bg-marca/90"
            >
              <span className="flex min-w-0 items-center gap-2">
                <IconeCesta className="h-4 w-4 shrink-0" />
                Ver pedido
              </span>
              <span className="shrink-0 rounded-jaa-compacto bg-marca-conteudo/15 px-2 py-0.5 text-xs">
                {itensNoCarrinho} {itensNoCarrinho === 1 ? "item" : "itens"}
              </span>
            </button>
          </div>
        )}

        {/*
          Compositor: célula PRÓPRIA do grid, embaixo da coluna central. É essa separação que reserva
          a faixa de digitação — o painel do pedido fica na coluna ao lado e nunca a alcança.
          Vale também com o cardápio aberto: escrever para a empresa nunca fica indisponível.

          A CÉLULA é TRANSPARENTE, como no WhatsApp: o papel de parede da conversa aparece em volta
          do campo, que é o único retângulo da região. A faixa clara de antes somava altura e cortava
          o desenho do fundo sem dizer nada. `env(safe-area-inset-bottom)` mantém o campo acima da
          área do sistema no celular.
        */}
        <div
          className={`col-start-1 row-start-3 min-w-0 px-2 pt-1 sm:px-4 xl:row-start-2 xl:block ${painelPedidoOcupado ? "hidden" : "block"}`}
          style={{
            paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
          }}
        >
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-1.5">
            {respondendo && (
              <PreviaRespostaCompositor
                resposta={respondendo}
                aoCancelar={cancelarResposta}
              />
            )}
            {imagemSelecionada && !editando && (
              <PreviaImagemCompositor
                previaUrl={imagemSelecionada.previaUrl}
                nomeArquivo={imagemSelecionada.arquivo.name}
                aoRemover={removerImagemSelecionada}
              />
            )}
            {editando && (
              <BarraContextoCompositor
                titulo="Editando mensagem"
                texto={editando.conteudo}
                aoCancelar={cancelarEdicao}
                rotuloCancelar="Cancelar edição"
              />
            )}

            {/*
              MENSAGEM DE VOZ: enquanto grava, ou com um áudio pronto, estes controles OCUPAM o lugar
              da pílula de texto — um modo por vez (`modoDoCompositor`), nunca texto e áudio juntos.
            */}
            {modo === "gravando" && gravacao.estado.fase === "gravando" && (
              <GravandoAudio decorridoMs={gravacao.estado.decorridoMs} aoCancelar={gravacao.cancelar} aoParar={gravacao.parar} />
            )}
            {modo === "audio-pronto" && gravacao.estado.fase === "pronto" && (
              <AudioProntoParaEnviar
                previaUrl={gravacao.estado.audio.previaUrl}
                duracaoMs={gravacao.estado.audio.duracaoMs}
                aoDescartar={() => gravacao.descartar()}
                aoEnviar={enviarAudioPronto}
                desabilitado={bloqueada || audioPendente !== null}
              />
            )}

            <form
              hidden={modo === "gravando" || modo === "audio-pronto"}
              onSubmit={aoEnviar}
              // Com bloqueio (qualquer sentido) não se digita nem envia; o 🚫 no cabeçalho explica.
              data-compositor-bloqueado={bloqueada ? "" : undefined}
              /*
                UMA PÍLULA: anexar, campo e enviar dentro do mesmo retângulo arredondado, em uma
                linha só. Continua sendo <input> de uma linha, então Enter envia (um textarea
                quebraria linha e mudaria o comportamento). `min-w-0` no campo é o que impede os
                controles de empurrarem a linha além da largura da conversa em tela estreita.
              */
              /*
                Focado, o compositor fica IGUAL ao repouso: sem borda, anel ou sombra de destaque na
                pílula nem no campo — só o cursor de texto piscando, como nos mensageiros. O foco
                continua sendo anunciado (o campo tem rótulo) e os BOTÕES mantêm o contorno de foco
                por teclado.
              */
              data-compositor
              className="flex items-center gap-1 rounded-full border border-borda bg-superficie p-1 shadow-suave"
            >
              {/* Uma foto por vez: enquanto uma está em envio (ou falhou), ela precisa ser resolvida antes. */}
              <BotaoAnexarImagem
                desabilitado={bloqueada || editando !== null || imagemPendente !== null || audioPendente !== null}
                aoEscolher={escolherImagem}
              />
              <label htmlFor="campo-mensagem" className="sr-only">
                Mensagem
              </label>
              <input
                id="campo-mensagem"
                ref={campoMensagemRef}
                name="mensagem"
                value={texto}
                disabled={bloqueada}
                placeholder={bloqueada ? "" : imagemSelecionada && !editando ? "Legenda (opcional)…" : "Digite uma mensagem…"}
                onChange={(evento) => {
                  setTexto(evento.target.value);
                  if (!editando) atividade.informarTexto(evento.target.value);
                }}
                maxLength={4000}
                autoComplete="off"
                /*
                 * O campo não tem fundo nem contorno próprios: ele É a pílula, e focado mostra só o
                 * cursor (`campo-sem-contorno`, em globals.css). `text-base` (16px) também evita o
                 * zoom automático do iOS ao focar.
                 */
                className="campo-sem-contorno min-h-9 min-w-0 flex-1 bg-transparent px-2 text-base outline-none placeholder:text-conteudo-suave"
              />
              {/*
                Enviar CIRCULAR no verde da marca (o jade fosco do Design System, não um verde neon),
                dentro da própria pílula. Salvar/Reenviar levam palavra, então viram uma cápsula da
                mesma altura — o alvo de toque não fica menor que 36px.
              */}
              {/* Campo vazio, nada em composição e nada pendente: o lugar do "enviar" é do microfone. */}
              {microfoneNoLugarDoEnviar && <BotaoGravarAudio aoGravar={() => void gravacao.iniciar()} desabilitado={gravacao.estado.fase === "pedindo-microfone"} />}
              <button
                type="submit"
                hidden={microfoneNoLugarDoEnviar}
                disabled={ocupado || bloqueada}
                aria-label={rotuloEnvio}
                className={`grid h-9 shrink-0 place-items-center rounded-full bg-marca text-marca-conteudo transition-colors hover:bg-marca/90 disabled:opacity-50 ${rotuloEnvio === "Enviar" ? "w-9" : "px-3.5 text-xs font-medium"}`}
              >
                {rotuloEnvio === "Enviar" ? (
                  <IconeEnviar className="h-4 w-4" />
                ) : (
                  rotuloEnvio
                )}
              </button>
            </form>
          </div>
        </div>
      </div>

      {erro && (
        <p role="alert" className="px-4 pb-2 text-sm text-perigo">
          {erro}
        </p>
      )}

      {imagemAberta &&
        (() => {
          // A URL vem do cache em memória; se a imagem deixou de estar disponível (ex.: excluída), não abre.
          const estado = estadoDaImagem(imagemAberta.mensagemId);
          return estado.situacao === "pronta" ? (
            <LightboxImagem
              url={estado.url}
              descricao={imagemAberta.descricao}
              aoFechar={fecharImagem}
              aoFalhar={() => void cacheImagens.aoFalharCarregamento(imagemAberta.mensagemId)}
            />
          ) : null;
        })()}

      {perfilAberto && <PerfilDaIdentidade identidade={outro} aoFechar={fecharPerfil} />}
    </section>
  );
}
