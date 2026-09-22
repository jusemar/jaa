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
  type Mensagem,
  type ParticipanteConversa,
  type EnderecoCliente,
  type Pedido,
  type TipoIdentidade,
} from "@jaa/contratos";
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { useAtividadeConversa } from "../hooks/use-atividade-conversa";
import { useDocumentoVisivel } from "../hooks/use-documento-visivel";
import {
  confirmarLeituraConversa,
  editarMensagem,
  enviarMensagem,
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
import {
  PainelCarrinho,
  type ConfirmacaoPedido,
} from "@/features/carrinho/components/painel-carrinho";
import { EtapaEnderecoEntrega } from "@/features/enderecos/components/etapa-endereco-entrega";
import { useCarrinho } from "@/features/carrinho/hooks/use-carrinho";
import {
  itensParaPedido,
  quantidadeTotal,
  type Carrinho,
} from "@/features/carrinho/lib/carrinho";
import { AcompanhamentoDoPedido } from "@/features/entregas/components/acompanhamento-cliente";
import { DetalhePedido } from "@/features/pedidos/components/apresentacao-pedido";
import { useStatusPedido } from "@/features/pedidos/hooks/use-status-pedido";
import { criarPedido, obterPedido } from "@/features/pedidos/lib/api-pedidos";
import { AcoesMidiaDesabilitadas } from "./acoes-midia-desabilitadas";
import { BalaoMensagem } from "./balao-mensagem";
import { BarraContextoCompositor } from "./barra-contexto-compositor";
import { CabecalhoConversa } from "./cabecalho-conversa";
import {
  PreviaRespostaCompositor,
  type RespostaEmComposicao,
} from "./previa-resposta-compositor";

/*
 * A CONVERSA ABERTA: cabeçalho fixo, mensagens rolando no meio e compositor embaixo — o formato da
 * referência de UI/UX aprovada. Autorização, remetente, persistência e idempotência continuam sendo
 * impostos pela API; esta camada só apresenta.
 *
 * Os painéis de comércio (catálogo, carrinho, endereço, pedido) abrem entre o cabeçalho e as
 * mensagens, com rolagem própria: eles nunca empurram o compositor para fora da tela.
 */

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
  outraIdentidade: ParticipanteConversa;
};

