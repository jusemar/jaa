import { DIAS_SEMANA, MAXIMO_PERIODOS_POR_DIA, ROTULO_DIA_SEMANA, type DiaSemana, type FuncionamentoEmpresa } from "@jaa/contratos";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, TextInput, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { Icone } from "@/components/ui/icone";
import { MenuAcoes } from "@/components/ui/menu-acoes";
import { Aviso, Carregando, Cartao, Secao } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { ALTURA_TOQUE, Cores, Espaco, Raio } from "@/constants/theme";
import { mascararHora } from "@/features/profissional/lib/apresentacao-perfil-profissional";
import { consultarFuncionamento, salvarFuncionamento } from "../lib/api-funcionamento";
import {
  adicionarPeriodo,
  copiarParaTodosOsDias,
  fechaNoDiaSeguinte,
  fecharDia,
  funcionamentoAlterado,
  mudarPeriodo,
  rascunhoDoFuncionamento,
  removerPeriodo,
  validarRascunho,
  type RascunhoDoFuncionamento,
} from "../lib/rascunho-funcionamento";

/*
 * HORÁRIOS DE FUNCIONAMENTO — quando a empresa RECEBE PEDIDOS. A mesma área da Web
 * (`horarios-de-funcionamento.tsx`), com as mesmas rotas e as mesmas regras de rascunho.
 *
 * Uma chave decide se a empresa controla horário (desligada, recebe pedidos a qualquer hora). Ligada,
 * cada dia está aberto com um ou mais períodos, ou fechado. Tudo fica em rascunho até "Salvar
 * horários"; o servidor valida de novo e devolve o estado de AGORA, o mesmo que o cliente vê no cardápio.
 */
