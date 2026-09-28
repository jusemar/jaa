"use client";

import type { AtividadeDoPerfil } from "@jaa/contratos";
import { useEffect, useState } from "react";
import { IconeCheck, IconeLixeira, IconeMais } from "@/components/ui/icones";
import { Botao, BotaoIcone } from "@/components/ui/primitivos";
import {
  DIAS,
  FAIXA_PADRAO,
  erroDoDia,
  gradeDosPeriodos,
  gradeTemErro,
  periodosDaGrade,
  proximaFaixa,
  resumoHorarios,
  type FaixaHorario,
  type GradeSemanal,
} from "../lib/apresentacao-perfil-profissional";
import { salvarHorarios } from "../lib/api-perfil-profissional";
import type { Aplicar } from "./tipos";

// O campo de hora do navegador não aceita 24:00: no FIM, 00:00 significa "até a meia-noite".
const exibirFim = (fim: string) => (fim === "24:00" ? "00:00" : fim);
const lerFim = (valor: string) => (valor === "00:00" ? "24:00" : valor);

const ESTILO_HORA = "min-h-11 w-[6.5rem] rounded-jaa-compacto border border-borda bg-superficie px-2 text-base sm:min-h-9";

/**
 * Horários DESTA atividade. Fechado: poucas linhas ("Seg–Sex · 08:00–18:00"). Em edição: uma linha
 * por dia, sem caixa por dia. Salvar só aparece quando há alteração — sem alteração, o que está na
 * tela JÁ está salvo (e a tela diz isso).
 */
export function EditorHorarios({
  atividade,
  aplicar,
  pendente,
  aoMudarPendencia,
}: {
  atividade: AtividadeDoPerfil;
  aplicar: Aplicar;
  pendente: string | null;
  // Avisa o editor da atividade: há horário alterado e não salvo (não dá para "Concluir").
  aoMudarPendencia: (pendente: boolean) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [grade, setGrade] = useState<GradeSemanal>(() => gradeDosPeriodos(atividade.periodos));
  const alterado = JSON.stringify(periodosDaGrade(grade)) !== JSON.stringify(periodosDaGrade(gradeDosPeriodos(atividade.periodos)));
  const chave = `horarios-${atividade.id}`;

  useEffect(() => {
    aoMudarPendencia(alterado);
  }, [alterado, aoMudarPendencia]);

  const mudarDia = (dia: number, faixas: FaixaHorario[]) => setGrade((atual) => ({ ...atual, [dia]: faixas }));
  const descartar = () => {
    setGrade(gradeDosPeriodos(atividade.periodos));
    setEditando(false);
  };

  async function salvar() {
    if (await aplicar(salvarHorarios(atividade.id, { periodos: periodosDaGrade(grade) }), { sucesso: "Horários salvos", chave })) setEditando(false);
  }

  if (!editando) {
    return (
      <section aria-labelledby={`${chave}-titulo`} className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h4 id={`${chave}-titulo`} className="text-sm font-bold text-conteudo">
            Horários
          </h4>
          {resumoHorarios(atividade.periodos).map((linha) => (
            <p key={linha} className="text-sm text-conteudo-suave">
              {linha}
            </p>
          ))}
        </div>
        <Botao aparencia="secundario" onClick={() => setEditando(true)} disabled={pendente !== null}>
          Editar horários
        </Botao>
      </section>
    );
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-bold text-conteudo">Horários</legend>
      <ul className="flex flex-col divide-y divide-borda">
        {DIAS.map(({ dia, rotulo }) => {
          const faixas = grade[dia] ?? [];
          const erro = erroDoDia(dia, faixas);
          const proxima = proximaFaixa(faixas);
          const idErro = `${chave}-dia-${dia}-erro`;
          return (
            <li key={dia} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-start sm:gap-4">
              <label className="flex min-h-11 w-28 shrink-0 items-center gap-3 text-sm font-medium sm:min-h-9">
                <input
                  type="checkbox"
                  checked={faixas.length > 0}
                  aria-label={`Atende ${rotulo}`}
                  onChange={(evento) => mudarDia(dia, evento.target.checked ? [FAIXA_PADRAO] : [])}
                  className="h-5 w-5 shrink-0"
                />
                {rotulo}
              </label>
              <div className="flex min-w-0 flex-1 flex-col gap-2 pl-8 sm:pl-0">
                {faixas.length === 0 && <span className="flex min-h-11 items-center text-sm text-conteudo-suave sm:min-h-9">Fechado</span>}
                {faixas.map((faixa, indice) => (
                  <div key={indice} className="flex flex-wrap items-center gap-2">
                    <input
                      type="time"
                      step={60}
                      value={faixa.inicio}
                      aria-label={`${rotulo}, início do horário ${indice + 1}`}
                      aria-invalid={erro ? true : undefined}
                      aria-describedby={erro ? idErro : undefined}
                      onChange={(evento) => mudarDia(dia, faixas.map((item, i) => (i === indice ? { ...item, inicio: evento.target.value } : item)))}
                      className={ESTILO_HORA}
                    />
                    <span aria-hidden="true" className="text-conteudo-suave">
                      –
                    </span>
                    <input
                      type="time"
                      step={60}
                      value={exibirFim(faixa.fim)}
                      aria-label={`${rotulo}, fim do horário ${indice + 1}`}
                      aria-invalid={erro ? true : undefined}
                      aria-describedby={erro ? idErro : undefined}
                      onChange={(evento) => mudarDia(dia, faixas.map((item, i) => (i === indice ? { ...item, fim: lerFim(evento.target.value) } : item)))}
                      className={ESTILO_HORA}
                    />
                    <BotaoIcone aria-label={`Remover horário ${indice + 1} de ${rotulo}`} onClick={() => mudarDia(dia, faixas.filter((_, i) => i !== indice))}>
                      <IconeLixeira className="h-4 w-4" />
                    </BotaoIcone>
                  </div>
                ))}
                {erro && (
                  <p id={idErro} role="alert" className="text-xs text-perigo">
                    {erro}
                  </p>
                )}
              </div>
              {faixas.length > 0 && proxima && (
                <BotaoIcone aria-label={`Adicionar horário em ${rotulo}`} className="self-end sm:self-start" onClick={() => mudarDia(dia, [...faixas, proxima])}>
                  <IconeMais className="h-4 w-4" />
                </BotaoIcone>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-conteudo-suave">Passa da meia-noite? Termine em 00:00 e continue no dia seguinte.</p>
      <div className="flex flex-wrap items-center gap-2">
        {alterado ? (
          <>
            <Botao carregando={pendente === chave} disabled={pendente !== null || gradeTemErro(grade)} onClick={() => void salvar()}>
              Salvar horários
            </Botao>
            <Botao aparencia="discreto" disabled={pendente !== null} onClick={descartar}>
              Descartar
            </Botao>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1.5 text-sm text-marca">
              <IconeCheck className="h-4 w-4" /> Horários salvos
            </span>
            <Botao aparencia="discreto" onClick={() => setEditando(false)}>
              Fechar
            </Botao>
          </>
        )}
      </div>
    </fieldset>
  );
}
