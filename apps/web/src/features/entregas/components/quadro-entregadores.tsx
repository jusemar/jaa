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
  type PainelOperacional,
} from "@jaa/contratos";
import { useEffect, useState, type FormEvent } from "react";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { alterarStatusEntregador, convidarEntregador, listarEntregadores, obterPainelOperacional } from "../lib/api-entregas";

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
              Vínculo: {ROTULO_STATUS_ENTREGADOR[entregador.status]}
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

  async function recarregar() {
    const [resultado, operacional] = await Promise.all([listarEntregadores(empresaId), obterPainelOperacional(empresaId)]);
    if (resultado.ok) setEntregadores(resultado.dados.entregadores);
    else setErro(resultado.mensagem);
    if (operacional.ok) setPainel(operacional.dados);
  }

  // Convite pelo @usuario PÚBLICO: a empresa não procura ninguém por telefone.
  async function convidar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      const resultado = await convidarEntregador(empresaId, nomeUsuario);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setNomeUsuario("");
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

      <form aria-label="Convidar entregador" onSubmit={(evento) => void convidar(evento)} className="flex items-end gap-2 text-sm">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          @usuario da pessoa
          <input
            name="nomeUsuarioEntregador"
            value={nomeUsuario}
            required
            maxLength={31}
            placeholder="@paulo"
            onChange={(evento) => setNomeUsuario(evento.target.value)}
            className="min-w-0 rounded-jaa border border-borda px-2 py-1.5"
          />
        </label>
        <button type="submit" disabled={ocupado} className="shrink-0 rounded bg-marca px-3 py-2 text-xs text-white disabled:opacity-50">
          Convidar
        </button>
      </form>

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
