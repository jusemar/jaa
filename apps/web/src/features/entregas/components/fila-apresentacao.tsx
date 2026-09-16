import { ROTULO_ESTADO_OPERACIONAL, type EntregadorOperacional, type PainelOperacional } from "@jaa/contratos";

// Quem está na fila da base, quem está disponível fora dela e quem não está aceitando entregas.
export function QuadroDaFila({ painel }: { painel: PainelOperacional }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      {!painel.baseConfigurada && (
        <p className="text-xs text-amber-700">Confirme o ponto da base para que a chegada dos entregadores seja detectada automaticamente.</p>
      )}

      <Grupo titulo="Na base — fila" rotulo="Fila da base" entregadores={painel.fila} vazio="Ninguém na base agora." />
      <Grupo titulo="Fora da base" rotulo="Disponíveis fora da base" entregadores={painel.foraDaBase} vazio="Ninguém disponível fora da base." />
      <Grupo titulo="Indisponíveis" rotulo="Indisponíveis" entregadores={painel.indisponiveis} vazio="Ninguém indisponível." />
    </div>
  );
}

function Grupo({ titulo, rotulo, entregadores, vazio }: { titulo: string; rotulo: string; entregadores: EntregadorOperacional[]; vazio: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold text-zinc-600">{titulo}</p>
      {entregadores.length === 0 ? (
        <p className="text-xs text-zinc-500">{vazio}</p>
      ) : (
        <ol aria-label={rotulo} className="flex flex-col divide-y divide-zinc-200 rounded border border-zinc-200">
          {entregadores.map((entregador) => (
            <li key={entregador.id} data-operacional={entregador.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
              <span>
                {entregador.posicaoFila !== null && <span data-posicao-fila={entregador.posicaoFila}>{entregador.posicaoFila}. </span>}
                {entregador.pessoa.nomeExibicao}
              </span>
              <span data-estado-operacional={entregador.estado} className={entregador.estado === "disponivel_na_base" ? "text-emerald-700" : "text-zinc-600"}>
                {ROTULO_ESTADO_OPERACIONAL[entregador.estado]}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
