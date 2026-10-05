import {
  DIAS_SEMANA,
  NOME_DIA_SEMANA,
  ROTULO_DIA_SEMANA,
  avisoDeMinimoDoDia,
  opcoesOferecidasNoDia,
  type DiaSemana,
  type GrupoOpcoesProduto,
  type ProgramacaoSemanalGrupo,
} from "@jaa/contratos";
import { IconeCalendario, IconeCheck, IconeCopiar, IconeInformacao } from "@/components/ui/icones";
import { Aviso, Botao, Interruptor, Selo } from "@/components/ui/primitivos";
import { SIGLA_DIA, destinosPossiveis } from "../lib/edicao-semana";

/*
 * ABA "PROGRAMAÇÃO SEMANAL" do editor de grupo — só apresentação (nenhuma chamada de rede aqui; quem
 * busca e grava é o editor, `editor-de-grupo.tsx`).
 *
 * Um dia por vez: o cabeçalho com a chave liga/desliga, as sete posições (Seg…Dom), o dia escolhido
 * com as opções JÁ cadastradas para marcar e "Copiar para outros dias". Nada é gravado a cada toque:
 * o gestor marca o que quiser e toca em "Salvar dia", no rodapé da janela.
 *
 * Vale para qualquer grupo (nenhum nome é especial) e não mexe em mínimo/máximo: decide apenas QUAIS
 * opções existem em cada dia. A disponibilidade normal da opção continua mandando.
 */

const rotuloDeOpcoes = (total: number) => (total === 1 ? "1 opção" : `${total} opções`);

/**
 * SETE POSIÇÕES em colunas IGUAIS (`grid-cols-7`): cabem em 320 px sem rolagem horizontal. No celular
 * cada posição mostra a sigla e o número; a partir de `sm` há espaço para "4 opções" por extenso.
 * Dia com menos opções do que o grupo exige ganha um sinal (com texto para leitor de tela).
 */
