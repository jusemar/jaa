"use client";

import {
  enderecoTemLocalizacaoConfirmada,
  type Coordenadas,
  type EnderecoCliente,
} from "@jaa/contratos";
import { useCallback, useEffect, useState } from "react";
import {
  arquivarEndereco,
  atualizarEnderecoParaEmpresa,
  criarEnderecoParaEmpresa,
  listarEnderecos,
  obterSugestaoLocalizacaoDoRascunho,
  validarCoberturaEntrega,
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
  | {
      modo: "mapa";
      dados: DadosFormularioEndereco;
      enderecoOriginal: EnderecoCliente | null;
      sugestao: Coordenadas | null;
    };

const dadosDoEndereco = (
  endereco: EnderecoCliente,
): DadosFormularioEndereco => ({
  apelido: endereco.apelido,
  cep: endereco.cep,
  logradouro: endereco.logradouro,
  numero: endereco.numero,
  complemento: endereco.complemento,
  bairro: endereco.bairro,
  cidade: endereco.cidade,
  uf: endereco.uf,
  pontoReferencia: endereco.pontoReferencia,
});

export function EtapaEnderecoEntrega({
  empresaIdentidadeId,
  aoSelecionar,
  aoVoltar,
}: {
  empresaIdentidadeId: string;
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
    let sugestao: Coordenadas | null = null;
    if (jaConfirmado) {
      sugestao = {
        latitude: endereco.latitude as number,
        longitude: endereco.longitude as number,
      };
    } else {
      const resultado = await obterSugestaoLocalizacaoDoRascunho(
        empresaIdentidadeId,
        dadosDoEndereco(endereco),
      );
      sugestao = resultado.ok ? resultado.dados.coordenadas : null;
    }
    setEtapa({
      modo: "mapa",
      dados: dadosDoEndereco(endereco),
      enderecoOriginal: endereco,
      sugestao,
    });
  }

  // Selecionar: só segue direto quando o ponto já foi confirmado antes (primeira vez passa pelo mapa).
  async function usar(endereco: EnderecoCliente) {
    if (!enderecoTemLocalizacaoConfirmada(endereco)) {
      await abrirMapa(endereco);
      return;
    }
    const cobertura = await validarCoberturaEntrega(empresaIdentidadeId, {
      latitude: endereco.latitude as number,
      longitude: endereco.longitude as number,
    });
    if (!cobertura.ok || !cobertura.dados.atendida) {
      setErro(
        cobertura.ok
          ? "Esta empresa ainda não realiza entregas neste endereço."
          : cobertura.mensagem,
      );
      return;
    }
    setErro(null);
    aoSelecionar(endereco);
  }

  async function salvar(dados: DadosFormularioEndereco) {
    setErro(null);
    setEnviando(true);
    try {
      const enderecoOriginal = etapa.modo === "editar" ? etapa.endereco : null;
      const resultado = await obterSugestaoLocalizacaoDoRascunho(
        empresaIdentidadeId,
        dados,
      );
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setEtapa({
        modo: "mapa",
        dados,
        enderecoOriginal,
        sugestao: resultado.dados.coordenadas,
      });
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarPonto(coordenadas: Coordenadas) {
    if (etapa.modo !== "mapa") return;
    setErro(null);
    setEnviando(true);
    try {
      const resultado = etapa.enderecoOriginal
        ? await atualizarEnderecoParaEmpresa(
            etapa.enderecoOriginal.id,
            empresaIdentidadeId,
            etapa.dados,
            coordenadas,
          )
        : await criarEnderecoParaEmpresa(
            empresaIdentidadeId,
            etapa.dados,
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
        empresaIdentidadeId={empresaIdentidadeId}
        endereco={{
          ...etapa.dados,
          complemento: etapa.dados.complemento ?? null,
          pontoReferencia: etapa.dados.pontoReferencia ?? null,
        }}
        chaveMapa={etapa.enderecoOriginal?.id ?? "novo"}
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
            aoUsar={(endereco) => void usar(endereco)}
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