export function HorariosDeFuncionamento({ empresaId }: { empresaId: string }) {
  const [salvo, setSalvo] = useState<FuncionamentoEmpresa | null>(null);
  const [rascunho, setRascunho] = useState<RascunhoDoFuncionamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [acabouDeSalvar, setAcabouDeSalvar] = useState(false);

  useEffect(() => {
    let ativo = true;
    void consultarFuncionamento(empresaId).then((resultado) => {
      if (!ativo) return;
      if (!resultado.ok) {
        setErro(resultado.status === 0 ? "Sem conexão. Tente de novo." : resultado.mensagem);
        return;
      }
      setSalvo(resultado.dados);
      setRascunho(rascunhoDoFuncionamento(resultado.dados.ativo, resultado.dados.periodos));
    });
    return () => {
      ativo = false;
    };
  }, [empresaId]);

  function mudar(novo: RascunhoDoFuncionamento) {
    setErro(null);
    setAcabouDeSalvar(false);
    setRascunho(novo);
  }

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
        setErro(resultado.status === 0 ? "Sem conexão. Tente de novo." : resultado.mensagem);
        return;
      }
      setSalvo(resultado.dados);
      setRascunho(rascunhoDoFuncionamento(resultado.dados.ativo, resultado.dados.periodos));
      setAcabouDeSalvar(true);
    } finally {
      setSalvando(false);
    }
  }

  const alterado = salvo !== null && rascunho !== null && funcionamentoAlterado(salvo, rascunho);

  return (
    <Secao titulo="Horários de funcionamento" descricao="Quando a empresa recebe pedidos. Fora do horário o cliente continua vendo o cardápio, mas não consegue pedir.">
      {!rascunho && !erro && <Carregando texto="Carregando os horários…" />}

      {rascunho && salvo && (
        <Cartao>
          <View style={estilos.bloco}>
            <View style={estilos.linha}>
              <View style={estilos.flex}>
                <Texto variante="corpoMedio">Controlar horário de funcionamento</Texto>
                <Texto variante="pequeno" cor="conteudoSuave">
                  {rascunho.ativo ? "Pedidos só são aceitos nos horários abaixo." : "Desligado: a empresa recebe pedidos a qualquer dia e hora."}
                </Texto>
              </View>
              <Switch
                value={rascunho.ativo}
                disabled={salvando}
                onValueChange={(ativo) => mudar({ ...rascunho, ativo })}
                trackColor={{ true: Cores.marca, false: Cores.borda }}
                thumbColor={Cores.superficie}
                accessibilityLabel="Controlar horário de funcionamento"
              />
            </View>
            {/* O estado de AGORA vem do servidor (fuso da empresa) e vale para o que está SALVO. */}
            {salvo.estado.resumo && !alterado && (
              <View style={estilos.estado}>
                <View style={[estilos.ponto, { backgroundColor: salvo.estado.abertoAgora ? Cores.marca : Cores.aviso }]} />
                <Texto variante="pequeno" cor={salvo.estado.abertoAgora ? "marca" : "aviso"}>
                  {salvo.estado.resumo}
                </Texto>
              </View>
            )}
          </View>

          {rascunho.ativo && DIAS_SEMANA.map((dia) => <DiaDaSemana key={dia} dia={dia} hoje={dia === salvo.hoje} rascunho={rascunho} ocupado={salvando} aoMudar={mudar} />)}

          {rascunho.ativo && (
            <View style={[estilos.bloco, estilos.comDivisa]}>
              <Texto variante="pequeno" cor="conteudoSuave">
                Digite a hora como 08:00. Horários no fuso da empresa ({salvo.fusoHorario.replace(/_/g, " ")}). Se o fechamento for mais cedo que a abertura (18:00 às 02:00), o período termina no dia seguinte.
              </Texto>
            </View>
          )}

          <View style={[estilos.bloco, estilos.comDivisa]}>
            <View accessibilityLiveRegion="polite" style={estilos.estado}>
              {!alterado && acabouDeSalvar && <Icone nome="check" tamanho={16} cor="marca" />}
              <Texto variante="pequeno" cor={alterado ? "aviso" : acabouDeSalvar ? "marca" : "conteudoSuave"}>
                {alterado ? "Alterações ainda não salvas" : acabouDeSalvar ? "Horários salvos" : "Todas as alterações salvas"}
              </Texto>
            </View>
            {erro && <Aviso tom="erro">{erro}</Aviso>}
            <View style={estilos.acoes}>
              <Botao
                rotulo="Descartar"
                aparencia="secundario"
                disabled={!alterado || salvando}
                onPress={() => {
                  setErro(null);
                  setRascunho(rascunhoDoFuncionamento(salvo.ativo, salvo.periodos));
                }}
              />
              <Botao rotulo="Salvar horários" carregando={salvando} textoCarregando="Salvando…" disabled={!alterado || salvando} onPress={() => void salvar()} />
            </View>
          </View>
        </Cartao>
      )}

      {erro && !rascunho && <Aviso tom="erro">{erro}</Aviso>}
    </Secao>
  );
}

