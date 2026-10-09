import type { CapacidadeConta } from "@jaa/contratos";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { Cartao } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco } from "@/constants/theme";
import { URL_API } from "@/lib/configuracao";
import { useContextoConta } from "./provedor-contexto-conta";

/*
 * TEMPORÁRIO — DIAGNÓSTICO de desenvolvimento, não é UX do Jaa. Mostra o que `GET /conta/contexto`
 * devolveu, já interpretado pelo app (capacidades conhecidas, papéis), para conferir no aparelho.
 * Remover quando o contexto passar a guiar a navegação de verdade.
 */

function textoResumo(capacidade: CapacidadeConta): string {
  switch (capacidade.tipo) {
    case "entregador_empresa":
      return `vínculos ativos: ${capacidade.resumo.vinculosAtivos} · convites pendentes: ${capacidade.resumo.convitesPendentes}`;
    case "perfil_profissional":
      return capacidade.resumo.pendencias.length > 0 ? `pendências: ${capacidade.resumo.pendencias.join(", ")}` : "sem pendências";
  }
}

export function DiagnosticoContexto() {
  const { contexto, carregando, semSessao, erro, carregadoEm, recarregar } = useContextoConta();

  const situacao = carregando ? "carregando…" : semSessao ? "sem sessão" : erro ? "erro" : contexto ? "carregado" : "—";

  return (
    <ScrollView contentContainerStyle={estilos.container}>
      <View style={estilos.aviso}>
        <Texto variante="corpoForte">Diagnóstico do contexto</Texto>
        <Texto variante="pequeno">Tela temporária de desenvolvimento — não é a interface do Jaaa.</Texto>
        {/* O endereço da API só aparece aqui: nunca na entrada nem nas telas comuns. */}
        <Texto variante="pequeno">Servidor: {URL_API}</Texto>
      </View>

      <Linha rotulo="Situação" valor={situacao} />
      <Linha rotulo="Última resposta" valor={carregadoEm ? carregadoEm.toLocaleTimeString("pt-BR") : "—"} />
      {erro && <Linha rotulo="Erro" valor={erro} />}
      {semSessao && <Texto variante="pequeno">Sem sessão neste aparelho.</Texto>}

      <Botao aparencia="secundario" rotulo="Recarregar contexto" carregando={carregando} onPress={() => void recarregar()} />

      {contexto && (
        <>
          <Secao titulo="Conta">
            <Linha rotulo="Versão do contexto" valor={String(contexto.versao)} />
            <Linha rotulo="Cadastro completo" valor={contexto.conta.cadastroCompleto ? "sim" : "não"} />
            <Linha
              rotulo="Identidade pessoal"
              valor={contexto.identidadePessoal ? `${contexto.identidadePessoal.nomeExibicao} (@${contexto.identidadePessoal.nomeUsuario})` : "—"}
            />
          </Secao>

          <Secao titulo={`Identidades operáveis (${contexto.identidadesOperaveis.length})`}>
            {contexto.empresasOperaveis.length === 0 && <Texto variante="pequeno">Nenhuma empresa operável.</Texto>}
            {contexto.empresasOperaveis.map((empresa) => (
              <Texto key={empresa.identidadeId} variante="pequeno">
                Empresa: {empresa.nomeExibicao} (@{empresa.nomeUsuario}) · papel: {empresa.papel}
                {empresa.papelConhecido === null ? " (desconhecido nesta versão)" : ""}
              </Texto>
            ))}
          </Secao>

          <Secao titulo={`Capacidades (${contexto.capacidades.length})`}>
            {contexto.capacidades.length === 0 && <Texto variante="pequeno">Nenhuma capacidade.</Texto>}
            {contexto.capacidades.map((capacidade) => (
              <View key={capacidade.tipo} style={estilos.capacidade}>
                <Texto variante="corpoForte">
                  {capacidade.tipo} — {capacidade.estado}
                </Texto>
                <Texto variante="pequeno">{textoResumo(capacidade)}</Texto>
              </View>
            ))}
            {contexto.capacidadesIgnoradas > 0 && (
              <Texto variante="pequeno">Ignoradas (desconhecidas nesta versão): {contexto.capacidadesIgnoradas}</Texto>
            )}
          </Secao>
        </>
      )}
    </ScrollView>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Cartao style={estilos.secao}>
      <Texto variante="corpoForte">{titulo}</Texto>
      {children}
    </Cartao>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <Texto variante="pequeno">
      {rotulo}: {valor}
    </Texto>
  );
}

const estilos = StyleSheet.create({
  container: { backgroundColor: Cores.fundo, gap: Espaco.tres, padding: Espaco.quatro, paddingBottom: Espaco.seis * 2 },
  aviso: { backgroundColor: Cores.ouroSuave, borderColor: Cores.ouro, borderRadius: 8, borderWidth: 1, gap: Espaco.meio, padding: Espaco.tres },
  secao: { gap: Espaco.um },
  capacidade: { gap: Espaco.meio, paddingVertical: Espaco.um },
});
