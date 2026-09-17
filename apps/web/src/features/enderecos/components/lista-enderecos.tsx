"use client";

import { enderecoTemLocalizacaoConfirmada, formatarCep, formatarEnderecoResumido, type EnderecoCliente } from "@jaa/contratos";

// "Entregar em": endereços salvos do cliente. O selo diz se o ponto de entrega já foi confirmado.

export function ListaEnderecos({
  enderecos,
  selecionadoId,
  aoUsar,
  aoEditar,
  aoAjustarPonto,
  aoRemover,
}: {
  enderecos: EnderecoCliente[];
  selecionadoId: string | null;
  aoUsar: (endereco: EnderecoCliente) => void;
  aoEditar: (endereco: EnderecoCliente) => void;
  aoAjustarPonto: (endereco: EnderecoCliente) => void;
  aoRemover?: ((endereco: EnderecoCliente) => void) | undefined;
}) {
  if (enderecos.length === 0) return <p className="text-sm text-conteudo-suave">Você ainda não tem endereços salvos.</p>;

  return (
    <ol aria-label="Endereços salvos" className="flex flex-col divide-y divide-borda rounded-jaa border border-borda text-sm">
      {enderecos.map((endereco) => {
        const confirmado = enderecoTemLocalizacaoConfirmada(endereco);
        return (
          <li key={endereco.id} data-endereco={endereco.id} data-selecionado={endereco.id === selecionadoId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span className="flex min-w-0 flex-col">
              <span className="font-medium">{endereco.apelido}</span>
              <span className="text-xs text-conteudo-suave">{formatarEnderecoResumido(endereco)}</span>
              <span className="text-xs text-conteudo-suave">
                {endereco.bairro}, {endereco.cidade}/{endereco.uf} · CEP {formatarCep(endereco.cep)}
              </span>
              {/* Reutilização: endereço já confirmado não exige passar pelo mapa de novo. */}
              <span data-localizacao={confirmado ? "confirmada" : "pendente"} className={`text-xs ${confirmado ? "text-marca" : "text-aviso"}`}>
                {confirmado ? "📍 Localização confirmada" : "Ponto de entrega ainda não confirmado"}
              </span>
            </span>
            <span className="flex shrink-0 flex-wrap items-center gap-1">
              <button type="button" data-usar-endereco onClick={() => aoUsar(endereco)} className="rounded bg-marca px-2 py-1 text-xs text-white">
                Usar este endereço
              </button>
              <button type="button" onClick={() => aoAjustarPonto(endereco)} className="rounded-jaa border px-2 py-1 text-xs">
                {confirmado ? "Ajustar ponto no mapa" : "Confirmar no mapa"}
              </button>
              <button type="button" onClick={() => aoEditar(endereco)} className="rounded-jaa border px-2 py-1 text-xs">
                Editar
              </button>
              {aoRemover && (
                <button type="button" aria-label={`Remover ${endereco.apelido}`} onClick={() => aoRemover(endereco)} className="rounded px-1 text-xs underline">
                  Remover
                </button>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
