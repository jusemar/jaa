"use client";

import type { AtividadeDoPerfil, CatalogoServicos, ServicoCatalogo } from "@jaa/contratos";
import { useCallback, useEffect, useState } from "react";
import { IconeCheck, IconeMais } from "@/components/ui/icones";
import { Botao, Cartao, EstadoVazio, Interruptor, Secao, Selo } from "@/components/ui/primitivos";
import { adicionarAtividade, removerAtividade, salvarEscolhasAtividade, salvarPermiteAgendamento } from "../lib/api-perfil-profissional";
import { alternarId, alternarOpcao, atividadesParaAdicionar, resumoEscolhas, resumoHorarios, servicosDoCatalogo } from "../lib/apresentacao-perfil-profissional";
import { EditorHorarios } from "./editor-horarios";
import type { PropsEtapa } from "./tipos";

/**
 * ATIVIDADES: cada uma é um cartão COMPACTO (o essencial numa olhada). "Editar" abre a configuração
 * no próprio cartão; "Concluir" o recolhe — e não deixa sair com alteração não salva.
 */
export function SecaoAtividades({
  perfil,
  catalogo,
  aplicar,
  pendente,
  aoMudarPendencias,
}: PropsEtapa & { catalogo: CatalogoServicos; aoMudarPendencias: (pendentes: boolean) => void }) {
  const [editandoIdEscolhido, setEditandoId] = useState<string | null>(null);
  const [edicaoPendenteRegistrada, setEdicaoPendente] = useState(false);
  // Derivado: se a atividade em edição foi removida, nada está aberto nem pendente.
  const editandoId = perfil.atividades.some((atividade) => atividade.id === editandoIdEscolhido) ? editandoIdEscolhido : null;
  const edicaoPendente = editandoId !== null && edicaoPendenteRegistrada;
  const [escolhendo, setEscolhendo] = useState(false);
  const disponiveis = atividadesParaAdicionar(catalogo, perfil.atividades);
  const doCatalogo = new Map(servicosDoCatalogo(catalogo).map((servico) => [servico.id, servico]));

  useEffect(() => aoMudarPendencias(edicaoPendente), [edicaoPendente, aoMudarPendencias]);

  async function adicionar(servico: ServicoCatalogo) {
    const atualizado = await aplicar(adicionarAtividade(servico.id), { sucesso: `${servico.nome} adicionado`, chave: `adicionar-${servico.id}` });
    if (!atualizado) return;
    setEscolhendo(false);
    setEditandoId(atualizado.atividades.find((atividade) => atividade.atividadeId === servico.id)?.id ?? null);
  }

  const podeAdicionar = disponiveis.length > 0 && !edicaoPendente;

  return (
    <Secao
      titulo="Suas atividades"
      descricao={perfil.atividades.length >= 3 ? "Máximo de 3 atividades" : `${perfil.atividades.length} de 3`}
      acoes={
        disponiveis.length > 0 &&
        !escolhendo && (
          <Botao aparencia="secundario" disabled={!podeAdicionar} onClick={() => setEscolhendo(true)}>
            <IconeMais className="h-4 w-4" /> Adicionar atividade
          </Botao>
        )
      }
    >
      {escolhendo && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-conteudo-suave">Escolha:</span>
          {disponiveis.map((servico) => (
            <Botao key={servico.id} aparencia="realce" carregando={pendente === `adicionar-${servico.id}`} textoCarregando="Adicionando…" disabled={pendente !== null} onClick={() => void adicionar(servico)}>
              {servico.nome}
            </Botao>
          ))}
          <Botao aparencia="discreto" onClick={() => setEscolhendo(false)}>
            Cancelar
          </Botao>
        </div>
      )}

      {perfil.atividades.length === 0 && !escolhendo && (
        <EstadoVazio
          titulo="Nenhuma atividade"
          descricao="Escolha o que você oferece."
          acao={
            <Botao onClick={() => setEscolhendo(true)}>
              <IconeMais className="h-4 w-4" /> Adicionar atividade
            </Botao>
          }
        />
      )}

      <ul className="flex flex-col gap-3">
        {perfil.atividades.map((atividade) => (
          <li key={atividade.id}>
            {editandoId === atividade.id ? (
              <EditorAtividade
                atividade={atividade}
                servico={doCatalogo.get(atividade.atividadeId)}
                aplicar={aplicar}
                pendente={pendente}
                aoMudarPendencia={setEdicaoPendente}
                aoConcluir={() => {
                  setEdicaoPendente(false);
                  setEditandoId(null);
                }}
              />
            ) : (
              <CartaoAtividade
                atividade={atividade}
                servico={doCatalogo.get(atividade.atividadeId)}
                // Com outra atividade em edição e alterações não salvas, não se abre uma segunda.
                bloqueado={edicaoPendente}
                aoEditar={() => setEditandoId(atividade.id)}
              />
            )}
          </li>
        ))}
      </ul>
    </Secao>
  );
}

