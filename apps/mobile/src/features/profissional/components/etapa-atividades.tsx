import type { AtividadeDoPerfil, CatalogoServicos, ServicoCatalogo } from "@jaa/contratos";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, TextInput, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { Icone } from "@/components/ui/icone";
import { Cartao, EstadoVazio, Secao, Selo } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { ALTURA_TOQUE, Cores, Espaco, Raio } from "@/constants/theme";
import { adicionarAtividade, removerAtividade, salvarEscolhasAtividade, salvarHorarios, salvarPermiteAgendamento } from "../lib/api-perfil-profissional";
import {
  DIAS,
  FAIXA_PADRAO,
  alternarId,
  alternarOpcao,
  atividadesParaAdicionar,
  atributosSemEscolha,
  erroDoDia,
  gradeDosPeriodos,
  gradeTemErro,
  mascararHora,
  periodosDaGrade,
  proximaFaixa,
  resumoEscolhas,
  resumoHorarios,
  servicosDoCatalogo,
  type FaixaHorario,
  type GradeSemanal,
} from "../lib/apresentacao-perfil-profissional";
import { Divisoria, Escolha, GrupoEscolhas, LinhaInterruptor, type Aplicar, type PropsEtapa } from "./pecas";

/**
 * ATIVIDADES do perfil (até 3) — mesmas regras da Web. Atividade com item OBRIGATÓRIO (o Veículo do
 * Entregador) tem a escolha feita ANTES de adicionar; ao editar, "Salvar" só libera com pelo menos uma
 * opção. Perfil antigo sem o item não é alterado sozinho: o cartão avisa o que falta.
 */
export function EtapaAtividades({ perfil, aplicar, pendente, catalogo, aoMudarPendencias }: PropsEtapa & { catalogo: CatalogoServicos; aoMudarPendencias: (pendente: boolean) => void }) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [edicaoPendente, setEdicaoPendente] = useState(false);
  const [escolhendo, setEscolhendo] = useState(false);
  const [preparando, setPreparando] = useState<{ servico: ServicoCatalogo; opcoes: string[] } | null>(null);
  const disponiveis = atividadesParaAdicionar(catalogo, perfil.atividades);
  const doCatalogo = new Map(servicosDoCatalogo(catalogo).map((servico) => [servico.id, servico]));

  useEffect(() => aoMudarPendencias(edicaoPendente), [edicaoPendente, aoMudarPendencias]);

  async function adicionar(servico: ServicoCatalogo, opcaoIds: string[] = []) {
    if (atributosSemEscolha(servico, opcaoIds).length > 0) {
      setPreparando({ servico, opcoes: opcaoIds });
      return;
    }
    const atualizado = await aplicar(adicionarAtividade(servico.id, opcaoIds), { sucesso: `${servico.nome} adicionado`, chave: `adicionar-${servico.id}` });
    if (!atualizado) return;
    setPreparando(null);
    setEscolhendo(false);
    setEditandoId(atualizado.atividades.find((atividade) => atividade.atividadeId === servico.id)?.id ?? null);
  }

  const podeAdicionar = disponiveis.length > 0 && !edicaoPendente;

  return (
    <Secao titulo="Suas atividades" descricao={perfil.atividades.length >= 3 ? "Máximo de 3 atividades" : `${perfil.atividades.length} de 3`}>
      {disponiveis.length > 0 && !escolhendo && perfil.atividades.length > 0 && <Botao rotulo="Adicionar atividade" aparencia="secundario" disabled={!podeAdicionar} onPress={() => setEscolhendo(true)} />}

      {escolhendo && preparando && (
        <Cartao style={estilos.cartao}>
          <Texto variante="corpoForte">{preparando.servico.nome}</Texto>
          {preparando.servico.atributos
            .filter((atributo) => atributo.obrigatorio)
            .map((atributo) => (
              <GrupoEscolhas key={atributo.id} titulo={atributo.nome} dica="Escolha pelo menos uma opção.">
                {atributo.opcoes.map((opcao) => (
                  <Escolha
                    key={opcao.id}
                    papel={atributo.tipoSelecao === "unica" ? "radio" : "checkbox"}
                    marcada={preparando.opcoes.includes(opcao.id)}
                    rotulo={opcao.nome}
                    aoAlternar={() => setPreparando({ servico: preparando.servico, opcoes: alternarOpcao(preparando.opcoes, opcao.id, atributo) })}
                  />
                ))}
              </GrupoEscolhas>
            ))}
          <View style={estilos.acoes}>
            <Botao
              rotulo={`Adicionar ${preparando.servico.nome}`}
              carregando={pendente === `adicionar-${preparando.servico.id}`}
              textoCarregando="Adicionando…"
              disabled={pendente !== null || atributosSemEscolha(preparando.servico, preparando.opcoes).length > 0}
              onPress={() => void adicionar(preparando.servico, preparando.opcoes)}
            />
            <Botao rotulo="Voltar" aparencia="discreto" disabled={pendente !== null} onPress={() => setPreparando(null)} />
          </View>
        </Cartao>
      )}

      {escolhendo && !preparando && (
        <Cartao style={estilos.cartao}>
          <Texto cor="conteudoSuave">Escolha o que você oferece:</Texto>
          <View style={estilos.acoes}>
            {disponiveis.map((servico) => (
              <Botao key={servico.id} rotulo={servico.nome} aparencia="realce" carregando={pendente === `adicionar-${servico.id}`} textoCarregando="Adicionando…" disabled={pendente !== null} onPress={() => void adicionar(servico)} />
            ))}
            <Botao rotulo="Cancelar" aparencia="discreto" onPress={() => setEscolhendo(false)} />
          </View>
        </Cartao>
      )}

      {perfil.atividades.length === 0 && !escolhendo && <EstadoVazio titulo="Nenhuma atividade" descricao="Escolha o que você oferece." acao={<Botao rotulo="Adicionar atividade" centralizado onPress={() => setEscolhendo(true)} />} />}

      {perfil.atividades.map((atividade) =>
        editandoId === atividade.id ? (
          <EditorAtividade
            key={atividade.id}
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
          // Com outra atividade em edição e alterações não salvas, não se abre uma segunda.
          <CartaoAtividade key={atividade.id} atividade={atividade} servico={doCatalogo.get(atividade.atividadeId)} bloqueado={edicaoPendente} aoEditar={() => setEditandoId(atividade.id)} />
        ),
      )}
    </Secao>
  );
}

