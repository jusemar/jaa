"use client";

import {
  enderecoTemLocalizacaoConfirmada,
  type Coordenadas,
  type EnderecoCliente,
} from "@jaa/contratos";
import { useCallback, useEffect, useState } from "react";
import {
  arquivarEndereco,
  atualizarEndereco,
  confirmarLocalizacao,
  criarEndereco,
  listarEnderecos,
  obterSugestaoLocalizacao,
} from "../lib/api-enderecos";
import { ConfirmarPontoEntrega } from "./confirmar-ponto-entrega";
import {
  FormularioEndereco,
  type DadosFormularioEndereco,
} from "./formulario-endereco";
import { ListaEnderecos } from "./lista-enderecos";

/**
 * "Entregar em": etapa do carrinho ANTES do pagamento. O pedido de entrega não é criado sem destino.
 *
 * Fluxo: escolher/cadastrar endereço → se o ponto ainda não foi confirmado, abrir o mapa e confirmar
 * (uma vez só por endereço) → seguir para o pagamento. Endereço já confirmado é reutilizado direto.
 */

type Etapa =
  | { modo: "lista" }
  | { modo: "novo" }
  | { modo: "editar"; endereco: EnderecoCliente }
  | { modo: "mapa"; endereco: EnderecoCliente; sugestao: Coordenadas | null };

export function EtapaEnderecoEntrega({
  aoSelecionar,
  aoVoltar,
}: {
  aoSelecionar: (endereco: EnderecoCliente) => void;
  aoVoltar: () => void;
}) {
  const [enderecos, setEnderecos] = useState<EnderecoCliente[]>([]);
  const [etapa, setEtapa] = useState<Etapa>({ modo: "lista" });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let ativo = true;
    void listarEnderecos().then((resultado) => {
      if (!ativo) return;
      if (resultado.ok) setEnderecos(resultado.dados.enderecos);
      else setErro(resultado.mensagem);
    });
    return () => {
      ativo = false;
    };
  }, []);

  const recarregar = useCallback(async () => {
    const resultado = await listarEnderecos();
    if (resultado.ok) setEnderecos(resultado.dados.enderecos);
    else setErro(resultado.mensagem);
  }, []);

  // Abrir o mapa busca um palpite de geocodificação (quando houver serviço); ele não confirma nada.
  async function abrirMapa(endereco: EnderecoCliente) {
    setErro(null);
    const jaConfirmado = enderecoTemLocalizacaoConfirmada(endereco);
    const sugestao = jaConfirmado
      ? null
      : await obterSugestaoLocalizacao(endereco.id);
    setEtapa({
      modo: "mapa",
      endereco,
      sugestao: sugestao?.ok ? sugestao.dados.coordenadas : null,
    });
  }

  // Selecionar: só segue direto quando o ponto já foi confirmado antes (primeira vez passa pelo mapa).
  function usar(endereco: EnderecoCliente) {
    if (!enderecoTemLocalizacaoConfirmada(endereco)) {
      void abrirMapa(endereco);
      return;
    }
    aoSelecionar(endereco);
  }

  async function salvar(dados: DadosFormularioEndereco) {
    setErro(null);
    setEnviando(true);
    try {
      const resultado =
        etapa.modo === "editar"
          ? await atualizarEndereco(etapa.endereco.id, dados)
          : await criarEndereco(dados);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      await recarregar();
      // Endereço novo (ou alterado a ponto de perder a confirmação) vai direto para o mapa.
      if (enderecoTemLocalizacaoConfirmada(resultado.dados))
        setEtapa({ modo: "lista" });
      else await abrirMapa(resultado.dados);
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarPonto(coordenadas: Coordenadas) {
    if (etapa.modo !== "mapa") return;
    setErro(null);
    setEnviando(true);
    try {
      const resultado = await confirmarLocalizacao(
        etapa.endereco.id,
        coordenadas,
      );
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      await recarregar();
      // Confirmar o ponto conclui a escolha iniciada no carrinho, tanto para endereço existente
      // quanto para um endereço acabado de cadastrar.
      aoSelecionar(resultado.dados);
    } finally {
      setEnviando(false);
    }
  }

  async function remover(endereco: EnderecoCliente) {
    if (
      !window.confirm(
        `Remover o endereço "${endereco.apelido}"? Pedidos antigos continuam com o endereço usado na época.`,
      )
    )
      return;
    const resultado = await arquivarEndereco(endereco.id);
    if (!resultado.ok) {
      setErro(resultado.mensagem);
      return;
    }
    await recarregar();
  }

  if (etapa.modo === "mapa") {
    return (
      <ConfirmarPontoEntrega
        endereco={
          enderecos.find((salvo) => salvo.id === etapa.endereco.id) ??
          etapa.endereco
        }
        sugestao={etapa.sugestao}
        enviando={enviando}
        erro={erro}
        aoConfirmar={(coordenadas) => void confirmarPonto(coordenadas)}
        aoCancelar={() => setEtapa({ modo: "lista" })}
      />
    );
  }

  return (
    <section
      aria-label="Endereço de entrega"
      className="flex flex-col gap-2 rounded-jaa border border-borda bg-superficie p-3 text-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Escolha um endereço</h3>
        <button type="button" onClick={aoVoltar} className="text-xs underline">
          Voltar ao carrinho
        </button>
      </div>

      {etapa.modo === "lista" && (
        <>
          <ListaEnderecos
            enderecos={enderecos}
            selecionadoId={null}
            aoUsar={usar}
            aoEditar={(endereco) => setEtapa({ modo: "editar", endereco })}
            aoAjustarPonto={(endereco) => void abrirMapa(endereco)}
            aoRemover={(endereco) => void remover(endereco)}
          />
          <button
            type="button"
            data-novo-endereco
            onClick={() => setEtapa({ modo: "novo" })}
            className="self-start rounded-jaa border px-3 py-1.5 text-xs"
          >
            {enderecos.length === 0
              ? "+ Cadastrar endereço"
              : "+ Novo endereço"}
          </button>
        </>
      )}

      {(etapa.modo === "novo" || etapa.modo === "editar") && (
        <FormularioEndereco
          {...(etapa.modo === "editar" ? { endereco: etapa.endereco } : {})}
          enviando={enviando}
          aoSalvar={(dados) => void salvar(dados)}
          aoCancelar={() => setEtapa({ modo: "lista" })}
        />
      )}

      {erro && (
        <p role="alert" className="text-perigo">
          {erro}
        </p>
      )}
    </section>
  );
}
