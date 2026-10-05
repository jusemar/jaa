"use client";

import {
  INSTRUCAO_GRUPO_OPCOES_TAMANHO_MAXIMO,
  MAXIMO_ESCOLHAS_POR_GRUPO,
  MAXIMO_OPCOES_POR_GRUPO,
  NOME_GRUPO_OPCOES_TAMANHO_MAXIMO,
  NOME_OPCAO_TAMANHO_MAXIMO,
  ROTULO_DIA_SEMANA,
  type DiaSemana,
  type GrupoOpcoesProduto,
  type ProgramacaoSemanalGrupo,
} from "@jaa/contratos";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { avisar } from "@/components/ui/avisos";
import { DialogoConfirmacao } from "@/components/ui/confirmacao";
import { IconeCalendario, IconeCheck, IconeLixeira, IconeMais } from "@/components/ui/icones";
import { AbasDaJanela, Janela } from "@/components/ui/janela";
import { Aviso, Botao, BotaoIcone, CampoTexto, Interruptor, Selo } from "@/components/ui/primitivos";
import {
  atualizarGrupoOpcoes,
  atualizarOpcao,
  consultarProgramacaoSemanal,
  criarGrupoOpcoes,
  criarOpcao,
  definirOpcoesDoDia,
  definirProgramacaoSemanal,
  removerOpcao,
} from "../lib/api-personalizacao";
import { alternarOpcao, aplicarAOutrosDias, diaDeHojeNoNavegador, mensagemDaAplicacao, naOrdemDoGrupo, opcoesSalvasDoDia, rascunhoAlterado } from "../lib/edicao-semana";
import { comOpcaoGravada, grupoAlterado, planejarGravacao, rascunhoInicial, semAOpcao, type OpcaoEmRascunho, type RascunhoDoGrupo } from "../lib/rascunho-do-grupo";
import { AbaProgramacaoSemanal, type EstadoDaAplicacao } from "./programacao-semanal-grupo";

/*
 * EDITOR DE UM GRUPO de opções — uma janela, duas abas:
 *  - "Opções e regras": nome, instrução, mínimo/máximo e as opções (nome, acréscimo, ativa). Tudo fica
 *    em RASCUNHO e só "Salvar grupo" grava;
 *  - "Programação semanal": um dia por vez, com "Salvar dia".
 * No celular a janela é a tela inteira; no desktop, um diálogo.
 *
 * Vale para QUALQUER grupo: nenhum nome é especial. O mesmo editor cria um grupo novo (`grupo` null).
 *
 * ALTERAÇÃO NÃO SALVA nunca se perde em silêncio: fechar com rascunho pendente (do grupo ou do dia) e
 * trocar de dia com marcações pendentes perguntam antes. Apagar pede confirmação e é imediato.
 *
 * A API grava uma coisa por vez. "Salvar grupo" faz as gravações em sequência e, a cada resposta,
 * adota a lista que o SERVIDOR devolveu: se uma falhar, o que já foi salvo fica salvo, o resto
 * continua na tela e salvar de novo retoma de onde parou (sem criar opção em dobro).
 */

type Aba = "opcoes" | "semana";
type Confirmacao = { tipo: "apagar-opcao"; chave: string; id: string; nome: string } | { tipo: "descartar"; alvo: "dia" | "tudo"; depois: () => void };

