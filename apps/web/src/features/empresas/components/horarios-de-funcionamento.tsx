"use client";

import { DIAS_SEMANA, MAXIMO_PERIODOS_POR_DIA, ROTULO_DIA_SEMANA, periodoAtravessaMeiaNoite, type DiaSemana, type FuncionamentoEmpresa } from "@jaa/contratos";
import { useEffect, useState } from "react";
import { avisar } from "@/components/ui/avisos";
import { IconeCheck, IconeLixeira, IconeMais, IconeRelogio } from "@/components/ui/icones";
import { MenuMais } from "@/components/ui/menu-mais";
import { Aviso, Botao, BotaoIcone, Carregando, Cartao, Interruptor } from "@/components/ui/primitivos";
import { consultarFuncionamento, salvarFuncionamento } from "../lib/api-funcionamento";
import {
  adicionarPeriodo,
  copiarParaTodosOsDias,
  fecharDia,
  funcionamentoAlterado,
  mudarPeriodo,
  rascunhoDoFuncionamento,
  removerPeriodo,
  validarRascunho,
  type RascunhoDoFuncionamento,
} from "../lib/rascunho-funcionamento";

/*
 * HORÁRIOS DE FUNCIONAMENTO — quando a empresa RECEBE PEDIDOS.
 *
 * Uma chave decide se a empresa controla horário (desligada, recebe pedidos a qualquer hora, como
 * sempre foi). Ligada, cada dia da semana está aberto com um ou mais períodos, ou fechado.
 * Tudo fica em rascunho até "Salvar horários"; o servidor valida de novo e devolve o estado de AGORA
 * ("Aberto agora · até 23:00"), que é o mesmo que o cliente vê no cardápio.
 *
 * Não confundir com a programação semanal dos produtos (QUAIS opções existem em cada dia): aqui é só
 * se dá para pedir.
 */

export function HorariosDeFuncionamento({ empresaId }: { empresaId: string }) {
  const [salvo, setSalvo] = useState<FuncionamentoEmpresa | null>(null);
  const [rascunho, setRascunho] = useState<RascunhoDoFuncionamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    void consultarFuncionamento(empresaId).then((resultado) => {
      if (!ativo) return;
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setSalvo(resultado.dados);
      setRascunho(rascunhoDoFuncionamento(resultado.dados.ativo, resultado.dados.periodos));
    });
    return () => {
      ativo = false;
    };
  }, [empresaId]);

  async function salvar() {
    if (!rascunho || salvando) return;
    const validacao = validarRascunho(rascunho);
    if (!validacao.ok) {
      setErro(validacao.erro);
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      const resultado = await salvarFuncionamento(empresaId, validacao.entrada);
      if (!resultado.ok) {
        // O rascunho continua na tela: nada do que foi digitado se perde por causa do erro.
        setErro(resultado.mensagem);
        return;
      }
      setSalvo(resultado.dados);
      setRascunho(rascunhoDoFuncionamento(resultado.dados.ativo, resultado.dados.periodos));
      avisar.sucesso("Horários salvos");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <EditorDeHorarios
      salvo={salvo}
      rascunho={rascunho}
      erro={erro}
      salvando={salvando}
      aoMudar={(novo) => {
        setErro(null);
        setRascunho(novo);
      }}
      aoDescartar={() => {
        setErro(null);
        if (salvo) setRascunho(rascunhoDoFuncionamento(salvo.ativo, salvo.periodos));
      }}
      aoSalvar={() => void salvar()}
    />
  );
}

const CAMPO_DE_HORA = "min-h-11 w-full min-w-0 rounded-jaa-compacto border border-borda bg-superficie px-2 text-base text-conteudo disabled:opacity-60 sm:min-h-9 sm:text-sm";

