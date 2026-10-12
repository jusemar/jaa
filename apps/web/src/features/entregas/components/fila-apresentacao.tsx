import { ROTULO_ESTADO_OPERACIONAL, type EntregadorOperacional, type PainelOperacional } from "@jaa/contratos";

// A FILA da base: quem está presente e apto, na ordem do servidor. Os demais grupos (na rota, fora
// da base, indisponíveis, desativados) têm cada um a sua opção no quadro de entregadores.
export function QuadroDaFila({ painel }: { painel: PainelOperacional }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      {!painel.baseConfigurada && (
        <p className="text-xs text-aviso">Confirme o ponto da base para que a chegada dos entregadores seja detectada automaticamente.</p>
      )}

      <Grupo titulo="Na base — fila" rotulo="Fila da base" entregadores={painel.fila} vazio="Ninguém na base agora." />
    </div>
  );
}

function Grupo({ titulo, rotulo, entregadores, vazio }: { titulo: string; rotulo: string; entregadores: EntregadorOperacional[]; vazio: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold text-conteudo-suave">{titulo}</p>
      {entregadores.length === 0 ? (
        <p className="text-xs text-conteudo-suave">{vazio}</p>
      ) : (
        <ol aria-label={rotulo} className="flex flex-col divide-y divide-borda rounded-jaa border border-borda">
          {entregadores.map((entregador) => (
            <li key={entregador.id} data-operacional={entregador.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
              <span>
                {entregador.posicaoFila !== null && <span data-posicao-fila={entregador.posicaoFila}>{entregador.posicaoFila}. </span>}
                {entregador.pessoa.nomeExibicao}
              </span>
              <span data-estado-operacional={entregador.estado} className={entregador.estado === "disponivel_na_base" || entregador.estado === "em_entrega" ? "text-marca" : "text-conteudo-suave"}>
                {ROTULO_ESTADO_OPERACIONAL[entregador.estado]}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