function DiaDaSemana({ dia, hoje, rascunho, ocupado, aoMudar }: { dia: DiaSemana; hoje: boolean; rascunho: RascunhoDoFuncionamento; ocupado: boolean; aoMudar: (rascunho: RascunhoDoFuncionamento) => void }) {
  const [menuAberto, setMenuAberto] = useState(false);
  const periodos = rascunho.semana[dia];
  const aberto = periodos.length > 0;
  const nome = ROTULO_DIA_SEMANA[dia];

  return (
    <View style={[estilos.bloco, estilos.comDivisa]}>
      <View style={estilos.linha}>
        <Switch
          value={aberto}
          disabled={ocupado}
          onValueChange={(ligar) => aoMudar(ligar ? adicionarPeriodo(rascunho, dia) : fecharDia(rascunho, dia))}
          trackColor={{ true: Cores.marca, false: Cores.borda }}
          thumbColor={Cores.superficie}
          accessibilityLabel={`${nome}: aberto`}
        />
        <View style={[estilos.flex, estilos.nomeDoDia]}>
          <Texto variante="corpoMedio">{nome}</Texto>
          {hoje && (
            <Texto variante="pequeno" cor="conteudoSuave">
              hoje
            </Texto>
          )}
        </View>
        {!aberto && <Texto cor="conteudoSuave">Fechado</Texto>}
        {aberto && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Mais ações de ${nome}`} disabled={ocupado} hitSlop={6} onPress={() => setMenuAberto(true)} style={({ pressed }) => [estilos.botaoIcone, (pressed || ocupado) && estilos.apagado]}>
            <Icone nome="maisAcoes" tamanho={20} />
          </Pressable>
        )}
      </View>

      {periodos.map((periodo, indice) => (
        <View key={periodo.chave} style={estilos.periodo}>
          <View style={estilos.linha}>
            <CampoHora rotulo={`${nome}, período ${indice + 1}: abre às`} valor={periodo.inicio} desabilitado={ocupado} aoMudar={(inicio) => aoMudar(mudarPeriodo(rascunho, dia, periodo.chave, { inicio }))} />
            <Texto variante="pequeno" cor="conteudoSuave">
              às
            </Texto>
            <CampoHora rotulo={`${nome}, período ${indice + 1}: fecha às`} valor={periodo.fim} desabilitado={ocupado} aoMudar={(fim) => aoMudar(mudarPeriodo(rascunho, dia, periodo.chave, { fim }))} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remover o período ${indice + 1} de ${nome}`}
              disabled={ocupado}
              hitSlop={6}
              onPress={() => aoMudar(removerPeriodo(rascunho, dia, periodo.chave))}
              style={({ pressed }) => [estilos.botaoIcone, (pressed || ocupado) && estilos.apagado]}>
              <Icone nome="lixeira" tamanho={18} />
            </Pressable>
          </View>
          {fechaNoDiaSeguinte(periodo) && (
            <Texto variante="pequeno" cor="conteudoSuave">
              Fecha no dia seguinte, às {periodo.fim}.
            </Texto>
          )}
        </View>
      ))}

      {aberto && periodos.length < MAXIMO_PERIODOS_POR_DIA && <Botao rotulo="Adicionar período" aparencia="discreto" compacto disabled={ocupado} onPress={() => aoMudar(adicionarPeriodo(rascunho, dia))} />}

      <MenuAcoes titulo={nome} aberto={menuAberto} aoFechar={() => setMenuAberto(false)} acoes={[{ rotulo: "Copiar para todos os dias", executar: () => aoMudar(copiarParaTodosOsDias(rascunho, dia)) }]} />
    </View>
  );
}

function CampoHora({ rotulo, valor, desabilitado, aoMudar }: { rotulo: string; valor: string; desabilitado: boolean; aoMudar: (valor: string) => void }) {
  return (
    <TextInput
      accessibilityLabel={rotulo}
      value={valor}
      editable={!desabilitado}
      keyboardType="number-pad"
      maxLength={5}
      placeholder="00:00"
      placeholderTextColor="#A2AAAB"
      onChangeText={(texto) => aoMudar(mascararHora(texto))}
      style={[estilos.hora, desabilitado && estilos.apagado]}
    />
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  bloco: { gap: Espaco.dois, padding: Espaco.quatro },
  comDivisa: { borderTopColor: Cores.borda, borderTopWidth: StyleSheet.hairlineWidth },
  linha: { alignItems: "center", flexDirection: "row", gap: Espaco.tres, minHeight: ALTURA_TOQUE },
  nomeDoDia: { alignItems: "baseline", flexDirection: "row", gap: Espaco.dois },
  estado: { alignItems: "center", flexDirection: "row", gap: Espaco.dois },
  ponto: { borderRadius: Raio.total, height: 8, width: 8 },
  periodo: { gap: Espaco.um },
  acoes: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois },
  botaoIcone: { alignItems: "center", height: ALTURA_TOQUE, justifyContent: "center", width: ALTURA_TOQUE },
  hora: { backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, color: Cores.conteudo, flex: 1, fontSize: 16, minHeight: ALTURA_TOQUE, paddingHorizontal: Espaco.tres, textAlign: "center" },
  apagado: { opacity: 0.5 },
});