function CartaoAtividade({
  atividade,
  servico,
  bloqueado,
  aoEditar,
}: {
  atividade: AtividadeDoPerfil;
  servico: ServicoCatalogo | undefined;
  bloqueado: boolean;
  aoEditar: () => void;
}) {
  const escolhas = resumoEscolhas(atividade, servico);
  const temHorario = atividade.periodos.length > 0;
  return (
    <Cartao className="flex items-start justify-between gap-3 p-4">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-conteudo">{atividade.nome}</h3>
          {temHorario ? <IconeCheck className="h-4 w-4 text-marca" aria-label="Configurada" /> : <Selo tom="atencao">Sem horários</Selo>}
        </div>
        {escolhas.length > 0 && <p className="text-sm text-conteudo">{escolhas.join(" · ")}</p>}
        <p className="text-sm text-conteudo-suave">{resumoHorarios(atividade.periodos).join(" · ")}</p>
        {atividade.permiteAgendamento && (
          <div>
            <Selo tom="marca">Agendamento ativo</Selo>
          </div>
        )}
      </div>
      <Botao aparencia="secundario" disabled={bloqueado} onClick={aoEditar}>
        Editar
      </Botao>
    </Cartao>
  );
}

// Escolha selecionável: chip compacto com o estado dito ao leitor de tela (aria-checked), não só pela cor.
function Escolha({ papel, marcada, rotulo, aoAlternar }: { papel: "checkbox" | "radio"; marcada: boolean; rotulo: string; aoAlternar: () => void }) {
  return (
    <button
      type="button"
      role={papel}
      aria-checked={marcada}
      onClick={aoAlternar}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-medium sm:min-h-9 ${
        marcada ? "border-marca bg-marca-suave text-marca" : "border-borda bg-superficie text-conteudo-suave hover:text-conteudo"
      }`}
    >
      {marcada && <IconeCheck className="h-3.5 w-3.5" aria-hidden="true" />}
      {rotulo}
    </button>
  );
}

function mesmoConjunto(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((item) => b.includes(item));
}

/**
 * Configuração de UMA atividade, no próprio cartão. Cada parte tem a SUA persistência (escolhas,
 * horários, agendamento) — "Concluir" não salva nada: só fecha, e fica bloqueado enquanto houver
 * alteração não salva (nada se perde em silêncio).
 */
function EditorAtividade({
  atividade,
  servico,
  aplicar,
  pendente,
  aoMudarPendencia,
  aoConcluir,
}: {
  atividade: AtividadeDoPerfil;
  servico: ServicoCatalogo | undefined;
  aplicar: PropsEtapa["aplicar"];
  pendente: string | null;
  aoMudarPendencia: (pendente: boolean) => void;
  aoConcluir: () => void;
}) {
  const [especialidades, setEspecialidades] = useState(atividade.especialidadeIds);
  const [opcoes, setOpcoes] = useState(atividade.opcaoIds);
  const [horariosPendentes, setHorariosPendentes] = useState(false);
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);
  const temEscolhas = Boolean(servico && (servico.especialidades.length > 0 || servico.atributos.length > 0));
  const escolhasAlteradas = !mesmoConjunto(especialidades, atividade.especialidadeIds) || !mesmoConjunto(opcoes, atividade.opcaoIds);
  const haPendencia = escolhasAlteradas || horariosPendentes;
  const chaveEscolhas = `escolhas-${atividade.id}`;
  const idAvisoConcluir = `concluir-${atividade.id}-aviso`;

  useEffect(() => aoMudarPendencia(haPendencia), [haPendencia, aoMudarPendencia]);
  const aoMudarHorarios = useCallback((valor: boolean) => setHorariosPendentes(valor), []);

  return (
    <Cartao className="flex flex-col gap-5 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-conteudo">{atividade.nome}</h3>
        <span className="text-xs text-conteudo-suave">Editando</span>
      </div>

      {temEscolhas && servico && (
        <section className="flex flex-col gap-4">
          {servico.especialidades.length > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-bold text-conteudo">Especialidades</legend>
              <div className="flex flex-wrap gap-2">
                {servico.especialidades.map((especialidade) => (
                  <Escolha
                    key={especialidade.id}
                    papel="checkbox"
                    marcada={especialidades.includes(especialidade.id)}
                    rotulo={especialidade.nome}
                    aoAlternar={() => setEspecialidades((atual) => alternarId(atual, especialidade.id))}
                  />
                ))}
              </div>
            </fieldset>
          )}
          {servico.atributos.map((atributo) => (
            <fieldset key={atributo.id} className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-bold text-conteudo">{atributo.nome}</legend>
              <div role={atributo.tipoSelecao === "unica" ? "radiogroup" : "group"} aria-label={atributo.nome} className="flex flex-wrap gap-2">
                {atributo.opcoes.map((opcao) => (
                  <Escolha
                    key={opcao.id}
                    papel={atributo.tipoSelecao === "unica" ? "radio" : "checkbox"}
                    marcada={opcoes.includes(opcao.id)}
                    rotulo={opcao.nome}
                    aoAlternar={() => setOpcoes((atual) => alternarOpcao(atual, opcao.id, atributo))}
                  />
                ))}
              </div>
            </fieldset>
          ))}
          {escolhasAlteradas && (
            <div className="flex flex-wrap gap-2">
              <Botao
                carregando={pendente === chaveEscolhas}
                disabled={pendente !== null}
                onClick={() => void aplicar(salvarEscolhasAtividade(atividade.id, { especialidadeIds: especialidades, opcaoIds: opcoes }), { sucesso: "Atividade salva", chave: chaveEscolhas })}
              >
                Salvar
              </Botao>
              <Botao
                aparencia="discreto"
                disabled={pendente !== null}
                onClick={() => {
                  setEspecialidades(atividade.especialidadeIds);
                  setOpcoes(atividade.opcaoIds);
                }}
              >
                Descartar
              </Botao>
            </div>
          )}
        </section>
      )}

      <div className="border-t border-borda pt-4">
        <EditorHorarios key={JSON.stringify(atividade.periodos)} atividade={atividade} aplicar={aplicar} pendente={pendente} aoMudarPendencia={aoMudarHorarios} />
      </div>

      <div className="border-t border-borda pt-4">
        <Interruptor
          id={`agendamento-${atividade.id}`}
          rotulo="Permitir agendamento"
          descricao="Clientes poderão reservar horário."
          ligado={atividade.permiteAgendamento}
          disabled={pendente !== null}
          aoMudar={(ligado) =>
            void aplicar(salvarPermiteAgendamento(atividade.id, ligado), { sucesso: ligado ? "Agendamento ativado" : "Agendamento desativado", chave: `agendamento-${atividade.id}` })
          }
        />
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-borda pt-4 sm:flex-row sm:items-center sm:justify-between">
        {confirmandoRemocao ? (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Remover ${atividade.nome}`}>
            <span className="text-sm text-conteudo">Remover {atividade.nome}?</span>
            <Botao
              aparencia="perigo"
              carregando={pendente === `remover-${atividade.id}`}
              textoCarregando="Removendo…"
              disabled={pendente !== null}
              onClick={() => void aplicar(removerAtividade(atividade.id), { sucesso: `${atividade.nome} removido`, chave: `remover-${atividade.id}` })}
            >
              Remover
            </Botao>
            <Botao aparencia="discreto" onClick={() => setConfirmandoRemocao(false)}>
              Cancelar
            </Botao>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmandoRemocao(true)} className="min-h-11 self-start text-sm text-conteudo-suave underline-offset-2 hover:text-perigo hover:underline sm:min-h-9 sm:self-auto">
            Remover atividade
          </button>
        )}
        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <Botao disabled={haPendencia || pendente !== null} aria-describedby={haPendencia ? idAvisoConcluir : undefined} onClick={aoConcluir}>
            Concluir
          </Botao>
          {haPendencia && (
            <p id={idAvisoConcluir} className="text-xs text-aviso">
              Salve ou descarte as alterações.
            </p>
          )}
        </div>
      </div>
    </Cartao>
  );
}
