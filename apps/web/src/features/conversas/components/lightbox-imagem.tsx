"use client";

import { useEffect } from "react";
import { IconeFechar } from "@/components/ui/icones";
import { ehTeclaDeFechar, travarRolagem } from "../lib/trava-rolagem";

/*
 * IMAGEM AMPLIADA: uma foto só, centralizada sobre o fundo escurecido, dentro da tela. Fecha no X,
 * com Esc e ao clicar no fundo; enquanto aberta, a rolagem da página fica travada e é restaurada ao
 * fechar. Sem navegação entre fotos nesta versão.
 */
export function LightboxImagem({ url, descricao, aoFechar, aoFalhar }: { url: string; descricao: string; aoFechar: () => void; aoFalhar?: () => void }) {
  useEffect(() => {
    const destravar = travarRolagem(document.body);
    const aoTeclar = (evento: KeyboardEvent) => {
      if (ehTeclaDeFechar(evento.key)) aoFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      destravar();
    };
  }, [aoFechar]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Imagem ampliada"
      data-lightbox-imagem
      onClick={aoFechar}
      className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4"
    >
      <button
        type="button"
        autoFocus
        aria-label="Fechar imagem"
        title="Fechar"
        onClick={aoFechar}
        className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
      >
        <IconeFechar className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={descricao}
        onError={aoFalhar}
        // Clicar na própria imagem não fecha.
        onClick={(evento) => evento.stopPropagation()}
        className="max-h-[calc(100dvh-2rem)] max-w-full rounded-jaa-compacto object-contain"
      />
    </div>
  );
}