function CartaoAtividade({ atividade, servico, bloqueado, aoEditar }: { atividade: AtividadeDoPerfil; servico: ServicoCatalogo | undefined; bloqueado: boolean; aoEditar: () => void }) {
  const escolhas = resumoEscolhas(atividade, servico);
  // Perfil gravado antes de o item ser obrigatório: nada muda sozinho, a tela só avisa o que falta.
  const faltando = atributosSemEscolha(servico, atividade.opcaoIds);
  return (
    <Cartao style={estilos.cartao}>
      <View style={estilos.titulo}>
        <Texto variante="subtitulo" style={estilos.flex}>
          {atividade.nome}
        </Texto>
        {atividade.periodos.length === 0 && <Selo rotulo="Sem horários" tom="atencao" />}
      </View>
      {escolhas.length > 0 && <Texto>{escolhas.join(" · ")}</Texto>}
      {faltando.map((atributo) => (
        <Selo key={atributo.id} rotulo={`Falta escolher: ${atributo.nome}`} tom="atencao" />
      ))}
      <Texto cor="conteudoSuave">{resumoHorarios(atividade.periodos).join(" · ")}</Texto>
      {atividade.permiteAgendamento && <Selo rotulo="Agendamento ativo" tom="marca" />}
      <Botao rotulo="Editar" aparencia="secundario" compacto disabled={bloqueado} onPress={aoEditar} />
    </Cartao>
  );
}

