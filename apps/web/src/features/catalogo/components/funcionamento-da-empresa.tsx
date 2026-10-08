"use client";

import { DIAS_SEMANA, ROTULO_DIA_SEMANA, horariosDoDiaEmTexto, type FuncionamentoPublico } from "@jaa/contratos";
import { useId, useState, type ReactNode } from "react";
import { IconeRelogio, IconeSetaBaixo } from "@/components/ui/icones";

/*
 * ABERTA OU FECHADA — o primeiro bloco útil do cardápio. Uma linha só:
 *
 *   ● Aberto agora · até 23:00                         🕒 Horários ⌄
 *
 * O estado vem em destaque (palavra + cor + ponto: cor nunca é a única pista) e o complemento
 * ("até 23:00", "abre amanhã às 08:00") em peso secundário. Tocar na linha abre os horários da
 * semana logo abaixo; eles não ocupam a tela enquanto ninguém pede.
 *
 * Tudo o que aparece vem PRONTO do servidor (estado e textos); aqui não se compara horário. Empresa
 * que não controla horário não mostra nada: ela recebe pedidos a qualquer hora, como sempre.
 */

/** Há o que mostrar? (Quem monta a barra do cardápio precisa saber antes de reservar a linha.) */
export function temFuncionamentoVisivel(funcionamento: FuncionamentoPublico | undefined): funcionamento is FuncionamentoPublico {
  return Boolean(funcionamento?.estado.controlado && funcionamento.estado.resumo);
}

export function FuncionamentoDaEmpresa({
  funcionamento,
  antes,
  depois,
}: {
  funcionamento: FuncionamentoPublico;
  // Ações discretas da mesma linha (ex.: voltar à lista, fechar o cardápio) — sem criar outra faixa.
  antes?: ReactNode;
  depois?: ReactNode;
}) {
  const [semanaAberta, setSemanaAberta] = useState(false);
  const idSemana = useId();
  const { estado, hoje, semana } = funcionamento;
  if (!temFuncionamentoVisivel(funcionamento)) return null;

  // "Aberto agora · até 23:00" → o estado em destaque, o complemento em peso secundário.
  const [situacao, ...resto] = (estado.resumo ?? "").split(" · ");
  const complemento = resto.join(" · ");
  const cor = estado.abertoAgora ? "text-marca" : "text-aviso";

  return (
    <div data-funcionamento={estado.abertoAgora ? "aberto" : "fechado"} className="flex flex-col">
      <div className="flex items-center gap-1">
        {antes}
        <button
          type="button"
          data-ver-horarios
          aria-expanded={semanaAberta}
          aria-controls={idSemana}
          onClick={() => setSemanaAberta((aberta) => !aberta)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-jaa-compacto px-2 text-left transition-colors hover:bg-realce sm:min-h-10"
        >
          <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${estado.abertoAgora ? "bg-marca" : "bg-aviso"}`} />
          <span data-resumo-funcionamento aria-live="polite" className="min-w-0 flex-1 text-sm leading-tight [overflow-wrap:anywhere]">
            <span className={`font-semibold ${cor}`}>{situacao}</span>
            {complemento && <span className="text-conteudo-suave"> · {complemento}</span>}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-conteudo-suave">
            <IconeRelogio className="h-4 w-4" />
            <span className="hidden min-[400px]:inline">Horários</span>
            <IconeSetaBaixo className={`h-3.5 w-3.5 transition-transform ${semanaAberta ? "rotate-180" : ""}`} />
          </span>
          <span className="sr-only">{semanaAberta ? "Ocultar horários da semana" : "Ver horários da semana"}</span>
        </button>
        {depois}
      </div>

      {semanaAberta && (
        <dl id={idSemana} data-semana-de-funcionamento className="painel-entrando mx-2 mb-1 mt-1 flex flex-col border-t border-borda pt-2 text-xs sm:max-w-sm">
          {DIAS_SEMANA.map((dia) => {
            const horarios = horariosDoDiaEmTexto(semana, dia);
            return (
              <div key={dia} data-dia-de-funcionamento={dia} data-hoje={dia === hoje ? "" : undefined} className={`flex justify-between gap-3 rounded-jaa-compacto px-2 py-1.5 ${dia === hoje ? "bg-superficie-suave font-semibold" : ""}`}>
                <dt>
                  {ROTULO_DIA_SEMANA[dia]}
                  {dia === hoje && <span className="ml-1.5 font-normal text-conteudo-suave">hoje</span>}
                </dt>
                <dd className={`text-right tabular-nums ${horarios === "Fechado" ? "font-normal text-conteudo-suave" : ""}`}>{horarios}</dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}
