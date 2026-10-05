"use client";

import { DIAS_SEMANA, ROTULO_DIA_SEMANA, horariosDoDiaEmTexto, type FuncionamentoPublico } from "@jaa/contratos";
import { useId, useState } from "react";
import { IconeRelogio, IconeSetaBaixo } from "@/components/ui/icones";

/*
 * ABERTA OU FECHADA, logo no topo do cardápio: uma linha ("Aberto agora · até 23:00" /
 * "Fechado · abre amanhã às 08:00") e, a um toque, os horários da semana.
 *
 * Tudo o que aparece vem PRONTO do servidor (estado e textos); aqui não se compara horário. Empresa
 * que não controla horário não mostra nada: ela recebe pedidos a qualquer hora, como sempre.
 */
export function FuncionamentoDaEmpresa({ funcionamento }: { funcionamento: FuncionamentoPublico }) {
  const [semanaAberta, setSemanaAberta] = useState(false);
  const idSemana = useId();
  const { estado, hoje, semana } = funcionamento;
  if (!estado.controlado || !estado.resumo) return null;

  return (
    <div data-funcionamento={estado.abertoAgora ? "aberto" : "fechado"} className="flex flex-col">
      <button
        type="button"
        data-ver-horarios
        aria-expanded={semanaAberta}
        aria-controls={idSemana}
        onClick={() => setSemanaAberta((aberta) => !aberta)}
        className="-mx-1 flex min-h-11 items-center gap-2 rounded-jaa-compacto px-1 text-left text-xs hover:bg-realce sm:min-h-9"
      >
        {/* Cor nunca é a única pista: o texto diz "Aberto"/"Fechado". */}
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${estado.abertoAgora ? "bg-marca" : "bg-aviso"}`} />
        <span data-resumo-funcionamento aria-live="polite" className={`min-w-0 flex-1 font-medium [overflow-wrap:anywhere] ${estado.abertoAgora ? "text-marca" : "text-aviso"}`}>
          {estado.resumo}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-conteudo-suave">
          <IconeRelogio className="h-3.5 w-3.5" />
          Horários
          <IconeSetaBaixo className={`h-3.5 w-3.5 transition-transform ${semanaAberta ? "rotate-180" : ""}`} />
        </span>
      </button>

      {semanaAberta && (
        <dl id={idSemana} data-semana-de-funcionamento className="mt-1 flex flex-col border-t border-borda pt-2 text-xs sm:max-w-sm">
          {DIAS_SEMANA.map((dia) => (
            <div key={dia} data-dia-de-funcionamento={dia} data-hoje={dia === hoje ? "" : undefined} className={`flex justify-between gap-3 rounded-jaa-compacto px-2 py-1.5 ${dia === hoje ? "bg-superficie-suave font-semibold" : ""}`}>
              <dt>
                {ROTULO_DIA_SEMANA[dia]}
                {dia === hoje && <span className="ml-1.5 font-normal text-conteudo-suave">hoje</span>}
              </dt>
              <dd className={`text-right ${horariosDoDiaEmTexto(semana, dia) === "Fechado" ? "text-conteudo-suave" : ""}`}>{horariosDoDiaEmTexto(semana, dia)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
