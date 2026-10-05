"use client";

import { useEffect, useState } from "react";
import { avisar } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/primitivos";
import { linkDoJaa } from "../lib/link-do-jaa";

/**
 * LINK DO JAA de uma identidade, como LINK de verdade (clicável) + "Copiar". O endereço usa o site em
 * que a pessoa está agora, por isso só existe depois de montar no navegador.
 *
 * Clicar no link de OUTRA identidade dentro do app pode abrir a conversa aqui mesmo (`aoAbrir`);
 * sem isso é um link comum para `/@usuario`.
 */
export function LinkDoJaa({ nomeUsuario, aoAbrir }: { nomeUsuario: string; aoAbrir?: (() => void) | undefined }) {
  const [origem, setOrigem] = useState<string | null>(null);
  useEffect(() => {
    void Promise.resolve().then(() => setOrigem(window.location.origin));
  }, []);
  const link = origem ? linkDoJaa(origem, nomeUsuario) : null;

  async function copiar() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      avisar.sucesso("Link copiado");
    } catch {
      // Navegador sem permissão de área de transferência: o endereço continua selecionável na tela.
      avisar.alerta("Não foi possível copiar. Selecione o endereço e copie manualmente.");
    }
  }

  return (
    <div data-link-do-jaa className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
      {link ? (
        <a
          href={link}
          onClick={(evento) => {
            if (!aoAbrir || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.button !== 0) return;
            evento.preventDefault();
            aoAbrir();
          }}
          className="min-w-0 flex-1 break-all text-sm font-medium text-marca underline decoration-1 underline-offset-2"
        >
          {link}
        </a>
      ) : (
        <span className="min-w-0 flex-1 text-sm text-conteudo-suave">…</span>
      )}
      <Botao type="button" aparencia="secundario" disabled={!link} onClick={() => void copiar()} className="shrink-0">
        Copiar link
      </Botao>
    </div>
  );
}