const mesmoConjunto = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id) => b.includes(id));

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
  aplicar: Aplicar;
  pendente: string | null;
  aoMudarPendencia: (pendente: boolean) => void;
  aoConcluir: () => void;
}) {
  const [especialidades, setEspecialidades] = useState(atividade.especialidadeIds);
  const [opcoes, setOpcoes] = useState(atividade.opcaoIds);
  const [horariosAlterados, setHorariosAlterados] = useState(false);
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);
  const escolhasAlteradas = !mesmoConjunto(especialidades, atividade.especialidadeIds) || !mesmoConjunto(opcoes, atividade.opcaoIds);
  const faltando = atributosSemEscolha(servico, opcoes);
  const temEscolhas = Boolean(servico && (servico.especialidades.length > 0 || servico.atributos.length > 0));
  const haPendencia = escolhasAlteradas || horariosAlterados;
  const chaveEscolhas = `escolhas-${atividade.id}`;

  useEffect(() => aoMudarPendencia(haPendencia), [haPendencia, aoMudarPendencia]);

  return (
    <Cartao style={estilos.cartao}>
      <View style={estilos.titulo}>
        <Texto variante="subtitulo" style={estilos.flex}>
          {atividade.nome}
        </Texto>
        <Texto variante="pequeno" cor="conteudoSuave">
          Editando
        </Texto>
      </View>

      {temEscolhas && servico && (
        <>
          {servico.especialidades.length > 0 && (
            <GrupoEscolhas titulo="Especialidades">
              {servico.especialidades.map((especialidade) => (
                <Escolha key={especialidade.id} papel="checkbox" marcada={especialidades.includes(especialidade.id)} rotulo={especialidade.nome} aoAlternar={() => setEspecialidades((atual) => alternarId(atual, especialidade.id))} />
              ))}
            </GrupoEscolhas>
          )}
          {servico.atributos.map((atributo) => (
            <GrupoEscolhas key={atributo.id} titulo={atributo.nome} dica={atributo.obrigatorio ? "Escolha pelo menos uma opção." : undefined}>
              {atributo.opcoes.map((opcao) => (
                <Escolha
                  key={opcao.id}
                  papel={atributo.tipoSelecao === "unica" ? "radio" : "checkbox"}
                  marcada={opcoes.includes(opcao.id)}
                  rotulo={opcao.nome}
                  aoAlternar={() => setOpcoes((atual) => alternarOpcao(atual, opcao.id, atributo))}
                />
              ))}
            </GrupoEscolhas>
          ))}
          {faltando.length > 0 && (
            <Texto cor="aviso" accessibilityLiveRegion="polite">
              Escolha pelo menos uma opção em {faltando.map((atributo) => atributo.nome).join(", ")} para salvar. Sem isso você não aparece em buscas por essa opção.
            </Texto>
          )}
          {escolhasAlteradas && (
            <View style={estilos.acoes}>
              <Botao
                rotulo="Salvar"
                carregando={pendente === chaveEscolhas}
                textoCarregando="Salvando…"
                disabled={pendente !== null || faltando.length > 0}
                onPress={() => void aplicar(salvarEscolhasAtividade(atividade.id, { especialidadeIds: especialidades, opcaoIds: opcoes }), { sucesso: "Atividade salva", chave: chaveEscolhas })}
              />
              <Botao
                rotulo="Descartar"
                aparencia="discreto"
                disabled={pendente !== null}
                onPress={() => {
                  setEspecialidades(atividade.especialidadeIds);
                  setOpcoes(atividade.opcaoIds);
                }}
              />
            </View>
          )}
          <Divisoria />
        </>
      )}

      <EditorHorarios key={JSON.stringify(atividade.periodos)} atividade={atividade} aplicar={aplicar} pendente={pendente} aoMudarPendencia={setHorariosAlterados} />

      <Divisoria />
      <LinhaInterruptor
        rotulo="Permitir agendamento"
        descricao="Clientes poderão reservar horário."
        ligado={atividade.permiteAgendamento}
        desabilitado={pendente !== null}
        aoMudar={(ligado) => void aplicar(salvarPermiteAgendamento(atividade.id, ligado), { sucesso: ligado ? "Agendamento ativado" : "Agendamento desativado", chave: `agendamento-${atividade.id}` })}
      />

      <Divisoria />
      <Botao rotulo="Concluir" disabled={haPendencia || pendente !== null} onPress={aoConcluir} />
      {haPendencia && (
        <Texto variante="pequeno" cor="aviso">
          Salve ou descarte as alterações.
        </Texto>
      )}
      {confirmandoRemocao ? (
        <View style={estilos.acoes} accessibilityLabel={`Remover ${atividade.nome}`}>
          <Botao
            rotulo={`Remover ${atividade.nome}`}
            aparencia="perigo"
            carregando={pendente === `remover-${atividade.id}`}
            textoCarregando="Removendo…"
            disabled={pendente !== null}
            onPress={() => void aplicar(removerAtividade(atividade.id), { sucesso: `${atividade.nome} removido`, chave: `remover-${atividade.id}` })}
          />
          <Botao rotulo="Cancelar" aparencia="discreto" onPress={() => setConfirmandoRemocao(false)} />
        </View>
      ) : (
        <Botao rotulo="Remover atividade" aparencia="discreto" compacto onPress={() => setConfirmandoRemocao(true)} />
      )}
    </Cartao>
  );
}

