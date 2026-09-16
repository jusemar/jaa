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
} from "@jaa/contratos";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
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
  ultimaMensagemRecebida,
} from "../lib/estados-mensagens";
import { resumirConteudoParaPrevia, rotuloAutorResposta } from "../lib/respostas";
import { CatalogoDaEmpresa } from "@/features/catalogo/components/catalogo-da-empresa";
import { AcoesMidiaDesabilitadas } from "./acoes-midia-desabilitadas";
import { BalaoMensagem } from "./balao-mensagem";
import { BarraContextoCompositor } from "./barra-contexto-compositor";
import { CabecalhoConversa } from "./cabecalho-conversa";
import { PreviaRespostaCompositor, type RespostaEmComposicao } from "./previa-resposta-compositor";

// Interface TÉCNICA e TEMPORÁRIA para comprovar o núcleo de mensagens 1:1. Não é o design do Jaa.
// Autorização, remetente, persistência e idempotência são impostos pela API.

// A referência de resposta faz parte da tentativa: reenviar reutiliza idCliente, conteúdo e referência.
type TentativaEnvio = { idCliente: string; conteudo: string; mensagemRespondidaId?: string };

// Aberta pela lista ou pelo @usuario; a autorização de leitura/envio continua sendo da API.
export type ConversaAberta = { id: string; outraIdentidade: ParticipanteConversa };

export function ConversaTecnica({
  identidadeId,
  conversa,
  aoMensagemConfirmada,
  aoMensagemAtualizada,
  aoMensagemExcluidaParaMim,
}: {
  identidadeId: string;
  conversa: ConversaAberta;
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
  const [respostaSelecionada, setRespondendo] = useState<RespostaEmComposicao | null>(null);
  // Mensagem própria em edição: o compositor passa a salvar o novo conteúdo em vez de enviar.
  const [edicaoSelecionada, setEditando] = useState<Mensagem | null>(null);
  // Resposta/edição só valem enquanto a mensagem continua visível e não excluída (ex.: excluída em outra aba).
  const disponivel = (id: string) => mensagens.some((mensagem) => mensagem.id === id && !mensagem.excluidaEm);
  const respondendo = respostaSelecionada && disponivel(respostaSelecionada.mensagemId) ? respostaSelecionada : null;
  const editando = edicaoSelecionada && disponivel(edicaoSelecionada.id) ? edicaoSelecionada : null;
  const campoMensagemRef = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Catálogo (consulta de cliente) aberto dentro da conversa com uma empresa.
  const [catalogoAberto, setCatalogoAberto] = useState(false);
  const atividade = useAtividadeConversa({ conversaId: conversa.id, outraIdentidadeId: conversa.outraIdentidade.identidadeId });
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
      if (resultado.success && resultado.data.mensagem.conversaId === conversa.id) {
        adicionar([resultado.data.mensagem]);
      }
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
      if (!resultado.ok && leituraConfirmadaRef.current === alvo.id) leituraConfirmadaRef.current = confirmada;
    });
  }, [conversa.id, identidadeId, mensagens, historicoCarregado, documentoVisivel]);

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
      if (resultado.codigo === "MENSAGEM_RESPONDIDA_NAO_ENCONTRADA") setRespondendo(null);
    } finally {
      setOcupado(false);
    }
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
      aoMensagemAtualizada(resultado.dados);
      setEditando(null);
      setTexto("");
    } finally {
      setOcupado(false);
    }
  }

  async function excluirParaMim(mensagem: Mensagem) {
    if (!window.confirm("Excluir esta mensagem só para você? As outras pessoas continuarão vendo.")) return;
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
    if (!window.confirm("Excluir esta mensagem para todos? O conteúdo será removido para todos os participantes.")) return;
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
    const mesmaTentativa = pendente?.conteudo === conteudo && pendente.mensagemRespondidaId === mensagemRespondidaId;
    void enviar(
      mesmaTentativa
        ? pendente
        : { idCliente: crypto.randomUUID(), conteudo, ...(mensagemRespondidaId ? { mensagemRespondidaId } : {}) },
    );
  }

  // Responder não interfere no "digitando": só muda a referência da próxima mensagem.
  function responder(mensagem: Mensagem) {
    setRespondendo({
      mensagemId: mensagem.id,
      nomeAutor: rotuloAutorResposta(mensagem.remetenteIdentidadeId, conversa.outraIdentidade.nomeExibicao, identidadeId),
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

  const outro = conversa.outraIdentidade;

  return (
    <section aria-label="Conversa" className="flex flex-col gap-3">
      <CabecalhoConversa
        outraIdentidade={outro}
        presenca={atividade.presenca}
        digitando={atividade.outraDigitando}
        acoes={
          outro.tipo === "empresarial" && (
            <button type="button" onClick={() => setCatalogoAberto((aberto) => !aberto)} className="shrink-0 rounded border px-2 py-1 text-xs">
              {catalogoAberto ? "Ocultar produtos" : "Ver produtos"}
            </button>
          )
        }
      />
      {catalogoAberto && outro.tipo === "empresarial" && <CatalogoDaEmpresa identidadeEmpresaId={outro.identidadeId} aoFechar={() => setCatalogoAberto(false)} />}
      <div className="flex flex-col gap-2">
        {proximoCursor && (
          <button type="button" className="self-start text-sm underline" onClick={() => void carregarAnteriores()}>
            Carregar anteriores
          </button>
        )}
        <ol ref={listaMensagensRef} aria-label="Mensagens" className="flex h-96 flex-col gap-1.5 overflow-y-auto text-sm">
          {mensagens.length === 0 && <li className="text-zinc-500">Nenhuma mensagem ainda.</li>}
          {mensagens.map((mensagem) => (
            <BalaoMensagem
              key={mensagem.id}
              mensagem={mensagem}
              identidadeAtualId={identidadeId}
              nomeRemetente={outro.nomeExibicao}
              aoResponder={responder}
              aoEditar={iniciarEdicao}
              aoExcluirParaMim={(alvo) => void excluirParaMim(alvo)}
              aoExcluirParaTodos={(alvo) => void excluirParaTodos(alvo)}
            />
          ))}
        </ol>
        {respondendo && <PreviaRespostaCompositor resposta={respondendo} aoCancelar={cancelarResposta} />}
        {editando && (
          <BarraContextoCompositor titulo="Editando mensagem" texto={editando.conteudo} aoCancelar={cancelarEdicao} rotuloCancelar="Cancelar edição" />
        )}
        <AcoesMidiaDesabilitadas />
        <form onSubmit={aoEnviar} className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Mensagem
            <input
              ref={campoMensagemRef}
              name="mensagem"
              value={texto}
              onChange={(evento) => {
                setTexto(evento.target.value);
                if (!editando) atividade.informarTexto(evento.target.value);
              }}
              maxLength={4000}
              autoComplete="off"
              className="rounded border border-zinc-300 px-3 py-2 text-base"
            />
          </label>
          <button type="submit" disabled={ocupado} className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50">
            {editando ? "Salvar" : pendente && !ocupado ? "Reenviar" : "Enviar"}
          </button>
        </form>
      </div>

      {erro && (
        <p role="alert" className="text-sm text-red-600">
          {erro}
        </p>
      )}
    </section>
  );
}
