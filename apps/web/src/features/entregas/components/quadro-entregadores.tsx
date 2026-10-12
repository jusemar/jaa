"use client";

import {
  EVENTO_ENTREGADOR_DISPONIBILIDADE,
  EVENTO_FILA_ATUALIZADA,
  ABA_INICIAL_DO_QUADRO_DE_ENTREGADORES,
  ABA_OPERACAO_DA_BASE,
  GRUPOS_DO_QUADRO_DE_ENTREGADORES,
  ROTULO_ABA_OPERACAO_DA_BASE,
  ROTULO_STATUS_ENTREGADOR,
  classificarQuadroDeEntregadores,
  eventoEntregadorDisponibilidadeSchema,
  eventoFilaAtualizadaSchema,
  type AbaDoQuadroDeEntregadores,
  type EntregadorDaEmpresa,
  type LinhaDoQuadroDeEntregadores,
  type QuadroDeEntregadores,
  type CandidatoEntregador,
  type PainelOperacional,
} from "@jaa/contratos";
import { useEffect, useRef, useState } from "react";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { PainelOperacionalEmpresa } from "./painel-operacional";
import { alterarStatusEntregador, buscarCandidatosEntregador, convidarEntregador, listarEntregadores, obterPainelOperacional } from "../lib/api-entregas";

const ESPERA_BUSCA_ENTREGADOR_MS = 300;

// Quadro de entregadores da empresa, organizado por SITUAÇÃO (uma por vez) — a classificação vem de
// `classificarQuadroDeEntregadores`, a mesma do app. A base e a fila ficam na opção "Operação da base".
// Entregador NÃO é administrador: este quadro só cria o vínculo e liga/desliga quem pode entregar.

