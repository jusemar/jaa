"use client";

import {
  EVENTO_ENTREGADOR_DISPONIBILIDADE,
  EVENTO_FILA_ATUALIZADA,
  ROTULO_ESTADO_OPERACIONAL,
  ROTULO_STATUS_ENTREGADOR,
  entregadorPodeOperar,
  eventoEntregadorDisponibilidadeSchema,
  eventoFilaAtualizadaSchema,
  type EntregadorDaEmpresa,
  type CandidatoEntregador,
  type PainelOperacional,
} from "@jaa/contratos";
import { useEffect, useRef, useState } from "react";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { alterarStatusEntregador, buscarCandidatosEntregador, convidarEntregador, listarEntregadores, obterPainelOperacional } from "../lib/api-entregas";

const ESPERA_BUSCA_ENTREGADOR_MS = 300;

// Interface TÉCNICA do quadro de entregadores da empresa. Não é o design final.
// Entregador NÃO é administrador: este quadro só cria o vínculo e liga/desliga quem pode entregar.

export function ListaEntregadores({
  entregadores,
  ocupado,
  painel = null,
  aoAlterarStatus,
}: {
  entregadores: EntregadorDaEmpresa[];
  ocupado: boolean;
  painel?: PainelOperacional | null;
  aoAlterarStatus: (entregador: EntregadorDaEmpresa, status: "ativo" | "inativo") => void;
}) {
  if (entregadores.length === 0) return <p className="text-sm text-conteudo-suave">Nenhum entregador ainda.</p>;

  return (
    <ol aria-label="Entregadores" className="flex flex-col divide-y divide-borda rounded-jaa border border-borda text-sm">
      {entregadores.map((entregador) => {
        const operacional = painel ? [...painel.fila, ...painel.foraDaBase, ...painel.indisponiveis].find((item) => item.id === entregador.id) : null;
        return (
        <li key={entregador.id} data-entregador={entregador.id} className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{entregador.pessoa.nomeExibicao}</span>
            <span className="text-xs text-conteudo-suave">@{entregador.pessoa.nomeUsuario}</span>
            {/* Vínculo (profissional, da empresa) e disponibilidade (operacional, do entregador). */}
            <span data-status-entregador={entregador.status} className="text-xs text-conteudo-suave">
              Situação: {ROTULO_STATUS_ENTREGADOR[entregador.status]}
            </span>
            {entregadorPodeOperar(entregador.status) && operacional && (
              <span data-estado-operacional={operacional.estado} className={`text-xs ${operacional.estado === "disponivel_na_base" ? "text-marca" : "text-conteudo-suave"}`}>
                Estado: {ROTULO_ESTADO_OPERACIONAL[operacional.estado]}
              </span>
            )}
          </span>
          {/* Convite pendente não é ativado pela empresa: quem aceita é a pessoa. */}
          {entregador.status !== "convidado" && (
            <button
              type="button"
              data-alternar-entregador
              disabled={ocupado}
              onClick={() => aoAlterarStatus(entregador, entregador.status === "ativo" ? "inativo" : "ativo")}
              className="shrink-0 rounded-jaa border px-2 py-1 text-xs disabled:opacity-50"
            >
              {entregador.status === "ativo" ? "Desativar" : "Ativar"}
            </button>
          )}
        </li>
        );
      })}
    </ol>
  );
}

