"use client";

import {
  ROTULO_ESTADO_OPERACIONAL,
  rotuloSituacaoEntregador,
  type SituacaoOperacional,
} from "@jaa/contratos";
import { useCallback, useEffect, useRef, useState } from "react";
import { enviarLocalizacao } from "../lib/api-entregas";

/*
 * PRESENÇA NA BASE (lado do entregador).
 *
 * O aparelho informa apenas o que MEDIU (coordenada, precisão e horário); quem decide se ele está na
 * base é o servidor. Não existe "estou na base" enviado pelo cliente, nem rastreamento: a leitura
 * serve só para presença, não é guardada e para de ser enviada quando ele desliga "aceitando".
 */

// Intervalo entre envios: suficiente para detectar chegada/saída sem virar rastreamento contínuo.
const INTERVALO_ENVIO_MS = 30_000;

export type PermissaoLocalizacao =
  "ausente" | "ativa" | "negada" | "indisponivel";

export function AvisoLocalizacao({
  permissao,
}: {
  permissao: PermissaoLocalizacao;
}) {
  if (permissao === "ativa") return null;
  const mensagem =
    permissao === "negada"
      ? "Permissão de localização negada. Libere no navegador para entrar automaticamente na fila da base."
      : permissao === "indisponivel"
        ? "Este aparelho não informa localização. Sem ela não é possível entrar automaticamente na fila da base."
        : "Localização necessária para entrar automaticamente na fila da base.";
  return (
    <p data-aviso-localizacao={permissao} className="text-xs text-aviso">
      {mensagem}
    </p>
  );
}

/**
 * Situação do entregador em cada empresa: se está aceitando, se está na base, o estado derivado e a
 * posição na fila. Ele vê só o próprio lugar e quantos estão na fila — nunca quem são os outros.
 */
export function MinhaSituacaoNaBase({
  situacoes,
  permissao,
  aoPermitir,
}: {
  situacoes: SituacaoOperacional[];
  permissao: PermissaoLocalizacao;
  aoPermitir: () => void;
}) {
  if (situacoes.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <ol
        aria-label="Minha situação nas bases"
        className="flex flex-col divide-y divide-borda rounded-jaa border border-borda text-sm"
      >
        {situacoes.map((situacao) => (
          <li
            key={situacao.entregadorId}
            data-situacao={situacao.entregadorId}
            className="flex flex-col gap-0.5 px-3 py-2"
          >
            <span className="font-medium">{situacao.empresa.nome}</span>
            <span
              data-estado-operacional={situacao.estado}
              className={`text-xs ${situacao.estado === "disponivel_na_base" ? "text-marca" : "text-conteudo-suave"}`}
            >
              {ROTULO_ESTADO_OPERACIONAL[situacao.estado]}
            </span>
            {situacao.estado !== "em_entrega" && (
              <span
                data-presenca={situacao.naBase ? "na-base" : "fora-da-base"}
                className="text-xs text-conteudo-suave"
              >
                {situacao.naBase ? "Na base" : "Fora da base"}
              </span>
            )}
            {situacao.posicaoFila !== null ? (
              <span
                data-posicao-fila={situacao.posicaoFila}
                className="text-xs"
              >
                {rotuloSituacaoEntregador(situacao)} · {situacao.totalNaFila} na
                fila
              </span>
            ) : (
              <span className="text-xs text-conteudo-suave">
                {rotuloSituacaoEntregador(situacao)}
              </span>
            )}
            {!situacao.baseConfigurada && (
              <span className="text-xs text-aviso">
                A empresa ainda não confirmou o ponto da base.
              </span>
            )}
          </li>
        ))}
      </ol>

      <AvisoLocalizacao permissao={permissao} />
      {permissao !== "ativa" && permissao !== "indisponivel" && (
        <button
          type="button"
          data-permitir-localizacao
          onClick={aoPermitir}
          className="self-start rounded-jaa border px-2 py-1 text-xs"
        >
          Permitir localização
        </button>
      )}
    </div>
  );
}

/**
 * Envia a leitura do aparelho enquanto o entregador estiver ATIVO e ACEITANDO em alguma empresa.
 * Parou de aceitar em todas → para de enviar: a localização só existe enquanto serve à presença.
 */
export function usePresencaNaBase(
  situacoes: SituacaoOperacional[],
  aoReceberSituacao: (situacao: SituacaoOperacional) => void,
) {
  const [permissao, setPermissao] = useState<PermissaoLocalizacao>("ausente");
  const aoReceberRef = useRef(aoReceberSituacao);
  useEffect(() => {
    aoReceberRef.current = aoReceberSituacao;
  }, [aoReceberSituacao]);

  // Só envia por quem está ACEITANDO entregas agora; como texto, o efeito não reinicia à toa.
  const idsAceitando = situacoes
    .filter((situacao) => situacao.status === "ativo" && situacao.disponivel)
    .map((situacao) => situacao.entregadorId)
    .join(",");
  const idsRef = useRef(idsAceitando);
  useEffect(() => {
    idsRef.current = idsAceitando;
  }, [idsAceitando]);

  const enviarAgora = useCallback(() => {
    const ids = idsRef.current === "" ? [] : idsRef.current.split(",");
    if (ids.length === 0) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      // Avisa fora do render/efeito: o aviso é consequência da tentativa, não do ciclo de renderização.
      queueMicrotask(() => setPermissao("indisponivel"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        setPermissao("ativa");
        const leitura = {
          latitude: Number(posicao.coords.latitude.toFixed(6)),
          longitude: Number(posicao.coords.longitude.toFixed(6)),
          precisaoMetros: Number.isFinite(posicao.coords.accuracy)
            ? posicao.coords.accuracy
            : null,
          medidaEm: new Date(posicao.timestamp).toISOString(),
        };
        for (const entregadorId of ids) {
          void enviarLocalizacao(entregadorId, leitura).then((resultado) => {
            if (resultado.ok) aoReceberRef.current(resultado.dados);
          });
        }
      },
      () => setPermissao("negada"),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    if (
      idsAceitando === "" ||
      permissao === "negada" ||
      permissao === "indisponivel"
    )
      return;
    const temporizador = setInterval(enviarAgora, INTERVALO_ENVIO_MS);
    // Primeira leitura logo após o efeito: chegar na base não deve esperar o intervalo inteiro.
    const primeira = setTimeout(enviarAgora, 0);
    return () => {
      clearInterval(temporizador);
      clearTimeout(primeira);
    };
  }, [idsAceitando, permissao, enviarAgora]);

  return { permissao, permitir: enviarAgora };
}