/** Só apresentação: a semana em rascunho, um dia por linha. */
export function EditorDeHorarios({
  salvo,
  rascunho,
  erro,
  salvando,
  aoMudar,
  aoDescartar,
  aoSalvar,
}: {
  salvo: FuncionamentoEmpresa | null;
  rascunho: RascunhoDoFuncionamento | null;
  erro: string | null;
  salvando: boolean;
  aoMudar: (rascunho: RascunhoDoFuncionamento) => void;
  aoDescartar: () => void;
  aoSalvar: () => void;
}) {
  const alterado = salvo !== null && rascunho !== null && funcionamentoAlterado(salvo, rascunho);

  return (
    <section aria-label="Horários de funcionamento" data-horarios-de-funcionamento className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="fonte-display flex items-center gap-2 text-lg font-bold text-conteudo">
          <IconeRelogio className="h-5 w-5 text-conteudo-suave" />
          Horários de funcionamento
        </h2>
        <p className="text-sm text-conteudo-suave">Quando a empresa recebe pedidos. Fora do horário o cliente continua vendo o cardápio, mas não consegue pedir.</p>
      </div>

      {!rascunho && !erro && <Carregando texto="Carregando os horários…" />}

      {rascunho && salvo && (
        <Cartao className="flex flex-col">
          <div className="flex flex-col gap-2 p-4">
            <Interruptor
              id="controlar-horario"
              rotulo="Controlar horário de funcionamento"
              descricao={rascunho.ativo ? "Pedidos só são aceitos nos horários abaixo." : "Desligado: a empresa recebe pedidos a qualquer dia e hora."}
              ligado={rascunho.ativo}
              disabled={salvando}
              aoMudar={(ativo) => aoMudar({ ...rascunho, ativo })}
            />
            {/* O estado de AGORA vem do servidor (fuso da empresa) e vale para o que está SALVO. */}
            {salvo.estado.resumo && !alterado && (
              <p data-estado-agora={salvo.estado.abertoAgora ? "aberto" : "fechado"} className={`flex items-center gap-2 text-xs font-medium ${salvo.estado.abertoAgora ? "text-marca" : "text-aviso"}`}>
                <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${salvo.estado.abertoAgora ? "bg-marca" : "bg-aviso"}`} />
                {salvo.estado.resumo}
              </p>
            )}
          </div>

          {rascunho.ativo && (
            <ul data-semana className="flex flex-col divide-y divide-borda border-t border-borda">
              {DIAS_SEMANA.map((dia) => (
                <DiaDaSemana key={dia} dia={dia} hoje={dia === salvo.hoje} rascunho={rascunho} ocupado={salvando} aoMudar={aoMudar} />
              ))}
            </ul>
          )}

          {rascunho.ativo && <p className="border-t border-borda px-4 py-3 text-xs text-conteudo-suave">Horários no fuso da empresa ({salvo.fusoHorario.replace(/_/g, " ")}). Se o fechamento for mais cedo que a abertura (18:00 às 02:00), o período termina no dia seguinte.</p>}

          <div className="flex flex-col gap-2 border-t border-borda p-4 sm:flex-row sm:items-center sm:justify-between">
            <p data-estado-dos-horarios={alterado ? "nao-salvo" : "salvo"} aria-live="polite" className={`text-center text-xs sm:text-left ${alterado ? "font-semibold text-aviso" : "text-conteudo-suave"}`}>
              {alterado ? "Alterações ainda não salvas" : "Todas as alterações salvas"}
            </p>
            <div className="grid grid-cols-[1fr_1.6fr] gap-2 sm:flex">
              <Botao aparencia="secundario" disabled={!alterado || salvando} onClick={aoDescartar}>
                Descartar
              </Botao>
              <Botao data-salvar-horarios disabled={!alterado || salvando} onClick={aoSalvar}>
                <IconeCheck className="h-4 w-4" />
                {salvando ? "Salvando…" : "Salvar horários"}
              </Botao>
            </div>
          </div>
        </Cartao>
      )}

      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </section>
  );
}

function DiaDaSemana({ dia, hoje, rascunho, ocupado, aoMudar }: { dia: DiaSemana; hoje: boolean; rascunho: RascunhoDoFuncionamento; ocupado: boolean; aoMudar: (rascunho: RascunhoDoFuncionamento) => void }) {
  const periodos = rascunho.semana[dia];
  const aberto = periodos.length > 0;
  const nome = ROTULO_DIA_SEMANA[dia];

  return (
    <li data-dia-da-semana={dia} data-aberto={aberto ? "" : undefined} className="flex flex-col gap-2 px-4 py-3 sm:grid sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-start sm:gap-4">
      <div className="flex items-center gap-2 sm:min-h-9">
        <Interruptor somenteControle id={`dia-aberto-${dia}`} rotulo={`${nome}: aberto`} ligado={aberto} disabled={ocupado} aoMudar={(ligar) => aoMudar(ligar ? adicionarPeriodo(rascunho, dia) : fecharDia(rascunho, dia))} />
        <span className="min-w-0 flex-1 text-sm font-medium">
          {nome}
          {hoje && <span className="ml-1.5 text-xs font-normal text-conteudo-suave">hoje</span>}
        </span>
        {!aberto && <span className="text-sm text-conteudo-suave sm:hidden">Fechado</span>}
        {aberto && (
          <span className="sm:hidden">
            <MenuMais rotulo={`Mais ações de ${nome}`} disabled={ocupado} itens={[{ id: "copiar-para-todos", rotulo: "Copiar para todos os dias", aoEscolher: () => aoMudar(copiarParaTodosOsDias(rascunho, dia)) }]} />
          </span>
        )}
      </div>

      {aberto ? (
        <div className="flex min-w-0 flex-col gap-2">
          {periodos.map((periodo, indice) => {
            const completo = periodo.inicio !== "" && periodo.fim !== "";
            return (
              <div key={periodo.chave} data-periodo className="flex flex-col gap-1">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2 sm:max-w-sm">
                  <input type="time" aria-label={`${nome}, período ${indice + 1}: abre às`} value={periodo.inicio} disabled={ocupado} onChange={(evento) => aoMudar(mudarPeriodo(rascunho, dia, periodo.chave, { inicio: evento.target.value }))} className={CAMPO_DE_HORA} />
                  <span className="text-xs text-conteudo-suave">às</span>
                  <input type="time" aria-label={`${nome}, período ${indice + 1}: fecha às`} value={periodo.fim} disabled={ocupado} onChange={(evento) => aoMudar(mudarPeriodo(rascunho, dia, periodo.chave, { fim: evento.target.value }))} className={CAMPO_DE_HORA} />
                  <BotaoIcone aria-label={`Remover o período ${indice + 1} de ${nome}`} title="Remover período" data-remover-periodo disabled={ocupado} onClick={() => aoMudar(removerPeriodo(rascunho, dia, periodo.chave))}>
                    <IconeLixeira className="h-4 w-4" />
                  </BotaoIcone>
                </div>
                {completo && periodo.inicio !== periodo.fim && periodoAtravessaMeiaNoite({ inicio: periodo.inicio, fim: periodo.fim === "00:00" ? "24:00" : periodo.fim }) && (
                  <p data-passa-da-meia-noite className="text-xs text-conteudo-suave">Fecha no dia seguinte, às {periodo.fim}.</p>
                )}
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-1">
            {periodos.length < MAXIMO_PERIODOS_POR_DIA && (
              <Botao aparencia="discreto" data-adicionar-periodo disabled={ocupado} onClick={() => aoMudar(adicionarPeriodo(rascunho, dia))} className="-ml-2 !px-2 text-xs">
                <IconeMais className="h-3.5 w-3.5" />
                Adicionar período
              </Botao>
            )}
            <Botao aparencia="discreto" data-copiar-para-todos disabled={ocupado} onClick={() => aoMudar(copiarParaTodosOsDias(rascunho, dia))} className="hidden !px-2 text-xs sm:inline-flex">
              Copiar para todos os dias
            </Botao>
          </div>
        </div>
      ) : (
        <p className="hidden text-sm text-conteudo-suave sm:flex sm:min-h-9 sm:items-center">Fechado</p>
      )}
    </li>
  );
}
