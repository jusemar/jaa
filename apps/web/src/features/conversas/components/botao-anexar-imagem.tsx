"use client";

import { TIPOS_IMAGEM_ACEITOS } from "@jaa/contratos";
import { useRef } from "react";
import { IconeAnexo } from "@/components/ui/icones";

/*
 * ANEXAR IMAGEM, dentro do compositor: o clipe abre o seletor de arquivo do navegador.
 * UMA imagem por mensagem (sem seleção múltipla) e só os formatos que a API aceita. Fechar o seletor
 * sem escolher nada não é erro: nada acontece. Vídeo, áudio e documento ainda não existem.
 */
export const ROTULO_ANEXAR = "Anexar foto";

/** Primeiro arquivo da seleção; lista vazia ou seletor cancelado = null. */
export function arquivoEscolhido(arquivos: ArrayLike<File> | null | undefined): File | null {
  return arquivos && arquivos.length > 0 ? (arquivos[0] ?? null) : null;
}

export function BotaoAnexarImagem({ desabilitado = false, aoEscolher }: { desabilitado?: boolean; aoEscolher: (arquivo: File) => void }) {
  const entrada = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <input
        ref={entrada}
        type="file"
        accept={TIPOS_IMAGEM_ACEITOS.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-seletor-imagem
        onChange={(evento) => {
          const arquivo = arquivoEscolhido(evento.target.files);
          // Zera para que escolher o MESMO arquivo de novo dispare a mudança outra vez.
          evento.target.value = "";
          if (arquivo) aoEscolher(arquivo);
        }}
      />
      <button
        type="button"
        disabled={desabilitado}
        aria-label={ROTULO_ANEXAR}
        title={ROTULO_ANEXAR}
        data-anexar-imagem
        onClick={() => entrada.current?.click()}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-conteudo-suave transition-colors hover:bg-realce hover:text-conteudo disabled:cursor-not-allowed disabled:opacity-50"
      >
        <IconeAnexo className="h-5 w-5" />
      </button>
    </>
  );
}