export function EditorDeGrupo({
  empresaId,
  produtoId,
  grupo,
  idsDosGrupos,
  aoFechar,
  aoGrupos,
  aoCriado,
  aoMudarAtivacao,
  aoPedirExcluir,
}: {
  empresaId: string;
  produtoId: string;
  // null = grupo novo, ainda não gravado.
  grupo: GrupoOpcoesProduto | null;
  // Para reconhecer o grupo recém-criado na lista que o servidor devolve.
  idsDosGrupos: readonly string[];
  aoFechar: () => void;
  // A lista de grupos como o servidor a devolveu depois de uma gravação.
  aoGrupos: (grupos: GrupoOpcoesProduto[]) => void;
  aoCriado: (grupoId: string) => void;
  // Só a chave da programação semanal mudou (o resto da lista continua como estava).
  aoMudarAtivacao: (grupoId: string, ativa: boolean) => void;
  aoPedirExcluir: (grupo: GrupoOpcoesProduto) => void;
}) {
  const [aba, setAba] = useState<Aba>("opcoes");
  const [rascunho, setRascunho] = useState<RascunhoDoGrupo>(() => rascunhoInicial(grupo));
  const [erro, setErro] = useState<string | null>(null);
  const [trabalhando, setTrabalhando] = useState(false);
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);
  const contador = useRef(0);

  // Programação semanal.
  const [programacao, setProgramacao] = useState<ProgramacaoSemanalGrupo | null>(null);
  const [erroSemana, setErroSemana] = useState<string | null>(null);
  const [hoje] = useState<DiaSemana>(() => diaDeHojeNoNavegador());
  const [dia, setDia] = useState<DiaSemana>(hoje);
  // null = igual ao que está salvo. Só existe enquanto o gestor mexe nas marcações do dia.
  const [rascunhoDoDia, setRascunhoDoDia] = useState<string[] | null>(null);
  const [aplicacao, setAplicacao] = useState<EstadoDaAplicacao | null>(null);
  // Retorno de sucesso no PRÓPRIO rodapé ("Terça: dia salvo"): um toast cobriria a ação principal.
  const [recado, setRecado] = useState<string | null>(null);

  const grupoId = grupo?.id ?? null;
  const ativa = grupo?.programacaoSemanal ?? false;
  // Opção criada ou apagada muda o que existe para programar: a programação é relida.
  const opcoesDoGrupo = grupo?.opcoes.map((opcao) => opcao.id).join(",") ?? "";

  useEffect(() => {
    if (!ativa || !grupoId) return;
    let atual = true;
    void consultarProgramacaoSemanal(empresaId, produtoId, grupoId).then((resultado) => {
      if (!atual) return;
      if (resultado.ok) setProgramacao(resultado.dados);
      else setErroSemana(resultado.mensagem);
    });
    return () => {
      atual = false;
    };
  }, [ativa, empresaId, produtoId, grupoId, opcoesDoGrupo]);

  const salvas = opcoesSalvasDoDia(ativa ? programacao : null, dia);
  const marcacoes = rascunhoDoDia ?? salvas;
  const diaAlterado = ativa && rascunhoAlterado(salvas, marcacoes);
  const regrasAlteradas = grupoAlterado(grupo, rascunho);

  const fechar = useCallback(() => {
    if (trabalhando) return;
    if (diaAlterado || regrasAlteradas) setConfirmacao({ tipo: "descartar", alvo: "tudo", depois: aoFechar });
    else aoFechar();
  }, [trabalhando, diaAlterado, regrasAlteradas, aoFechar]);

  const mudar = (valores: Partial<RascunhoDoGrupo>) => setRascunho((atual) => ({ ...atual, ...valores }));
  const mudarOpcao = (chave: string, valores: Partial<OpcaoEmRascunho>) =>
    setRascunho((atual) => ({ ...atual, opcoes: atual.opcoes.map((opcao) => (opcao.chave === chave ? { ...opcao, ...valores } : opcao)) }));

  function adicionarOpcao() {
    contador.current += 1;
    const chave = `nova-${contador.current}`;
    setRascunho((atual) => ({ ...atual, opcoes: [...atual.opcoes, { chave, id: null, nome: "", acrescimo: "", ativa: true }] }));
    // O foco vai para o nome da linha nova: é o próximo gesto natural.
    requestAnimationFrame(() => document.getElementById(`opcao-nome-${chave}`)?.focus());
  }

  async function salvarGrupo() {
    if (trabalhando) return;
    const resultado = planejarGravacao(grupo, rascunho);
    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }
    const { plano } = resultado;
    setErro(null);
    setTrabalhando(true);
    let emEdicao = rascunho;
    let idDoGrupo = grupoId;
    let conhecidas = new Set(grupo?.opcoes.map((opcao) => opcao.id) ?? []);
    let gravouAlgo = false;
    const falhar = (mensagem: string) => {
      setRascunho(emEdicao);
      setErro(gravouAlgo ? `${mensagem} O que já tinha sido salvo continua salvo; toque em “Salvar grupo” para tentar o restante.` : mensagem);
    };
    try {
      if (plano.criar) {
        const criado = await criarGrupoOpcoes(empresaId, produtoId, plano.criar);
        if (!criado.ok) return falhar(criado.mensagem);
        const novo = criado.dados.grupos.find((item) => !idsDosGrupos.includes(item.id));
        if (!novo) return falhar("O grupo foi criado, mas não foi possível abri-lo. Feche e abra o grupo na lista.");
        idDoGrupo = novo.id;
        gravouAlgo = true;
        aoGrupos(criado.dados.grupos);
        aoCriado(novo.id);
      } else if (plano.grupo && idDoGrupo) {
        const atualizado = await atualizarGrupoOpcoes(empresaId, produtoId, idDoGrupo, plano.grupo);
        if (!atualizado.ok) return falhar(atualizado.mensagem);
        gravouAlgo = true;
        aoGrupos(atualizado.dados.grupos);
      }
      if (!idDoGrupo) return;
      for (const alterada of plano.alteradas) {
        const resposta = await atualizarOpcao(empresaId, produtoId, idDoGrupo, alterada.id, alterada.entrada);
        if (!resposta.ok) return falhar(resposta.mensagem);
        gravouAlgo = true;
        aoGrupos(resposta.dados.grupos);
      }
      for (const nova of plano.novas) {
        const resposta = await criarOpcao(empresaId, produtoId, idDoGrupo, nova.entrada);
        if (!resposta.ok) return falhar(resposta.mensagem);
        gravouAlgo = true;
        const opcoes = resposta.dados.grupos.find((item) => item.id === idDoGrupo)?.opcoes ?? [];
        const criada = opcoes.find((opcao) => !conhecidas.has(opcao.id));
        conhecidas = new Set(opcoes.map((opcao) => opcao.id));
        // A linha passa a apontar para a opção criada: salvar de novo depois de uma falha não a duplica.
        if (criada) emEdicao = comOpcaoGravada(emEdicao, nova.chave, criada.id);
        aoGrupos(resposta.dados.grupos);
      }
      setRascunho(emEdicao);
      avisar.sucesso(plano.criar ? "Grupo criado" : "Grupo atualizado");
      // Sem alteração pendente no dia, salvar conclui a tarefa: a janela fecha, como na criação.
      if (!diaAlterado) aoFechar();
    } finally {
      setTrabalhando(false);
    }
  }

  async function apagarOpcao(chave: string, id: string) {
    if (!grupoId) return;
    setErro(null);
    setTrabalhando(true);
    try {
      const resposta = await removerOpcao(empresaId, produtoId, grupoId, id);
      if (!resposta.ok) {
        setErro(resposta.mensagem);
        return;
      }
      setRascunho((atual) => semAOpcao(atual, chave));
      aoGrupos(resposta.dados.grupos);
    } finally {
      setTrabalhando(false);
      setConfirmacao(null);
    }
  }

  async function alternarProgramacao(ligada: boolean) {
    if (!grupoId) return;
    setErroSemana(null);
    setTrabalhando(true);
    try {
      const resultado = await definirProgramacaoSemanal(empresaId, produtoId, grupoId, ligada);
      if (!resultado.ok) {
        setErroSemana(resultado.mensagem);
        return;
      }
      setProgramacao(resultado.dados);
      setAplicacao(null);
      setRecado(null);
      aoMudarAtivacao(grupoId, resultado.dados.programacaoSemanal);
    } finally {
      setTrabalhando(false);
    }
  }

  async function salvarDia() {
    if (!grupo || !diaAlterado || trabalhando) return;
    setErroSemana(null);
    setTrabalhando(true);
    try {
      const resultado = await definirOpcoesDoDia(empresaId, produtoId, grupo.id, dia, naOrdemDoGrupo(grupo, marcacoes));
      if (!resultado.ok) {
        // As marcações continuam na tela: nada do que o gestor fez se perde por causa do erro.
        setErroSemana(resultado.mensagem);
        return;
      }
      setProgramacao(resultado.dados);
      setRascunhoDoDia(null);
      setRecado(`${ROTULO_DIA_SEMANA[dia]}: dia salvo`);
    } finally {
      setTrabalhando(false);
    }
  }

  async function aplicar() {
    if (!grupo || !aplicacao || aplicacao.destinos.length === 0 || trabalhando) return;
    setTrabalhando(true);
    try {
      const resultado = await aplicarAOutrosDias(aplicacao.destinos, salvas, (destino, opcaoIds) => definirOpcoesDoDia(empresaId, produtoId, grupo.id, destino, opcaoIds));
      // A tela adota o que o servidor REALMENTE gravou — inclusive quando só parte dos dias deu certo.
      if (resultado.programacao) setProgramacao(resultado.programacao);
      const mensagem = mensagemDaAplicacao(resultado);
      if (mensagem.tom === "sucesso") {
        setRecado(mensagem.texto);
        setAplicacao(null);
      } else {
        // O que falhou fica escrito na tela (não some sozinho) e marcado: tentar de novo é um toque.
        setAplicacao({ destinos: resultado.falhas, mensagem });
      }
    } finally {
      setTrabalhando(false);
    }
  }

  function trocarDeDia(novo: DiaSemana) {
    if (novo === dia) return;
    const trocar = () => {
      setRascunhoDoDia(null);
      setAplicacao(null);
      setErroSemana(null);
      setRecado(null);
      setDia(novo);
    };
    if (diaAlterado) setConfirmacao({ tipo: "descartar", alvo: "dia", depois: trocar });
    else trocar();
  }

  const naSemana = aba === "semana";
  const alteradoNaAba = naSemana ? diaAlterado : regrasAlteradas;
  const excluir = grupo ? (
    <Botao aparencia="discreto" data-excluir-grupo disabled={trabalhando} onClick={() => aoPedirExcluir(grupo)} className="-ml-2 !px-2 !text-perigo hover:!bg-perigo/5">
      <IconeLixeira className="h-4 w-4" />
      Excluir grupo
    </Botao>
  ) : null;

  return (
    <>
      <Janela
        rotulo={grupo ? `Editar grupo de opções ${grupo.nome}` : "Novo grupo de opções"}
        titulo={grupo ? "Editar grupo de opções" : "Novo grupo de opções"}
        subtitulo={grupo?.nome ?? "Personalização do produto"}
        aoFechar={fechar}
        abas={
          <AbasDaJanela<Aba>
            atual={aba}
            aoEscolher={(nova) => {
              setErro(null);
              setAba(nova);
            }}
            abas={[
              {
                id: "opcoes",
                pendente: regrasAlteradas && naSemana,
                rotulo: (
                  <>
                    Opções e regras <Selo>{rascunho.opcoes.length}</Selo>
                  </>
                ),
              },
              {
                id: "semana",
                pendente: diaAlterado && !naSemana,
                rotulo: (
                  <>
                    <IconeCalendario className="h-4 w-4 shrink-0" />
                    Programação semanal
                  </>
                ),
              },
            ]}
          />
        }
        rodape={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="hidden sm:block">{excluir}</div>
            <p
              data-estado-do-dia={naSemana ? (diaAlterado ? "nao-salvo" : "salvo") : undefined}
              data-estado-do-grupo={naSemana ? undefined : regrasAlteradas ? "nao-salvo" : "salvo"}
              aria-live="polite"
              className={`min-w-0 text-center text-xs sm:ml-auto sm:text-right ${alteradoNaAba ? "font-semibold text-aviso" : "text-conteudo-suave"}`}
            >
              {alteradoNaAba ? "Alterações ainda não salvas" : naSemana ? (recado ?? (ativa ? "Nenhuma alteração pendente" : "")) : grupo ? "Todas as alterações salvas" : ""}
            </p>
            <div className="grid grid-cols-[1fr_1.4fr] gap-2 sm:flex">
              <Botao aparencia="secundario" data-cancelar-janela disabled={trabalhando} onClick={fechar}>
                {alteradoNaAba ? "Cancelar" : "Fechar"}
              </Botao>
              {naSemana ? (
                <Botao data-salvar-dia disabled={!diaAlterado || trabalhando} onClick={() => void salvarDia()}>
                  <IconeCheck className="h-4 w-4" />
                  {trabalhando && diaAlterado && !aplicacao ? "Salvando…" : "Salvar dia"}
                </Botao>
              ) : (
                <Botao data-salvar-grupo disabled={!regrasAlteradas || trabalhando} onClick={() => void salvarGrupo()}>
                  <IconeCheck className="h-4 w-4" />
                  {trabalhando ? "Salvando…" : "Salvar grupo"}
                </Botao>
              )}
            </div>
          </div>
        }
      >
        {naSemana ? (
          <AbaProgramacaoSemanal
            grupo={grupo}
            programacao={ativa ? programacao : null}
            dia={dia}
            hoje={hoje}
            rascunho={marcacoes}
            alterado={diaAlterado}
            ocupado={trabalhando}
            erro={erroSemana}
            aplicacao={aplicacao}
            aoAlternarProgramacao={(ligada) => void alternarProgramacao(ligada)}
            aoEscolherDia={trocarDeDia}
            aoAlternarOpcao={(opcaoId, marcada) => setRascunhoDoDia(alternarOpcao(marcacoes, opcaoId, marcada))}
            aoMarcarTodas={() => setRascunhoDoDia(grupo?.opcoes.map((opcao) => opcao.id) ?? [])}
            aoLimpar={() => setRascunhoDoDia([])}
            aoAbrirAplicar={() => setAplicacao({ destinos: [], mensagem: null })}
            aoAlternarDestino={(destino, marcado) =>
              setAplicacao((atual) => (atual ? { destinos: marcado ? [...atual.destinos.filter((item) => item !== destino), destino].sort() : atual.destinos.filter((item) => item !== destino), mensagem: null } : atual))
            }
            aoDefinirDestinos={(destinos) => setAplicacao({ destinos, mensagem: null })}
            aoAplicar={() => void aplicar()}
            aoCancelarAplicar={() => setAplicacao(null)}
          />
        ) : (
          <AbaOpcoesERegras
            rascunho={rascunho}
            ocupado={trabalhando}
            erro={erro}
            excluir={excluir}
            aoMudar={mudar}
            aoMudarOpcao={mudarOpcao}
            aoAdicionarOpcao={adicionarOpcao}
            aoPedirApagarOpcao={(opcao) => {
              // Linha que ainda não existe no servidor: não há o que confirmar nem o que apagar lá.
              if (!opcao.id) setRascunho((atual) => semAOpcao(atual, opcao.chave));
              else setConfirmacao({ tipo: "apagar-opcao", chave: opcao.chave, id: opcao.id, nome: opcao.nome.trim() || "sem nome" });
            }}
          />
        )}
      </Janela>

      {confirmacao?.tipo === "descartar" && (
        <DialogoConfirmacao
          titulo={confirmacao.alvo === "dia" ? `Descartar as alterações de ${ROTULO_DIA_SEMANA[dia].toLowerCase()}?` : "Sair sem salvar?"}
          texto={confirmacao.alvo === "dia" ? "As marcações que você fez neste dia ainda não foram salvas." : "Há alterações neste grupo que ainda não foram salvas."}
          rotuloConfirmar="Descartar"
          rotuloCancelar="Continuar editando"
          perigosa
          dados={{ "data-confirmar-acao": confirmacao.alvo === "dia" ? "descartar-dia" : "descartar-grupo" }}
          aoCancelar={() => setConfirmacao(null)}
          aoConfirmar={() => {
            const depois = confirmacao.depois;
            setConfirmacao(null);
            depois();
          }}
        />
      )}
      {confirmacao?.tipo === "apagar-opcao" && (
        <DialogoConfirmacao
          titulo={`Excluir a opção “${confirmacao.nome}”?`}
          texto="Ela sai deste grupo e de todos os dias da programação. Pedidos já feitos não mudam."
          rotuloConfirmar="Excluir opção"
          perigosa
          ocupado={trabalhando}
          dados={{ "data-confirmar-acao": "apagar-opcao" }}
          aoCancelar={() => setConfirmacao(null)}
          aoConfirmar={() => void apagarOpcao(confirmacao.chave, confirmacao.id)}
        />
      )}
    </>
  );
}

