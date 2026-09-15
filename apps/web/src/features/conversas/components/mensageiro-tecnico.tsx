"use client";

import type { ParticipanteConversa } from "@jaa/contratos";
import { useState, type FormEvent } from "react";
import { useListaConversas } from "../hooks/use-lista-conversas";
import { abrirConversaDireta } from "../lib/api-conversas";
import { ConversaTecnica, type ConversaAberta } from "./conversa-tecnica";
import { ListaConversas } from "./lista-conversas";

// Interface TÉCNICA e TEMPORÁRIA: lista de conversas + conversa aberta. Não é o design do Jaa.

export function MensageiroTecnico({ identidadeId }: { identidadeId: string }) {
  const lista = useListaConversas();
  const [conversaAberta, setConversaAberta] = useState<ConversaAberta | null>(null);
  const [destino, setDestino] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);

  async function abrirPorNomeUsuario(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setAbrindo(true);
    try {
      const aberta = await abrirConversaDireta(destino);
      if (!aberta.ok) {
        setErro(aberta.mensagem);
        return;
      }
      const outra: ParticipanteConversa | undefined = aberta.dados.participantes.find((p) => p.identidadeId !== identidadeId);
      if (outra) setConversaAberta({ id: aberta.dados.id, outraIdentidade: outra });
    } finally {
      setAbrindo(false);
    }
  }

  return (
    <section aria-label="Mensageiro" className="flex flex-col gap-4 border-t border-zinc-200 pt-4">
      <form onSubmit={(evento) => void abrirPorNomeUsuario(evento)} className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          @usuario do contato
          <input
            name="destino"
            value={destino}
            onChange={(evento) => setDestino(evento.target.value)}
            placeholder="@usuario"
            required
            className="rounded border border-zinc-300 px-3 py-2 text-base"
          />
        </label>
        <button type="submit" disabled={abrindo} className="rounded border px-3 py-2 text-sm disabled:opacity-50">
          Abrir conversa
        </button>
      </form>
      {erro && (
        <p role="alert" className="text-sm text-red-600">
          {erro}
        </p>
      )}

      <ListaConversas
        identidadeId={identidadeId}
        itens={lista.itens}
        carregando={!lista.primeiraPaginaCarregada && !lista.erro}
        erro={lista.erro}
        temMais={lista.proximoCursor !== null}
        carregandoMais={lista.carregandoMais}
        conversaAbertaId={conversaAberta?.id ?? null}
        aoAbrir={(item) => setConversaAberta({ id: item.id, outraIdentidade: item.outraIdentidade })}
        aoCarregarMais={() => void lista.carregarMais()}
      />

      {conversaAberta && (
        // `key`: trocar de conversa recomeça o estado (histórico, envio pendente) do zero.
        <ConversaTecnica
          key={conversaAberta.id}
          identidadeId={identidadeId}
          conversa={conversaAberta}
          aoMensagemConfirmada={lista.registrarMensagem}
        />
      )}
    </section>
  );
}
