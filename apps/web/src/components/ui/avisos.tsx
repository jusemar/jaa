"use client";

import { Toaster, toast } from "sonner";

/*
 * AVISOS DE AÇÃO (toast) — wrapper do Jaa sobre o Sonner (seção 17: nada de usar a biblioteca direto).
 *
 * Só para o que importa: algo foi SALVO/CONCLUÍDO, algo DEU ERRADO, ou um ALERTA relevante. Clique
 * em checkbox não gera aviso. Erro de campo continua junto do campo: o toast nunca é o único lugar
 * onde um erro aparece.
 *
 * O visual padrão do Sonner fica desligado (`unstyled`): cores e formas são os tokens do Jaa, com
 * sentido semântico (sucesso na cor da marca, erro em "perigo", alerta em "aviso").
 */

const BASE = "flex w-[min(24rem,calc(100vw-2rem))] items-start gap-2 rounded-jaa border px-4 py-3 text-sm font-medium shadow-cartao";

export function AvisosDeAcao() {
  return (
    <Toaster
      position="bottom-center"
      // No celular fica ACIMA da barra de navegação inferior.
      mobileOffset={{ bottom: 88 }}
      visibleToasts={3}
      duration={3500}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: BASE,
          success: "border-marca/30 bg-marca-suave text-marca-suave-conteudo",
          error: "border-perigo/30 bg-superficie text-perigo",
          warning: "border-aviso/30 bg-superficie text-aviso",
          info: "border-borda bg-superficie text-conteudo",
        },
      }}
    />
  );
}

export interface Avisador {
  sucesso: (mensagem: string) => void;
  erro: (mensagem: string) => void;
  alerta: (mensagem: string) => void;
  informacao: (mensagem: string) => void;
}

export const avisar: Avisador = {
  sucesso: (mensagem) => void toast.success(mensagem),
  // Erro fica mais tempo: dá para ler antes de sumir.
  erro: (mensagem) => void toast.error(mensagem, { duration: 6000 }),
  alerta: (mensagem) => void toast.warning(mensagem, { duration: 5000 }),
  informacao: (mensagem) => void toast.info(mensagem),
};

// Aviso que a pessoa PRECISA notar (título + orientação), por mais tempo — ex.: "sua entrega é a próxima".
export function avisarEmDestaque(titulo: string, descricao: string): void {
  toast(titulo, { description: descricao, duration: 15000 });
}