/**
 * Horários DESTA atividade. Fechado: poucas linhas ("Seg–Sex · 08:00–18:00"). Em edição: um bloco por
 * dia, com a hora digitada como HH:MM (o fim aceita 24:00). Salvar só aparece quando há alteração.
 */
function EditorHorarios({ atividade, aplicar, pendente, aoMudarPendencia }: { atividade: AtividadeDoPerfil; aplicar: Aplicar; pendente: string | null; aoMudarPendencia: (pendente: boolean) => void }) {
  const [editando, setEditando] = useState(false);
  const [grade, setGrade] = useState<GradeSemanal>(() => gradeDosPeriodos(atividade.periodos));
  const alterado = JSON.stringify(periodosDaGrade(grade)) !== JSON.stringify(periodosDaGrade(gradeDosPeriodos(atividade.periodos)));
  const chave = `horarios-${atividade.id}`;

  useEffect(() => aoMudarPendencia(alterado), [alterado, aoMudarPendencia]);

  const mudarDia = (dia: number, faixas: FaixaHorario[]) => setGrade((atual) => ({ ...atual, [dia]: faixas }));

  async function salvar() {
    if (await aplicar(salvarHorarios(atividade.id, { periodos: periodosDaGrade(grade) }), { sucesso: "Horários salvos", chave })) setEditando(false);
  }

  if (!editando) {
    return (
      <View style={estilos.bloco}>
        <Texto variante="corpoForte">Horários</Texto>
        {resumoHorarios(atividade.periodos).map((linha) => (
          <Texto key={linha} cor="conteudoSuave">
            {linha}
          </Texto>
        ))}
        <Botao rotulo="Editar horários" aparencia="secundario" compacto disabled={pendente !== null} onPress={() => setEditando(true)} />
      </View>
    );
  }

  return (
    <View style={estilos.bloco}>
      <Texto variante="corpoForte">Horários</Texto>
      {DIAS.map(({ dia, rotulo }) => {
        const faixas = grade[dia] ?? [];
        const erro = erroDoDia(dia, faixas);
        const proxima = proximaFaixa(faixas);
        return (
          <View key={dia} style={estilos.dia}>
            <View style={estilos.cabecalhoDia}>
              <Switch value={faixas.length > 0} onValueChange={(ligado) => mudarDia(dia, ligado ? [FAIXA_PADRAO] : [])} trackColor={{ true: Cores.marca, false: Cores.borda }} thumbColor={Cores.superficie} accessibilityLabel={`Atende ${rotulo}`} />
              <Texto variante="corpoMedio" style={estilos.flex}>
                {rotulo}
              </Texto>
              {faixas.length === 0 && <Texto cor="conteudoSuave">Fechado</Texto>}
              {faixas.length > 0 && proxima && (
                <Pressable accessibilityRole="button" accessibilityLabel={`Adicionar horário em ${rotulo}`} hitSlop={6} onPress={() => mudarDia(dia, [...faixas, proxima])} style={estilos.botaoIcone}>
                  <Icone nome="mais" tamanho={20} cor="marca" />
                </Pressable>
              )}
            </View>
            {faixas.map((faixa, indice) => (
              <View key={indice} style={estilos.faixa}>
                <CampoHora rotulo={`${rotulo}, início do horário ${indice + 1}`} valor={faixa.inicio} comErro={erro !== null} aoMudar={(inicio) => mudarDia(dia, faixas.map((item, i) => (i === indice ? { ...item, inicio } : item)))} />
                <Texto cor="conteudoSuave">–</Texto>
                <CampoHora rotulo={`${rotulo}, fim do horário ${indice + 1}`} valor={faixa.fim} comErro={erro !== null} aoMudar={(fim) => mudarDia(dia, faixas.map((item, i) => (i === indice ? { ...item, fim } : item)))} />
                <Pressable accessibilityRole="button" accessibilityLabel={`Remover horário ${indice + 1} de ${rotulo}`} hitSlop={6} onPress={() => mudarDia(dia, faixas.filter((_, i) => i !== indice))} style={estilos.botaoIcone}>
                  <Icone nome="lixeira" tamanho={18} />
                </Pressable>
              </View>
            ))}
            {erro && (
              <Texto variante="pequeno" cor="perigo" accessibilityRole="alert">
                {erro}
              </Texto>
            )}
          </View>
        );
      })}
      <Texto variante="pequeno" cor="conteudoSuave">
        Digite a hora como 08:00. Vai até a meia-noite? Termine em 24:00 e continue no dia seguinte.
      </Texto>
      {alterado ? (
        <View style={estilos.acoes}>
          <Botao rotulo="Salvar horários" carregando={pendente === chave} textoCarregando="Salvando…" disabled={pendente !== null || gradeTemErro(grade)} onPress={() => void salvar()} />
          <Botao
            rotulo="Descartar"
            aparencia="discreto"
            disabled={pendente !== null}
            onPress={() => {
              setGrade(gradeDosPeriodos(atividade.periodos));
              setEditando(false);
            }}
          />
        </View>
      ) : (
        <View style={estilos.acoes}>
          <View style={estilos.salvo}>
            <Icone nome="check" tamanho={16} cor="marca" />
            <Texto cor="marca">Horários salvos</Texto>
          </View>
          <Botao rotulo="Fechar" aparencia="discreto" compacto onPress={() => setEditando(false)} />
        </View>
      )}
    </View>
  );
}