export function ConversaTecnica({
  identidadeId,
  tipoIdentidade = "pessoal",
  conversa,
  aoVoltar,
  aoMensagemConfirmada,
  aoMensagemAtualizada,
  aoMensagemExcluidaParaMim,
}: {
  identidadeId: string;
  // Só identidade PESSOAL compra; a empresa participa da conversa, não faz pedido de si mesma.
  tipoIdentidade?: TipoIdentidade;
  conversa: ConversaAberta;
  // Só no celular: a conversa ocupa a tela toda e o cabeçalho ganha o caminho de volta para a lista.
  aoVoltar?: () => void;
  // A resposta HTTP do envio também atualiza a lista, mesmo sem realtime.
  aoMensagemConfirmada: (mensagem: Mensagem) => void;
  // Idem para alterações (edição/exclusão) feitas por esta aba.
  aoMensagemAtualizada: (mensagem: Mensagem) => void;
  aoMensagemExcluidaParaMim: (exclusao: ExclusaoParaMim) => void;
}) {
  const [reconciliada, setReconciliada] = useState(conversaVazia);
  const mensagens = reconciliada.mensagens;
  const [historicoCarregado, setHistoricoCarregado] = useState(false);
  const documentoVisivel = useDocumentoVisivel();
  // Maior marcador de leitura já enviado (ou em envio) por esta aba para esta conversa.
  const leituraConfirmadaRef = useRef<string | null>(null);
  const [proximoCursor, setProximoCursor] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [pendente, setPendente] = useState<TentativaEnvio | null>(null);
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
  const [catalogoAberto, setCatalogoAberto] = useState(false);
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
  } = useCarrinho(identidadeId);
  const [carrinhoAberto, setCarrinhoAberto] = useState(false);
  // Destino escolhido para este pedido (com ponto já confirmado no mapa).
  const [enderecoEntrega, setEnderecoEntrega] =
    useState<EnderecoCliente | null>(null);
  const [escolhendoEndereco, setEscolhendoEndereco] = useState(false);
  // Carrinho aberto de OUTRA empresa: pergunta antes de substituir; nunca troca em silêncio.
  const [trocaDeEmpresa, setTrocaDeEmpresa] = useState<{
    empresa: Carrinho["empresa"];
    produto: Parameters<typeof adicionarAoCarrinho>[1];
    quantidade: number;
    nomeAtual: string;
  } | null>(null);
  const [tentativaPedido, setTentativaPedido] =
    useState<TentativaPedido | null>(null);
  const [enviandoPedido, setEnviandoPedido] = useState(false);
  const [erroPedido, setErroPedido] = useState<string | null>(null);
  const [avisoPedido, setAvisoPedido] = useState<string | null>(null);
  const [pedidoAberto, setPedidoAberto] = useState<Pedido | null>(null);
  // Posição do PRÓPRIO pedido na saída (situação + quantas entregas antes). Nunca a rota.
  const atividade = useAtividadeConversa({
    conversaId: conversa.id,
    outraIdentidadeId: conversa.outraIdentidade.identidadeId,
  });
  const listaMensagensRef = useRef<HTMLOListElement>(null);
  const ultimaMensagemId = mensagens.at(-1)?.id;

  // Mantém a mensagem mais recente visível quando chega ou é enviada uma nova.
  useEffect(() => {
    const lista = listaMensagensRef.current;
    if (lista && ultimaMensagemId) lista.scrollTop = lista.scrollHeight;
  }, [ultimaMensagemId]);

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
   * Status do pedido mudou (a empresa avançou ou cancelou): o MESMO card passa a mostrar o novo
   * estado e o pedido aberto acompanha. Não é mensagem nova — não reordena a conversa nem conta
   * como não lida.
   */
  const pedidoAbertoId = pedidoAberto?.id ?? null;
  useStatusPedido(
    useCallback(
      (evento) => {
        if (evento.conversaId !== null && evento.conversaId !== conversa.id)
          return;
        setReconciliada((atual) =>
          atualizarPedidoNasMensagens(atual, evento.pedido),
        );
        // Timeline e motivo vêm do servidor (fonte da verdade); o evento só avisa que mudou.
        if (pedidoAbertoId === evento.pedido.id) {
          void obterPedido(evento.pedido.id).then((resultado) => {
            if (resultado.ok) setPedidoAberto(resultado.dados);
          });
        }
      },
      [conversa.id, pedidoAbertoId],
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
    } finally {
      setOcupado(false);
    }
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
    aoMensagemAtualizada(resultado.dados);
  }

  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const conteudo = texto.trim();
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
      ...resumirConteudoParaPrevia(mensagem.conteudo),
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
  ) {
    setErroPedido(null);
    setAvisoPedido(null);
    const resultado = adicionarAoCarrinho(empresa, produto, quantidade);
    if (resultado.tipo === "outra-empresa") {
      setTrocaDeEmpresa({
        empresa,
        produto,
        quantidade,
        nomeAtual: resultado.empresaAtual.nome,
      });
      return;
    }
    if (resultado.tipo === "limite-de-itens") {
      setErroPedido("O carrinho atingiu o limite de produtos diferentes.");
      return;
    }
    setAvisoPedido(`${produto.nome} adicionado ao carrinho.`);
    setCarrinhoAberto(true);
  }

  function confirmarTrocaDeEmpresa() {
    if (!trocaDeEmpresa) return;
    substituirPorEmpresa(
      trocaDeEmpresa.empresa,
      trocaDeEmpresa.produto,
      trocaDeEmpresa.quantidade,
    );
    setTrocaDeEmpresa(null);
    setCarrinhoAberto(true);
  }

  async function confirmarPedido(confirmacao: ConfirmacaoPedido) {
    if (!carrinho) return;
    // Pedido de entrega não é criado sem destino; o servidor confere de novo.
    if (!enderecoEntrega) {
      setEscolhendoEndereco(true);
      return;
    }
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
    setAvisoPedido(null);
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
        // Falha de rede/servidor: mantém a tentativa para reenviar com o mesmo idCliente.
        setErroPedido(
          resultado.status === 0 || resultado.status >= 500
            ? "Falha ao enviar o pedido. Confirme de novo para tentar sem duplicar."
            : resultado.mensagem,
        );
        return;
      }
      limpar();
      setTentativaPedido(null);
      setCarrinhoAberto(false);
      setEscolhendoEndereco(false);
      setAvisoPedido("Pedido enviado para a empresa.");
    } finally {
      setEnviandoPedido(false);
    }
  }

  async function abrirPedido(pedidoId: string) {
    setErroPedido(null);
    // Fila e posição do entregador vêm do acompanhamento (componente próprio, com realtime e reconexão).
    const resultado = await obterPedido(pedidoId);
    if (!resultado.ok) {
      setErroPedido(resultado.mensagem);
      return;
    }
    setPedidoAberto(resultado.dados);
  }

  const outro = conversa.outraIdentidade;
  const itensNoCarrinho = quantidadeTotal(carrinho);

  const rotuloEnvio = editando
    ? "Salvar"
    : pendente && !ocupado
      ? "Reenviar"
      : "Enviar";

  return (
    <section
      aria-label="Conversa"
      className="flex min-h-0 flex-1 flex-col bg-conversa-fundo"
    >
      <CabecalhoConversa
        outraIdentidade={outro}
        presenca={atividade.presenca}
        digitando={atividade.outraDigitando}
        {...(aoVoltar ? { aoVoltar } : {})}
        acoes={
          outro.tipo === "empresarial" && (
            <>
              <button
                type="button"
                onClick={() => setCatalogoAberto((aberto) => !aberto)}
                className="min-h-9 rounded-full border border-borda px-3 text-xs font-medium hover:bg-superficie-suave"
              >
                {catalogoAberto ? "Ocultar produtos" : "Ver produtos"}
              </button>
              {podeComprar && itensNoCarrinho > 0 && (
                <button
                  type="button"
                  data-abrir-carrinho
                  onClick={() => setCarrinhoAberto((aberto) => !aberto)}
                  className="min-h-9 rounded-full bg-[color-mix(in_oklab,var(--cor-ouro)_25%,var(--cor-superficie))] px-3 text-xs font-medium text-conteudo"
                >
                  {carrinhoAberto
                    ? "Ocultar carrinho"
                    : `Carrinho (${itensNoCarrinho})`}
                </button>
              )}
            </>
          )
        }
      />

      {/*
        Painéis de comércio: rolam por conta própria e nunca empurram o compositor para fora da tela.
        Sem nenhum deles aberto, o bloco fica vazio e some (empty:hidden).
      */}
      <div className="flex max-h-[55%] shrink-0 flex-col gap-3 overflow-y-auto border-b border-borda bg-superficie px-3 py-3 empty:hidden md:px-5">
        {catalogoAberto && outro.tipo === "empresarial" && (
          <CatalogoDaEmpresa
            identidadeEmpresaId={outro.identidadeId}
            aoFechar={() => setCatalogoAberto(false)}
            {...(podeComprar
              ? { aoAdicionarAoCarrinho: adicionarProduto }
              : {})}
          />
        )}
        {trocaDeEmpresa && (
          <div
            role="alertdialog"
            aria-label="Trocar de empresa"
            className="flex flex-col gap-2 rounded-jaa border border-ouro/60 bg-[color-mix(in_oklab,var(--cor-ouro)_10%,var(--cor-superficie))] p-3 text-sm"
          >
            <p>
              Seu carrinho tem produtos de {trocaDeEmpresa.nomeAtual}. Um pedido
              é de uma empresa só. Substituir pelo carrinho de{" "}
              {trocaDeEmpresa.empresa.nome}?
            </p>
            <span className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={confirmarTrocaDeEmpresa}
                className="min-h-10 rounded-full bg-marca px-4 text-xs font-medium text-marca-conteudo"
              >
                Substituir carrinho
              </button>
              <button
                type="button"
                onClick={() => setTrocaDeEmpresa(null)}
                className="min-h-10 rounded-full border border-borda px-4 text-xs font-medium"
              >
                Manter carrinho atual
              </button>
            </span>
          </div>
        )}
        {/* A escolha substitui visualmente o carrinho. O carrinho continua montado, apenas oculto,
            para preservar inclusive forma de pagamento e troco enquanto a pessoa escolhe. */}
        {carrinhoAberto && escolhendoEndereco && (
          <EtapaEnderecoEntrega
            key="escolha-endereco"
            aoSelecionar={(endereco) => {
              setEnderecoEntrega(endereco);
              setEscolhendoEndereco(false);
            }}
            aoVoltar={() => setEscolhendoEndereco(false)}
          />
        )}
        {carrinhoAberto && carrinho && carrinho.itens.length > 0 && (
          <div
            key="painel-carrinho"
            className={escolhendoEndereco ? "hidden" : "contents"}
          >
            <PainelCarrinho
              carrinho={carrinho}
              endereco={enderecoEntrega}
              enviando={enviandoPedido}
              erro={erroPedido}
              aoAlterarQuantidade={alterarQuantidade}
              aoRemover={remover}
              aoTrocarEndereco={() => setEscolhendoEndereco(true)}
              aoConfirmar={(confirmacao) => void confirmarPedido(confirmacao)}
              aoFechar={() => setCarrinhoAberto(false)}
            />
          </div>
        )}
        {pedidoAberto && (
          <DetalhePedido
            pedido={pedidoAberto}
            aoFechar={() => setPedidoAberto(null)}
            visaoCliente={tipoIdentidade === "pessoal"}
            acoes={
              <AcompanhamentoDoPedido
                pedidoId={pedidoAberto.id}
                {...(pedidoAberto.destino
                  ? {
                      destino: {
                        latitude: pedidoAberto.destino.latitude,
                        longitude: pedidoAberto.destino.longitude,
                      },
                    }
                  : {})}
              />
            }
          />
        )}
        {avisoPedido && (
          <p role="status" className="text-sm text-marca">
            {avisoPedido}
          </p>
        )}
        {erroPedido && !carrinhoAberto && (
          <p role="alert" className="text-sm text-perigo">
            {erroPedido}
          </p>
        )}
      </div>

      <ol
        ref={listaMensagensRef}
        aria-label="Mensagens"
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-4 md:px-[clamp(1rem,4vw,4.5rem)]"
      >
        {proximoCursor && (
          <li className="flex justify-center pb-2">
            <button
              type="button"
              onClick={() => void carregarAnteriores()}
              className="min-h-9 rounded-full border border-borda bg-superficie px-4 text-xs font-medium hover:bg-superficie-suave"
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
            !mesmoDia(new Date(anterior.criadoEm), new Date(mensagem.criadoEm));
          return (
            <Fragment key={mensagem.id}>
              {abreDia && (
                <li data-separador-dia className="flex justify-center py-1">
                  <span className="rounded-full bg-conteudo/[0.06] px-3 py-1 text-[0.66rem] text-conteudo-suave">
                    {rotuloDoDia(mensagem.criadoEm)}
                  </span>
                </li>
              )}
              <BalaoMensagem
                mensagem={mensagem}
                identidadeAtualId={identidadeId}
                nomeRemetente={outro.nomeExibicao}
                aoResponder={responder}
                aoEditar={iniciarEdicao}
                aoExcluirParaMim={(alvo) => void excluirParaMim(alvo)}
                aoExcluirParaTodos={(alvo) => void excluirParaTodos(alvo)}
                aoAbrirPedido={(pedidoId) => void abrirPedido(pedidoId)}
                visaoCliente={tipoIdentidade === "pessoal"}
              />
            </Fragment>
          );
        })}
      </ol>

      <div
        className="shrink-0 px-2 pt-1 md:px-6"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-1.5">
          {respondendo && (
            <PreviaRespostaCompositor
              resposta={respondendo}
              aoCancelar={cancelarResposta}
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

          <form
            onSubmit={aoEnviar}
            className="flex items-center gap-1 rounded-[1.4rem] border border-borda bg-superficie p-1.5 shadow-suave"
          >
            <AcoesMidiaDesabilitadas />
            <label htmlFor="campo-mensagem" className="sr-only">
              Mensagem
            </label>
            <input
              id="campo-mensagem"
              ref={campoMensagemRef}
              name="mensagem"
              value={texto}
              placeholder="Escreva uma mensagem"
              onChange={(evento) => {
                setTexto(evento.target.value);
                if (!editando) atividade.informarTexto(evento.target.value);
              }}
              maxLength={4000}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent px-1 py-2 text-base outline-none placeholder:text-conteudo-suave/60"
            />
            <button
              type="submit"
              disabled={ocupado}
              aria-label={rotuloEnvio}
              className={`grid h-10 shrink-0 place-items-center rounded-full bg-marca text-marca-conteudo disabled:opacity-50 ${rotuloEnvio === "Enviar" ? "w-10" : "px-4 text-xs font-medium"}`}
            >
              {rotuloEnvio === "Enviar" ? (
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="h-4 w-4 fill-current"
                >
                  <path d="M3.4 20.4 21 12 3.4 3.6 3.39 10.1 15.5 12 3.39 13.9z" />
                </svg>
              ) : (
                rotuloEnvio
              )}
            </button>
          </form>
        </div>
      </div>

      {erro && (
        <p role="alert" className="px-4 pb-2 text-sm text-perigo">
          {erro}
        </p>
      )}
    </section>
  );
}