// As linhas de UM grupo (a situação escolhida): nome público, @usuario, a situação e a ação do vínculo.
export function ListaDoGrupo({
  rotulo,
  vazio,
  linhas,
  ocupado,
  aoAlterarStatus,
}: {
  rotulo: string;
  vazio: string;
  linhas: LinhaDoQuadroDeEntregadores[];
  ocupado: boolean;
  aoAlterarStatus: (entregador: EntregadorDaEmpresa, status: "ativo" | "inativo") => void;
}) {
  if (linhas.length === 0) return <p className="text-sm text-conteudo-suave">{vazio}</p>;

  return (
    <ol aria-label={rotulo} className="flex flex-col divide-y divide-borda rounded-jaa border border-borda text-sm">
      {linhas.map(({ entregador, situacao, emDestaque, acao }) => (
        <li key={entregador.id} data-entregador={entregador.id} className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{entregador.pessoa.nomeExibicao}</span>
            <span className="text-xs text-conteudo-suave">@{entregador.pessoa.nomeUsuario}</span>
            <span data-situacao-entregador className={`text-xs ${emDestaque ? "text-marca" : "text-conteudo-suave"}`}>
              {situacao}
            </span>
          </span>
          {/* A empresa só liga/desliga quem já aceitou; quem nunca aceitou depende de novo convite. */}
          {acao && (
            <button
              type="button"
              data-alternar-entregador
              disabled={ocupado}
              onClick={() => aoAlterarStatus(entregador, acao.status)}
              className="shrink-0 rounded-jaa border px-2 py-1 text-xs disabled:opacity-50"
            >
              {acao.rotulo}
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}

// As opções do quadro: uma situação por vez. A quantidade ajuda a achar onde cada um está.
export function AbasDoQuadro({ aba, quadro, aoEscolher }: { aba: AbaDoQuadroDeEntregadores; quadro: QuadroDeEntregadores | null; aoEscolher: (aba: AbaDoQuadroDeEntregadores) => void }) {
  const opcoes: { id: AbaDoQuadroDeEntregadores; rotulo: string; quantidade: number | null }[] = [
    ...GRUPOS_DO_QUADRO_DE_ENTREGADORES.map((grupo) => ({ id: grupo.id, rotulo: grupo.rotulo, quantidade: quadro ? quadro.grupos[grupo.id].length : null })),
    { id: ABA_OPERACAO_DA_BASE, rotulo: ROTULO_ABA_OPERACAO_DA_BASE, quantidade: null },
  ];
  return (
    <div role="tablist" aria-label="Situação dos entregadores" className="flex gap-2 overflow-x-auto pb-1">
      {opcoes.map((opcao) => {
        const marcada = aba === opcao.id;
        return (
          <button
            key={opcao.id}
            type="button"
            role="tab"
            aria-selected={marcada}
            data-aba-entregadores={opcao.id}
            onClick={() => aoEscolher(opcao.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${marcada ? "border-marca bg-marca text-white" : "border-borda bg-superficie text-conteudo"}`}
          >
            {opcao.rotulo}
            {opcao.quantidade !== null && <span className={marcada ? "font-semibold" : "font-semibold text-conteudo-suave"}>{opcao.quantidade}</span>}
          </button>
        );
      })}
    </div>
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
  // Só UMA situação aparece por vez; trocar de opção não consulta nem altera nada.
  const [aba, setAba] = useState<AbaDoQuadroDeEntregadores>(ABA_INICIAL_DO_QUADRO_DE_ENTREGADORES);
  const [convidando, setConvidando] = useState(false);

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

  // A classificação é do contrato compartilhado: a tela só mostra o grupo escolhido.
  const quadro = painel ? classificarQuadroDeEntregadores(entregadores, painel) : null;
  const pendentes = entregadores.filter((item) => item.status === "convidado");
  const grupo = GRUPOS_DO_QUADRO_DE_ENTREGADORES.find((item) => item.id === aba) ?? null;

  return (
    <section aria-label="Entregadores da empresa" className="flex flex-col gap-3 rounded-jaa border border-borda p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Entregadores — {nomeEmpresa}</h3>
        {/* O ÚNICO caminho para convidar: abre a busca e os convites que ainda aguardam aceite. */}
        <span className="flex items-center gap-2">
          {!convidando && pendentes.length > 0 && (
            <span data-convites-pendentes className="text-xs text-conteudo-suave">
              {pendentes.length === 1 ? "1 convite aguardando aceite" : `${pendentes.length} convites aguardando aceite`}
            </span>
          )}
          <button
            type="button"
            data-convidar-entregador
            aria-expanded={convidando}
            onClick={() => setConvidando((atual) => !atual)}
            className={`rounded-jaa px-3 py-1.5 text-xs ${convidando ? "border border-borda" : "bg-marca text-white"}`}
          >
            {convidando ? "Fechar convite" : "Convidar entregador"}
          </button>
        </span>
      </div>

      {convidando && (
        <search aria-label="Convidar entregador" className="flex flex-col gap-2 rounded-jaa border border-borda bg-superficie-suave p-3 text-sm">
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
            <ol aria-label="Pessoas encontradas" className="flex flex-col divide-y divide-borda rounded-jaa border border-borda bg-superficie">
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
          <ConvitesPendentes pendentes={pendentes} />
        </search>
      )}

      <AbasDoQuadro aba={aba} quadro={quadro} aoEscolher={setAba} />

      <div role="tabpanel" aria-label={grupo ? grupo.rotulo : ROTULO_ABA_OPERACAO_DA_BASE}>
        {aba === ABA_OPERACAO_DA_BASE && <PainelOperacionalEmpresa empresaId={empresaId} nomeEmpresa={nomeEmpresa} />}
        {grupo && !quadro && !erro && <p className="text-sm text-conteudo-suave">Carregando entregadores…</p>}
        {grupo && quadro && <ListaDoGrupo rotulo={grupo.rotulo} vazio={grupo.vazio} linhas={quadro.grupos[grupo.id]} ocupado={ocupado} aoAlterarStatus={(entregador, status) => void alterar(entregador, status)} />}
        {/* Sem ponto confirmado ninguém é detectado na base: explica por que "Disponíveis" está vazio. */}
        {painel && !painel.baseConfigurada && (aba === "disponiveis" || aba === "fora_da_base") && (
          <p className="mt-2 text-xs text-aviso">Confirme o ponto da base em “Operação da base” para que a chegada dos entregadores seja detectada.</p>
        )}
      </div>

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

// Convites ainda não aceitos: ficam junto do convite (e só ali) — não são entregadores ativos nem desativados.
export function ConvitesPendentes({ pendentes }: { pendentes: EntregadorDaEmpresa[] }) {
  if (pendentes.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold text-conteudo-suave">Aguardando aceite</p>
      <ol aria-label="Convites aguardando aceite" className="flex flex-col divide-y divide-borda rounded-jaa border border-borda bg-superficie">
        {pendentes.map((pendente) => (
          <li key={pendente.id} data-convite-pendente={pendente.id} className="flex min-w-0 flex-col px-3 py-2">
            <span className="truncate text-sm font-medium">{pendente.pessoa.nomeExibicao}</span>
            <span className="truncate text-xs text-conteudo-suave">
              @{pendente.pessoa.nomeUsuario} · {ROTULO_STATUS_ENTREGADOR.convidado}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