function CampoHora({ rotulo, valor, comErro, aoMudar }: { rotulo: string; valor: string; comErro: boolean; aoMudar: (valor: string) => void }) {
  return (
    <TextInput
      accessibilityLabel={rotulo}
      value={valor}
      keyboardType="number-pad"
      maxLength={5}
      placeholder="00:00"
      placeholderTextColor="#A2AAAB"
      onChangeText={(texto) => aoMudar(mascararHora(texto))}
      style={[estilos.hora, comErro && estilos.horaComErro]}
    />
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  cartao: { gap: Espaco.tres, padding: Espaco.quatro },
  titulo: { alignItems: "center", flexDirection: "row", gap: Espaco.dois },
  acoes: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois },
  bloco: { alignItems: "flex-start", gap: Espaco.dois },
  dia: { alignSelf: "stretch", borderTopColor: Cores.borda, borderTopWidth: StyleSheet.hairlineWidth, gap: Espaco.dois, paddingVertical: Espaco.dois },
  cabecalhoDia: { alignItems: "center", flexDirection: "row", gap: Espaco.tres, minHeight: ALTURA_TOQUE },
  faixa: { alignItems: "center", flexDirection: "row", gap: Espaco.dois },
  botaoIcone: { alignItems: "center", height: ALTURA_TOQUE, justifyContent: "center", width: ALTURA_TOQUE },
  hora: { backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, color: Cores.conteudo, fontSize: 16, minHeight: ALTURA_TOQUE, paddingHorizontal: Espaco.tres, textAlign: "center", width: 84 },
  horaComErro: { borderColor: Cores.perigo },
  salvo: { alignItems: "center", flexDirection: "row", gap: Espaco.um },
});