const CAMPO_DA_LINHA = "min-h-11 w-full min-w-0 rounded-jaa-compacto border border-borda bg-superficie px-3 text-base text-conteudo placeholder:text-conteudo-suave/60 disabled:opacity-60 sm:min-h-9 sm:text-sm";

/**
 * Aba "Opções e regras" (só apresentação). As regras do grupo em cima e, abaixo, UMA linha por opção.
 *
 * A linha tem duas composições: no desktop é uma linha de tabela (opção · acréscimo · ativa · excluir,
 * com o cabeçalho das colunas); no celular o nome ocupa a largura toda e os controles ficam embaixo,
 * cada um com o seu rótulo — nada de coluna espremida.
 */
export function AbaOpcoesERegras({
  rascunho,
  ocupado,
  erro,
  excluir,
  aoMudar,
  aoMudarOpcao,
  aoAdicionarOpcao,
  aoPedirApagarOpcao,
}: {
  rascunho: RascunhoDoGrupo;
  ocupado: boolean;
  erro: string | null;
  // "Excluir grupo": no celular fica no fim do conteúdo (no desktop, no rodapé da janela).
  excluir: ReactNode;
  aoMudar: (valores: Partial<RascunhoDoGrupo>) => void;
  aoMudarOpcao: (chave: string, valores: Partial<OpcaoEmRascunho>) => void;
  aoAdicionarOpcao: () => void;
  aoPedirApagarOpcao: (opcao: OpcaoEmRascunho) => void;
}) {
  return (
    <div data-opcoes-e-regras className="flex flex-col gap-5">
      <div className="flex flex-col gap-4">
        <CampoTexto id="grupo-nome" rotulo="Nome do grupo" value={rascunho.nome} maxLength={NOME_GRUPO_OPCOES_TAMANHO_MAXIMO} placeholder="Ex.: Acompanhamentos" disabled={ocupado} onChange={(evento) => aoMudar({ nome: evento.target.value })} />
        <CampoTexto
          id="grupo-instrucao"
          rotulo="Instrução para o cliente"
          value={rascunho.instrucao}
          maxLength={INSTRUCAO_GRUPO_OPCOES_TAMANHO_MAXIMO}
          placeholder="Ex.: Escolha seus favoritos"
          disabled={ocupado}
          onChange={(evento) => aoMudar({ instrucao: evento.target.value })}
        />
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <CampoTexto
            id="grupo-minimo"
            rotulo="Mínimo de escolhas"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAXIMO_ESCOLHAS_POR_GRUPO}
            value={rascunho.minimo}
            dica="0 para tornar o grupo opcional."
            disabled={ocupado}
            onChange={(evento) => aoMudar({ minimo: evento.target.value })}
          />
          <CampoTexto
            id="grupo-maximo"
            rotulo="Máximo de escolhas"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAXIMO_ESCOLHAS_POR_GRUPO}
            value={rascunho.maximo}
            dica="Limite de opções por pedido."
            disabled={ocupado}
            onChange={(evento) => aoMudar({ maximo: evento.target.value })}
          />
        </div>
      </div>

      <section aria-label="Opções" className="flex flex-col">
        <div aria-hidden className="hidden grid-cols-[minmax(0,1fr)_6.5rem_2.75rem_2.25rem] gap-3 border-b border-borda pb-2 text-[11px] font-medium uppercase tracking-wide text-conteudo-suave sm:grid">
          <span>Opção</span>
          <span>Acréscimo (R$)</span>
          <span>Ativa</span>
          <span />
        </div>
        <h3 className="border-b border-borda pb-2 text-[11px] font-medium uppercase tracking-wide text-conteudo-suave sm:hidden">Opções</h3>

        {rascunho.opcoes.length === 0 && <p className="border-b border-borda py-5 text-sm text-conteudo-suave">Este grupo ainda não tem opções. Sem opções, ele não aparece para o cliente.</p>}

        <ul className="flex flex-col">
          {rascunho.opcoes.map((opcao, indice) => {
            const nome = opcao.nome.trim() || `opção ${indice + 1}`;
            return (
              <li
                key={opcao.chave}
                data-opcao-admin={opcao.id ?? "nova"}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-end gap-x-4 gap-y-2 border-b border-borda py-3 sm:grid-cols-[minmax(0,1fr)_6.5rem_2.75rem_2.25rem] sm:items-center sm:gap-3 sm:py-2.5"
              >
                <input
                  id={`opcao-nome-${opcao.chave}`}
                  aria-label={`Nome da opção ${indice + 1}`}
                  value={opcao.nome}
                  maxLength={NOME_OPCAO_TAMANHO_MAXIMO}
                  placeholder="Nome da opção"
                  disabled={ocupado}
                  onChange={(evento) => aoMudarOpcao(opcao.chave, { nome: evento.target.value })}
                  className={`${CAMPO_DA_LINHA} col-span-full sm:col-span-1`}
                />
                <label className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs text-conteudo-suave sm:sr-only">Acréscimo (R$)</span>
                  <input
                    aria-label={`Acréscimo de ${nome}`}
                    value={opcao.acrescimo}
                    inputMode="decimal"
                    placeholder="0,00"
                    disabled={ocupado}
                    onChange={(evento) => aoMudarOpcao(opcao.chave, { acrescimo: evento.target.value })}
                    className={CAMPO_DA_LINHA}
                  />
                </label>
                <div className="flex flex-col items-center gap-1">
                  <span aria-hidden className="text-xs text-conteudo-suave sm:hidden">
                    Ativa
                  </span>
                  <Interruptor somenteControle id={`opcao-ativa-${opcao.chave}`} rotulo={`Disponibilidade de ${nome}`} ligado={opcao.ativa} disabled={ocupado} aoMudar={(ativa) => aoMudarOpcao(opcao.chave, { ativa })} />
                </div>
                <BotaoIcone aria-label={`Excluir ${nome}`} title="Excluir opção" data-excluir-opcao disabled={ocupado} onClick={() => aoPedirApagarOpcao(opcao)}>
                  <IconeLixeira className="h-4 w-4" />
                </BotaoIcone>
              </li>
            );
          })}
        </ul>

        {rascunho.opcoes.length < MAXIMO_OPCOES_POR_GRUPO ? (
          <Botao aparencia="secundario" data-adicionar-opcao disabled={ocupado} onClick={aoAdicionarOpcao} className="mt-4 self-start">
            <IconeMais className="h-4 w-4" />
            Adicionar opção
          </Botao>
        ) : (
          <div className="mt-4">
            <Aviso tom="atencao">Este grupo já tem o máximo de {MAXIMO_OPCOES_POR_GRUPO} opções.</Aviso>
          </div>
        )}
      </section>

      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {excluir && <div className="border-t border-borda pt-3 sm:hidden">{excluir}</div>}
    </div>
  );
}
