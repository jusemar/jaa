"use client";

import {
  enderecoTemLocalizacaoConfirmada,
  formatarCep,
  formatarEnderecoResumido,
  type EnderecoCliente,
} from "@jaa/contratos";

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
  if (enderecos.length === 0)
    return (
      <p className="text-sm text-conteudo-suave">
        Você ainda não possui endereço de entrega cadastrado.
      </p>
    );

  return (
    <ol
      aria-label="Endereços salvos"
      className="flex flex-col divide-y divide-borda rounded-jaa border border-borda text-sm"
    >
      {enderecos.map((endereco) => {
        const confirmado = enderecoTemLocalizacaoConfirmada(endereco);
        return (
          <li
            key={endereco.id}
            data-endereco={endereco.id}
            data-selecionado={endereco.id === selecionadoId}
            /*
              Degradação progressiva SEM breakpoint: o bloco de texto tem `basis-56`, então enquanto
              couber texto + ações na mesma linha elas convivem; quando não cabe, o texto ocupa a
              linha inteira e as ações descem para a linha seguinte. Nada desaparece e nada vaza.
            */
            className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5"
          >
            {/*
              `min-w-0` + `overflow-wrap: anywhere`: a lista também aparece na coluna estreita do
              pedido, e rua/bairro/cidade longos precisam QUEBRAR LINHA em vez de alargar a coluna.
              Nada é cortado — é o endereço da entrega, tem de ser lido inteiro.
            */}
            <span className="flex min-w-0 flex-1 basis-56 flex-col">
              <span className="text-xs text-conteudo-suave [overflow-wrap:anywhere]">
                {formatarEnderecoResumido(endereco)}
              </span>
              <span className="text-xs text-conteudo-suave [overflow-wrap:anywhere]">
                {endereco.bairro}, {endereco.cidade}/{endereco.uf} · CEP{" "}
                {formatarCep(endereco.cep)}
              </span>
              {/* Reutilização: endereço já confirmado não exige passar pelo mapa de novo. */}
              <span
                data-localizacao={confirmado ? "confirmada" : "pendente"}
                className={`text-xs ${confirmado ? "text-marca" : "text-aviso"}`}
              >
                {confirmado
                  ? "📍 Localização confirmada"
                  : "Ponto de entrega ainda não confirmado"}
              </span>
            </span>
            {/*
              As ações NUNCA somem nem saem do card: a faixa quebra sozinha (`flex-wrap`) e cada
              botão tem alvo de toque de 36px. Sem `shrink-0` no bloco todo — era ele que impedia a
              faixa de ceder espaço e fazia os botões vazarem em coluna estreita.
            */}
            <span className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                data-usar-endereco
                aria-label={`Usar este endereço: ${endereco.apelido}`}
                onClick={() => aoUsar(endereco)}
                className="min-h-9 rounded-jaa-compacto bg-marca px-3 text-xs font-medium text-marca-conteudo transition-colors hover:bg-marca/90"
              >
                Usar este
              </button>
              <button
                type="button"
                aria-label={`${confirmado ? "Ajustar ponto no mapa" : "Confirmar no mapa"}: ${endereco.apelido}`}
                onClick={() => aoAjustarPonto(endereco)}
                className="min-h-9 rounded-jaa-compacto border border-borda px-3 text-xs font-medium transition-colors hover:bg-realce"
              >
                {confirmado ? "Ajustar ponto" : "Confirmar no mapa"}
              </button>
              <button
                type="button"
                aria-label={`Editar ${endereco.apelido}`}
                onClick={() => aoEditar(endereco)}
                className="min-h-9 rounded-jaa-compacto border border-borda px-3 text-xs font-medium transition-colors hover:bg-realce"
              >
                Editar
              </button>
              {aoRemover && (
                <button
                  type="button"
                  aria-label={`Remover ${endereco.apelido}`}
                  onClick={() => aoRemover(endereco)}
                  className="min-h-9 rounded-jaa-compacto px-3 text-xs font-medium text-conteudo-suave transition-colors hover:bg-perigo/10 hover:text-perigo"
                >
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
