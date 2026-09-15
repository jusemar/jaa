"use client";

import {
  EVENTO_MENSAGEM_NOVA,
  eventoMensagemNovaSchema,
  type Mensagem,
  type ParticipanteConversa,
} from "@jaa/contratos";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { enviarMensagem, listarMensagens } from "../lib/api-conversas";

// Interface TÉCNICA e TEMPORÁRIA para comprovar o núcleo de mensagens 1:1. Não é o design do Jaa.
// Autorização, remetente, persistência e idempotência são impostos pela API.

type TentativaEnvio = { idCliente: string; conteudo: string };

// Aberta pela lista ou pelo @usuario; a autorização de leitura/envio continua sendo da API.
export type ConversaAberta = { id: string; outraIdentidade: ParticipanteConversa };

// Une mensagens do histórico, da resposta HTTP e do realtime sem duplicar; ordena pelo id (UUIDv7).
function mesclar(atuais: Mensagem[], novas: Mensagem[]): Mensagem[] {
  const porId = new Map(atuais.map((mensagem) => [mensagem.id, mensagem]));
  for (const mensagem of novas) porId.set(mensagem.id, mensagem);
  return [...porId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function ConversaTecnica({
  identidadeId,
  conversa,
  aoMensagemConfirmada,
}: {
  identidadeId: string;
  conversa: ConversaAberta;
  // A resposta HTTP do envio também atualiza a lista, mesmo sem realtime.
  aoMensagemConfirmada: (mensagem: Mensagem) => void;
}) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [proximoCursor, setProximoCursor] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [pendente, setPendente] = useState<TentativaEnvio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const adicionar = useCallback((novas: Mensagem[]) => {
    setMensagens((atuais) => mesclar(atuais, novas));
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

    // Ao (re)conectar, busca as mais recentes: cobre mensagens chegadas enquanto estava desconectado.
    const aoConectar = () => {
      void listarMensagens(conversa.id).then((pagina) => {
        if (pagina.ok) adicionar(pagina.dados.mensagens);
      });
    };

    socket.on(EVENTO_MENSAGEM_NOVA, aoReceber);
    socket.on("connect", aoConectar);
    return () => {
      socket.off(EVENTO_MENSAGEM_NOVA, aoReceber);
      socket.off("connect", aoConectar);
    };
  }, [conversa.id, adicionar]);

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
        return;
      }
      if (resultado.status === 0 || resultado.status >= 500) {
        // Pode ter sido salva ou não: mantém a tentativa para reenviar com o mesmo idCliente.
        setErro("Falha ao enviar. Reenvie para tentar de novo sem duplicar.");
        return;
      }
      setPendente(null);
      setErro(resultado.mensagem);
    } finally {
      setOcupado(false);
    }
  }

  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const conteudo = texto.trim();
    if (!conteudo) return;
    void enviar(pendente?.conteudo === conteudo ? pendente : { idCliente: crypto.randomUUID(), conteudo });
  }

  const outro = conversa.outraIdentidade;

  return (
    <section aria-label="Conversa" className="flex flex-col gap-3 border-t border-zinc-200 pt-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">Conversa com @{outro.nomeUsuario}</h2>
        {proximoCursor && (
          <button type="button" className="self-start text-sm underline" onClick={() => void carregarAnteriores()}>
            Carregar anteriores
          </button>
        )}
        <ol aria-label="Mensagens" className="flex max-h-72 flex-col gap-1 overflow-y-auto text-sm">
          {mensagens.length === 0 && <li className="text-zinc-500">Nenhuma mensagem ainda.</li>}
          {mensagens.map((mensagem) => (
            <li key={mensagem.id} className="whitespace-pre-wrap break-words">
              <span className="font-medium">
                {mensagem.remetenteIdentidadeId === identidadeId ? "Você" : `@${outro.nomeUsuario}`}:
              </span>{" "}
              {mensagem.conteudo}
            </li>
          ))}
        </ol>
        <form onSubmit={aoEnviar} className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Mensagem
            <input
              name="mensagem"
              value={texto}
              onChange={(evento) => setTexto(evento.target.value)}
              maxLength={4000}
              className="rounded border border-zinc-300 px-3 py-2 text-base"
            />
          </label>
          <button type="submit" disabled={ocupado} className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50">
            {pendente && !ocupado ? "Reenviar" : "Enviar"}
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
