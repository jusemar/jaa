import { ROTULO_ESTADO_OPERACIONAL, type EntregadorOperacional, type PainelOperacional } from "@jaa/contratos";

// Quem está na fila da base, quem está disponível fora dela, quem está com rota e quem não está aceitando.
export function QuadroDaFila({ painel }: { painel: PainelOperacional }) {
  const naoAceitando = painel.indisponiveis.filter((entregador) => entregador.estado === "indisponivel");
  const comRota = painel.indisponiveis.filter((entregador) => entregador.estado !== "indisponivel");
  return (
    <div className="flex flex-col gap-2 text-sm">
      {!painel.baseConfigurada && (
        <p className="text-xs text-aviso">Confirme o ponto da base para que a chegada dos entregadores seja detectada automaticamente.</p>
      )}

      <Grupo titulo="Na base — fila" rotulo="Fila da base" entregadores={painel.fila} vazio="Ninguém na base agora." />
      <Grupo titulo="Fora da base" rotulo="Disponíveis fora da base" entregadores={painel.foraDaBase} vazio="Ninguém disponível fora da base." />
      {/*
        O terceiro grupo do servidor reúne TODO MUNDO que não está na fila nem "disponível fora da
        base": quem está com rota (reservada ou na rua) e quem não está aceitando. São situações
        opostas — chamar as duas de "Indisponíveis" fazia um entregador com rota parecer fora do ar.
      */}
      <Grupo titulo="Com rota" rotulo="Com rota" entregadores={comRota} vazio="Ninguém com rota agora." rotuloDoEstado={(entregador) => (entregador.estado === "em_entrega" ? "Em entrega" : "Rota atribuída")} />
      <Grupo titulo="Não aceitando entregas" rotulo="Não aceitando entregas" entregadores={naoAceitando} vazio="Todos estão aceitando entregas." />
    </div>
  );
}

function Grupo({ titulo, rotulo, entregadores, vazio, rotuloDoEstado }: { titulo: string; rotulo: string; entregadores: EntregadorOperacional[]; vazio: string; rotuloDoEstado?: (entregador: EntregadorOperacional) => string }) {
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
                {rotuloDoEstado ? rotuloDoEstado(entregador) : ROTULO_ESTADO_OPERACIONAL[entregador.estado]}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
