"use client";

import {
  EVENTO_FILA_ATUALIZADA,
  RAIO_BASE_MAXIMO_METROS,
  RAIO_BASE_MINIMO_METROS,
  UNIDADES_FEDERACAO,
  baseTemPontoConfirmado,
  eventoFilaAtualizadaSchema,
  formatarCep,
  type BaseEmpresa,
  type PainelOperacional,
} from "@jaa/contratos";
import { useEffect, useState, type FormEvent } from "react";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { confirmarPontoBase, obterBase, obterPainelOperacional, salvarBase } from "../lib/api-entregas";
import { ConfirmarPontoBase } from "./confirmar-ponto-base";
import { QuadroDaFila } from "./fila-apresentacao";

/**
 * OPERAÇÃO DA BASE (visão da empresa): onde fica a base e quem está disponível agora.
 * É acompanhamento OPERACIONAL, não localização em tempo real: a empresa vê apenas estados
 * derivados ("na base", "fora da base"), nunca a posição de ninguém.
 */
export function PainelOperacionalEmpresa({ empresaId, nomeEmpresa }: { empresaId: string; nomeEmpresa: string }) {
  const [base, setBase] = useState<BaseEmpresa | null>(null);
  const [painel, setPainel] = useState<PainelOperacional | null>(null);
  const [editando, setEditando] = useState(false);
  const [confirmandoPonto, setConfirmandoPonto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let ativo = true;
    void Promise.all([obterBase(empresaId), obterPainelOperacional(empresaId)]).then(([daBase, oPainel]) => {
      if (!ativo) return;
      if (daBase.ok) setBase(daBase.dados);
      if (oPainel.ok) setPainel(oPainel.dados);
      else setErro(oPainel.mensagem);
    });
    return () => {
      ativo = false;
    };
  }, [empresaId]);

  // Chegou/saiu alguém, alguém parou de aceitar, a fila andou: a empresa vê na hora, sem F5.
  useEffect(() => {
    const socket = obterClienteRealtime();
    const aoAtualizar = (evento: unknown) => {
      const resultado = eventoFilaAtualizadaSchema.safeParse(evento);
      if (resultado.success) setPainel(resultado.data.painel);
    };
    socket.on(EVENTO_FILA_ATUALIZADA, aoAtualizar);
    return () => {
      socket.off(EVENTO_FILA_ATUALIZADA, aoAtualizar);
    };
  }, []);

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    setOcupado(true);
    try {
      const resultado = await salvarBase(empresaId, {
        cep: String(dados.get("cepBase") ?? ""),
        logradouro: String(dados.get("logradouroBase") ?? ""),
        numero: String(dados.get("numeroBase") ?? ""),
        complemento: String(dados.get("complementoBase") ?? ""),
        bairro: String(dados.get("bairroBase") ?? ""),
        cidade: String(dados.get("cidadeBase") ?? ""),
        uf: String(dados.get("ufBase") ?? "MG") as BaseEmpresa["uf"],
        pontoReferencia: "",
        raioMetros: Number(dados.get("raioBase") ?? 150),
      });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setErro(null);
      setBase(resultado.dados);
      setEditando(false);
    } finally {
      setOcupado(false);
    }
  }

  const confirmado = baseTemPontoConfirmado(base);

  return (
    <section aria-label="Operação da base" className="flex flex-col gap-3 rounded border border-zinc-200 p-3">
      <h3 className="text-sm font-semibold">Operação da base — {nomeEmpresa}</h3>

      {/* Base: endereço textual + ponto confirmado + raio (área da base, não região de entrega). */}
      <div className="flex flex-col gap-1 rounded border border-zinc-200 p-2 text-sm">
        {base && !editando ? (
          <>
            <p className="text-xs">
              {base.logradouro}, {base.numero} — {base.bairro}, {base.cidade}/{base.uf} · CEP {formatarCep(base.cep)}
            </p>
            <p data-base-confirmada={confirmado} className={`text-xs ${confirmado ? "text-emerald-700" : "text-amber-700"}`}>
              {confirmado ? `📍 Ponto da base confirmado · raio de ${base.raioMetros} m` : "Ponto da base ainda não confirmado"}
            </p>
            <span className="flex gap-2">
              <button type="button" onClick={() => setEditando(true)} className="self-start rounded border px-2 py-1 text-xs">
                Editar base
              </button>
              <button type="button" data-confirmar-base onClick={() => setConfirmandoPonto(true)} className="self-start rounded border px-2 py-1 text-xs">
                {confirmado ? "Ajustar ponto no mapa" : "Confirmar ponto no mapa"}
              </button>
            </span>
          </>
        ) : (
          <form aria-label="Base da empresa" onSubmit={(evento) => void salvar(evento)} className="grid gap-2 sm:grid-cols-6">
            <Campo nome="cepBase" rotulo="CEP" valor={base?.cep} classe="sm:col-span-2" />
            <Campo nome="logradouroBase" rotulo="Logradouro" valor={base?.logradouro} classe="sm:col-span-4" />
            <Campo nome="numeroBase" rotulo="Número" valor={base?.numero} classe="sm:col-span-2" />
            <Campo nome="complementoBase" rotulo="Complemento" valor={base?.complemento ?? ""} classe="sm:col-span-2" opcional />
            <Campo nome="bairroBase" rotulo="Bairro" valor={base?.bairro} classe="sm:col-span-2" />
            <Campo nome="cidadeBase" rotulo="Cidade" valor={base?.cidade} classe="sm:col-span-3" />
            <label className="flex flex-col gap-1 text-xs sm:col-span-1">
              UF
              <select name="ufBase" defaultValue={base?.uf ?? "MG"} className="rounded border border-zinc-300 px-2 py-1">
                {UNIDADES_FEDERACAO.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs sm:col-span-2">
              Raio da base (m)
              <input
                name="raioBase"
                type="number"
                min={RAIO_BASE_MINIMO_METROS}
                max={RAIO_BASE_MAXIMO_METROS}
                defaultValue={base?.raioMetros ?? 150}
                className="rounded border border-zinc-300 px-2 py-1"
              />
            </label>
            <p className="text-xs text-zinc-500 sm:col-span-6">O raio delimita a área da base para detectar quem chegou — não é a região de entrega.</p>
            <span className="flex gap-2 sm:col-span-6">
              <button type="submit" disabled={ocupado} className="rounded bg-black px-3 py-1.5 text-xs text-white disabled:opacity-50">
                Salvar base
              </button>
              {base && (
                <button type="button" onClick={() => setEditando(false)} className="rounded border px-3 py-1.5 text-xs">
                  Cancelar
                </button>
              )}
            </span>
          </form>
        )}
      </div>

      {/* O ponto da base é confirmado no mapa, como o endereço do cliente. */}
      {confirmandoPonto && base && (
        <ConfirmarPontoBase
          base={base}
          enviando={ocupado}
          erro={erro}
          aoConfirmar={(coordenadas) => {
            setOcupado(true);
            void confirmarPontoBase(empresaId, coordenadas)
              .then((resultado) => {
                if (resultado.ok) {
                  setBase(resultado.dados);
                  setConfirmandoPonto(false);
                  setErro(null);
                } else setErro(resultado.mensagem);
              })
              .finally(() => setOcupado(false));
          }}
          aoCancelar={() => setConfirmandoPonto(false)}
        />
      )}

      {painel && <QuadroDaFila painel={painel} />}

      {erro && !confirmandoPonto && (
        <p role="alert" className="text-sm text-red-600">
          {erro}
        </p>
      )}
    </section>
  );
}

function Campo({ nome, rotulo, valor, classe, opcional }: { nome: string; rotulo: string; valor?: string | undefined; classe?: string; opcional?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 text-xs ${classe ?? ""}`}>
      {rotulo}
      <input name={nome} defaultValue={valor ?? ""} required={!opcional} maxLength={120} className="rounded border border-zinc-300 px-2 py-1" />
    </label>
  );
}