export function SeletorDeDias({
  grupo,
  programacao,
  dia,
  hoje,
  aoEscolher,
}: {
  grupo: GrupoOpcoesProduto;
  programacao: ProgramacaoSemanalGrupo | null;
  dia: DiaSemana;
  hoje: DiaSemana;
  aoEscolher: (dia: DiaSemana) => void;
}) {
  return (
    <div role="tablist" aria-label="Dias da semana" data-seletor-de-dias className="grid grid-cols-7 gap-1 sm:gap-1.5">
      {DIAS_SEMANA.map((posicao) => {
        const selecionado = posicao === dia;
        const programado = programacao?.dias.find((item) => item.diaSemana === posicao) ?? null;
        const total = programado ? opcoesOferecidasNoDia(grupo, programado.opcaoIds) : null;
        const comAviso = programado ? avisoDeMinimoDoDia(grupo, programado) !== null : false;
        return (
          <button
            key={posicao}
            type="button"
            role="tab"
            aria-selected={selecionado}
            aria-label={`${ROTULO_DIA_SEMANA[posicao]}${posicao === hoje ? " (hoje)" : ""}${total !== null ? `: ${rotuloDeOpcoes(total)}` : ""}${comAviso ? ", menos do que o grupo exige" : ""}`}
            data-dia={posicao}
            data-hoje={posicao === hoje ? "" : undefined}
            onClick={() => aoEscolher(posicao)}
            className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-jaa-compacto border px-0.5 text-xs font-medium leading-none shadow-suave transition-colors ${
              selecionado ? "border-marca bg-marca text-marca-conteudo" : "border-borda bg-superficie text-conteudo hover:bg-realce"
            }`}
          >
            <span className="flex items-center gap-1">
              {SIGLA_DIA[posicao]}
              {/* Hoje: um ponto discreto. É só referência para o gestor. */}
              {posicao === hoje && <span aria-hidden className={`h-1 w-1 rounded-full ${selecionado ? "bg-marca-conteudo" : "bg-marca"}`} />}
            </span>
            <span
              data-total-do-dia
              className={`text-[11px] ${comAviso ? `rounded-full px-1.5 py-0.5 font-bold ${selecionado ? "bg-superficie text-aviso" : "bg-aviso/10 text-aviso"}` : selecionado ? "" : "text-conteudo-suave"}`}
            >
              {total ?? "–"}
              {total !== null && <span className="hidden sm:inline"> {total === 1 ? "opção" : "opções"}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export interface EstadoDaAplicacao {
  destinos: readonly DiaSemana[];
  mensagem: { tom: "sucesso" | "erro"; texto: string } | null;
}

export function AbaProgramacaoSemanal({
  grupo,
  programacao,
  dia,
  hoje,
  rascunho,
  alterado,
  ocupado,
  erro,
  aplicacao,
  aoAlternarProgramacao,
  aoEscolherDia,
  aoAlternarOpcao,
  aoMarcarTodas,
  aoLimpar,
  aoAbrirAplicar,
  aoAlternarDestino,
  aoDefinirDestinos,
  aoAplicar,
  aoCancelarAplicar,
}: {
  // null = grupo ainda não salvo: não há o que programar.
  grupo: GrupoOpcoesProduto | null;
  // null = desligada, ou ligada e ainda carregando.
  programacao: ProgramacaoSemanalGrupo | null;
  dia: DiaSemana;
  // Dia de hoje no relógio do gestor (conveniência; o dia do cardápio é decidido pelo servidor).
  hoje: DiaSemana;
  // Marcações do dia NA TELA (podem diferir do que está salvo).
  rascunho: readonly string[];
  alterado: boolean;
  ocupado: boolean;
  erro: string | null;
  // "Copiar para outros dias": null = fechado; senão os destinos escolhidos e, depois de aplicar, o resultado.
  aplicacao: EstadoDaAplicacao | null;
  aoAlternarProgramacao: (ligada: boolean) => void;
  aoEscolherDia: (dia: DiaSemana) => void;
  aoAlternarOpcao: (opcaoId: string, marcada: boolean) => void;
  aoMarcarTodas: () => void;
  aoLimpar: () => void;
  aoAbrirAplicar: () => void;
  aoAlternarDestino: (dia: DiaSemana, marcado: boolean) => void;
  aoDefinirDestinos: (dias: DiaSemana[]) => void;
  aoAplicar: () => void;
  aoCancelarAplicar: () => void;
}) {
  if (!grupo) {
    return (
      <div data-programacao-semanal="indisponivel" className="flex gap-3 rounded-jaa bg-superficie-suave p-4">
        <IconeCalendario className="h-5 w-5 shrink-0 text-conteudo-suave" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Salve o grupo primeiro</p>
          <p className="text-xs text-conteudo-suave">Depois de criar o grupo e as opções dele, você escolhe aqui o que é oferecido em cada dia da semana.</p>
        </div>
      </div>
    );
  }

  const ativa = grupo.programacaoSemanal;
  const marcadas = new Set(rascunho);
  // O aviso acompanha o que está NA TELA: o gestor vê o efeito antes de salvar.
  const aviso = avisoDeMinimoDoDia(grupo, { diaSemana: dia, opcaoIds: [...rascunho] });
  const destinos = destinosPossiveis(dia);

  return (
    <div data-programacao-semanal={ativa ? "ligada" : "desligada"} className="flex flex-col gap-5">
      <Interruptor
        id={`programacao-semanal-${grupo.id}`}
        rotulo="Programação semanal"
        descricao="Disponibilidade diferente para cada dia da semana."
        ligado={ativa}
        disabled={ocupado || alterado}
        aoMudar={aoAlternarProgramacao}
      />

      {!ativa && (
        <div className="flex gap-3 rounded-jaa bg-superficie-suave p-4">
          <IconeCalendario className="h-5 w-5 shrink-0 text-conteudo-suave" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">As opções estão disponíveis todos os dias</p>
            <p className="text-xs text-conteudo-suave">Ao ligar pela primeira vez, as opções atuais são mantidas em todos os dias. Uma programação já feita é guardada e volta como estava.</p>
          </div>
        </div>
      )}

      {ativa && (
        <>
          <SeletorDeDias grupo={grupo} programacao={programacao} dia={dia} hoje={hoje} aoEscolher={aoEscolherDia} />

          {!programacao && !erro && (
            <p role="status" className="text-sm text-conteudo-suave">
              Carregando a programação…
            </p>
          )}

          {programacao && (
            <section role="tabpanel" aria-label={`Opções de ${ROTULO_DIA_SEMANA[dia]}`} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <h3 className="fonte-display text-base font-semibold first-letter:uppercase">
                  {NOME_DIA_SEMANA[dia]}
                  {dia === hoje && <span className="ml-2 text-xs font-medium text-conteudo-suave">hoje</span>}
                </h3>
                {grupo.opcoes.length > 0 && (
                  <Botao
                    aparencia={aplicacao ? "realce" : "discreto"}
                    data-abrir-aplicar
                    // Copia o dia como está SALVO: com marcação pendente, primeiro "Salvar dia".
                    disabled={ocupado || alterado}
                    title={alterado ? "Salve o dia antes de copiar" : undefined}
                    onClick={aplicacao ? aoCancelarAplicar : aoAbrirAplicar}
                    className="!px-2 text-xs"
                  >
                    <IconeCopiar className="h-4 w-4" />
                    Copiar para outros dias
                  </Botao>
                )}
              </div>

              {/* Copiar ESTE dia (já salvo) para outros: reutiliza a programação, não duplica opção nenhuma. */}
              {aplicacao && (
                <div data-aplicar-a-outros-dias className="flex flex-col gap-3 rounded-jaa bg-superficie-suave p-4">
                  <p className="text-sm">
                    Aplicar opções de {ROTULO_DIA_SEMANA[dia].toLowerCase()} em:
                  </p>
                  <div className="grid grid-cols-2 gap-x-3 min-[400px]:grid-cols-3 sm:flex sm:flex-wrap sm:gap-x-4">
                    {destinos.todos.map((destino) => (
                      <label key={destino} data-destino={destino} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm sm:min-h-9">
                        <input type="checkbox" checked={aplicacao.destinos.includes(destino)} disabled={ocupado} onChange={(evento) => aoAlternarDestino(destino, evento.target.checked)} className="h-5 w-5 shrink-0 accent-[var(--cor-marca)] sm:h-4 sm:w-4" />
                        {ROTULO_DIA_SEMANA[destino]}
                      </label>
                    ))}
                  </div>
                  {aplicacao.mensagem && <Aviso tom={aplicacao.mensagem.tom === "erro" ? "erro" : "informacao"}>{aplicacao.mensagem.texto}</Aviso>}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex gap-1">
                      <Botao aparencia="discreto" data-atalho-dias-uteis disabled={ocupado} onClick={() => aoDefinirDestinos(destinos.diasUteis)} className="-ml-2 !px-2 text-xs">
                        Dias úteis
                      </Botao>
                      <Botao aparencia="discreto" data-atalho-todos disabled={ocupado} onClick={() => aoDefinirDestinos(destinos.todos)} className="!px-2 text-xs">
                        Todos os outros
                      </Botao>
                    </div>
                    <Botao data-aplicar disabled={ocupado || aplicacao.destinos.length === 0} onClick={aoAplicar}>
                      <IconeCheck className="h-4 w-4" />
                      {ocupado ? "Aplicando…" : "Aplicar"}
                    </Botao>
                  </div>
                </div>
              )}

              {grupo.opcoes.length === 0 ? (
                <p className="py-6 text-sm text-conteudo-suave">Adicione opções na aba Opções e regras.</p>
              ) : (
                <>
                  <div className="-mb-1 flex gap-1">
                    <Botao aparencia="discreto" data-marcar-todas disabled={ocupado} onClick={aoMarcarTodas} className="-ml-2 !px-2 text-xs">
                      Marcar todas
                    </Botao>
                    <Botao aparencia="discreto" data-limpar-dia disabled={ocupado || rascunho.length === 0} onClick={aoLimpar} className="!px-2 text-xs">
                      Limpar
                    </Botao>
                  </div>
                  <ul className="flex flex-col divide-y divide-borda border-y border-borda">
                    {grupo.opcoes.map((opcao) => {
                      const indisponivel = opcao.disponibilidade !== "disponivel";
                      return (
                        <li key={opcao.id}>
                          <label data-opcao-do-dia={opcao.id} className="flex min-h-14 cursor-pointer items-center gap-3 py-2 sm:min-h-12">
                            <input
                              type="checkbox"
                              checked={marcadas.has(opcao.id)}
                              disabled={ocupado}
                              onChange={(evento) => aoAlternarOpcao(opcao.id, evento.target.checked)}
                              className="h-5 w-5 shrink-0 accent-[var(--cor-marca)]"
                            />
                            <span className={`min-w-0 flex-1 text-sm [overflow-wrap:anywhere] ${indisponivel ? "text-conteudo-suave" : ""}`}>{opcao.nome}</span>
                            {/* A disponibilidade normal continua mandando: marcar o dia não a torna disponível. */}
                            {indisponivel && <Selo tom="atencao">Indisponível</Selo>}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              <p className="flex gap-2 text-xs text-conteudo-suave">
                <IconeInformacao className="mt-px h-3.5 w-3.5 shrink-0" />
                Opções indisponíveis não aparecem no cardápio, mesmo quando programadas. Opção nova não entra sozinha nos dias: marque onde ela vale.
              </p>

              {aviso && <Aviso tom="atencao">{aviso}</Aviso>}
            </section>
          )}
        </>
      )}

      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </div>
  );
}