export function QuadroEntregadores({ empresaId, nomeEmpresa }: { empresaId: string; nomeEmpresa: string }) {
  const [entregadores, setEntregadores] = useState<EntregadorDaEmpresa[]>([]);
  const [nomeUsuario, setNomeUsuario] = useState("");
  const [candidatos, setCandidatos] = useState<CandidatoEntregador[]>([]);
  const [buscando, setBuscando] = useState(false);
  const buscaAtual = useRef(0);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [painel, setPainel] = useState<PainelOperacional | null>(null);

  useEffect(() => {
    let ativo = true;
    void Promise.all([listarEntregadores(empresaId), obterPainelOperacional(empresaId)]).then(([resultado, operacional]) => {
      if (!ativo) return;
      if (resultado.ok) setEntregadores(resultado.dados.entregadores);
      else setErro(resultado.mensagem);
      if (operacional.ok) setPainel(operacional.dados);
    });
    return () => {
      ativo = false;
    };
  }, [empresaId]);

  /*
   * Quem ficou disponível/indisponível chega em tempo real (só para esta empresa): o gestor percebe
   * na hora, sem F5 e sem polling. Push real é etapa futura.
   */
  useEffect(() => {
    const socket = obterClienteRealtime();
    const aoAtualizar = (evento: unknown) => {
      const resultado = eventoEntregadorDisponibilidadeSchema.safeParse(evento);
      if (!resultado.success) return;
      const atualizado = resultado.data.entregador;
      setEntregadores((atuais) => atuais.map((item) => (item.id === atualizado.id ? atualizado : item)));
      if (atualizado.disponivel) setAviso(`${atualizado.pessoa.nomeExibicao} está disponível para entregas.`);
    };
    const aoAtualizarFila = (evento: unknown) => {
      const resultado = eventoFilaAtualizadaSchema.safeParse(evento);
      if (resultado.success) setPainel(resultado.data.painel);
    };
    socket.on(EVENTO_ENTREGADOR_DISPONIBILIDADE, aoAtualizar);
    socket.on(EVENTO_FILA_ATUALIZADA, aoAtualizarFila);
    return () => {
      socket.off(EVENTO_ENTREGADOR_DISPONIBILIDADE, aoAtualizar);
      socket.off(EVENTO_FILA_ATUALIZADA, aoAtualizarFila);
    };
  }, []);

  const termoBusca = nomeUsuario.trim();
  useEffect(() => {
    if (termoBusca.length < 2) {
      const limpeza = setTimeout(() => {
        setCandidatos([]);
        setBuscando(false);
      }, 0);
      return () => clearTimeout(limpeza);
    }
    const marca = ++buscaAtual.current;
    const temporizador = setTimeout(() => {
      setBuscando(true);
      void buscarCandidatosEntregador(empresaId, termoBusca).then((resultado) => {
        if (marca !== buscaAtual.current) return;
        setBuscando(false);
        if (resultado.ok) {
          setCandidatos(resultado.dados.candidatos);
          setErro(null);
        } else setErro(resultado.mensagem);
      });
    }, ESPERA_BUSCA_ENTREGADOR_MS);
    return () => clearTimeout(temporizador);
  }, [empresaId, termoBusca]);

  async function recarregar() {
    const [resultado, operacional] = await Promise.all([listarEntregadores(empresaId), obterPainelOperacional(empresaId)]);
    if (resultado.ok) setEntregadores(resultado.dados.entregadores);
    else setErro(resultado.mensagem);
    if (operacional.ok) setPainel(operacional.dados);
  }

  // Convite pelo @usuario PÚBLICO: a empresa não procura ninguém por telefone.
  async function convidar(candidato: CandidatoEntregador) {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      const resultado = await convidarEntregador(empresaId, candidato.pessoa.nomeUsuario);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setCandidatos((atuais) => atuais.filter((item) => item.pessoa.identidadeId !== candidato.pessoa.identidadeId));
      setAviso(`Convite enviado para @${resultado.dados.pessoa.nomeUsuario}. Ele vira entregador quando aceitar.`);
      await recarregar();
    } finally {
      setOcupado(false);
    }
  }

  async function alterar(entregador: EntregadorDaEmpresa, status: "ativo" | "inativo") {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      const resultado = await alterarStatusEntregador(empresaId, entregador.id, status);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      // Desativar revoga na hora as entregas em aberto dele (o servidor encerra as atribuições).
      if (status === "inativo") setAviso(`${entregador.pessoa.nomeExibicao} não recebe novas entregas e perdeu as que estavam com ele.`);
      await recarregar();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section aria-label="Entregadores da empresa" className="flex flex-col gap-3 rounded-jaa border border-borda p-3">
      <h3 className="text-sm font-semibold">Entregadores — {nomeEmpresa}</h3>

      <search aria-label="Buscar entregadores" className="flex flex-col gap-2 text-sm">
        <label className="flex min-w-0 flex-col gap-1">
          Nome ou @usuario
          <input
            type="search"
            name="nomeUsuarioEntregador"
            value={nomeUsuario}
            required
            maxLength={31}
            placeholder="Buscar pessoa para convidar"
            onChange={(evento) => setNomeUsuario(evento.target.value)}
            className="min-w-0 rounded-jaa border border-borda px-2 py-1.5"
          />
        </label>
        {buscando && <p className="text-xs text-conteudo-suave">Procurando…</p>}
        {!buscando && termoBusca.length >= 2 && candidatos.length === 0 && <p className="text-xs text-conteudo-suave">Nenhuma pessoa disponível para convite.</p>}
        {candidatos.length > 0 && (
          <ol aria-label="Pessoas encontradas" className="flex flex-col divide-y divide-borda rounded-jaa border border-borda">
            {candidatos.map((candidato) => (
              <li key={candidato.pessoa.identidadeId} data-candidato-entregador={candidato.pessoa.identidadeId} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{candidato.pessoa.nomeExibicao}</span>
                  <span className="truncate text-xs text-conteudo-suave">
                    @{candidato.pessoa.nomeUsuario}{candidato.situacao === "inativo" ? " · Entregador inativo" : ""}
                  </span>
                </span>
                <button type="button" data-enviar-convite disabled={ocupado} onClick={() => void convidar(candidato)} className="shrink-0 rounded bg-marca px-3 py-1.5 text-xs text-white disabled:opacity-50">
                  Enviar convite
                </button>
              </li>
            ))}
          </ol>
        )}
      </search>

      <ListaEntregadores entregadores={entregadores} painel={painel} ocupado={ocupado} aoAlterarStatus={(entregador, status) => void alterar(entregador, status)} />

      {aviso && (
        <p role="status" className="text-xs text-marca">
          {aviso}
        </p>
      )}
      {erro && (
        <p role="alert" className="text-sm text-perigo">
          {erro}
        </p>
      )}
    </section>
  );
}
