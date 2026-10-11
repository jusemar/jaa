import { DIAS_SEMANA, ROTULO_DIA_SEMANA, type DiaSemana, type GrupoOpcoesProduto, type ProdutoPublico, type ProgramacaoSemanalGrupo } from "@jaa/contratos";
import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import { Alert, BackHandler, Pressable, StyleSheet, View } from "react-native";
import { Aviso, Carregando, Secao, Selo } from "@/components/ui/superficies";
import { Tela } from "@/components/ui/tela";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";
import { MontagemProduto } from "@/features/catalogo/components/montagem-produto";
import { consultarProgramacaoSemanal } from "../lib/api-personalizacao";
import { SIGLA_DIA, diaDeHojeNoAparelho } from "../lib/edicao-semana";
import { formatarPrecoCentavos } from "../lib/precos";
import { gruposDoClienteNoDia } from "../lib/previa-do-cliente";
import { TopoComVoltar } from "./pecas";

/*
 * PRÉVIA DO CARDÁPIO: como o cliente encontra ESTE produto num dia da semana — a mesma da Web.
 *
 * Não é simulação com dados inventados: usa o produto e os grupos reais e monta a escolha com o MESMO
 * componente do cardápio do cliente (`MontagemProduto`), com as mesmas regras de mínimo, máximo e
 * preço. A programação dos grupos semanais é lida só aqui, quando a prévia é aberta.
 *
 * Nada é pedido de verdade: "Adicionar" só confirma que a montagem está válida.
 */

export interface ProdutoDaPrevia {
  id: string;
  nome: string;
  descricao: string | null;
  precoCentavos: number;
  disponivel: boolean;
  imagemUrl: string | null;
}

export function PreviaDoCliente({ empresaId, produto, grupos, aoFechar }: { empresaId: string; produto: ProdutoDaPrevia; grupos: GrupoOpcoesProduto[]; aoFechar: () => void }) {
  const [dia, setDia] = useState<DiaSemana>(() => diaDeHojeNoAparelho());
  const [programacoes, setProgramacoes] = useState<Record<string, ProgramacaoSemanalGrupo> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const semanais = grupos
    .filter((grupo) => grupo.programacaoSemanal)
    .map((grupo) => grupo.id)
    .join(",");

  useEffect(() => {
    let atual = true;
    const ids = semanais === "" ? [] : semanais.split(",");
    void Promise.all(ids.map((grupoId) => consultarProgramacaoSemanal(empresaId, produto.id, grupoId))).then((respostas) => {
      if (!atual) return;
      const lidas: Record<string, ProgramacaoSemanalGrupo> = {};
      respostas.forEach((resposta, indice) => {
        const grupoId = ids[indice];
        if (resposta.ok && grupoId) lidas[grupoId] = resposta.dados;
      });
      if (respostas.some((resposta) => !resposta.ok)) setErro("Não foi possível ler a programação semanal. A prévia pode estar incompleta.");
      setProgramacoes(lidas);
    });
    return () => {
      atual = false;
    };
  }, [empresaId, produto.id, semanais]);

  // O "Voltar" do Android fecha a prévia e devolve o produto.
  useEffect(() => {
    const assinatura = BackHandler.addEventListener("hardwareBackPress", () => {
      aoFechar();
      return true;
    });
    return () => assinatura.remove();
  }, [aoFechar]);

  const doDia = useMemo(() => (programacoes ? gruposDoClienteNoDia(grupos, programacoes, dia) : []), [grupos, programacoes, dia]);
  const ocultos = programacoes ? grupos.filter((grupo) => !doDia.some((item) => item.id === grupo.id)) : [];

  const publico: ProdutoPublico = {
    id: produto.id,
    nome: produto.nome,
    descricao: produto.descricao,
    precoCentavos: produto.precoCentavos,
    disponibilidade: "disponivel",
    categoriaId: null,
    imagemUrl: produto.imagemUrl,
    personalizavel: doDia.length > 0,
  };

  return (
    <Tela>
      <TopoComVoltar rotulo="Voltar para o produto" aoVoltar={aoFechar} />
      <Secao titulo="Prévia do cardápio" descricao={`${ROTULO_DIA_SEMANA[dia]} · Opções disponíveis para o cliente`}>
        <View accessibilityRole="tablist" accessibilityLabel="Dia da semana" style={estilos.semana}>
          {DIAS_SEMANA.map((item) => {
            const marcado = item === dia;
            return (
              <Pressable key={item} accessibilityRole="tab" accessibilityLabel={ROTULO_DIA_SEMANA[item]} accessibilityState={{ selected: marcado }} onPress={() => setDia(item)} style={[estilos.dia, marcado && estilos.diaMarcado]}>
                <Texto variante="pequenoMedio" cor={marcado ? "marcaConteudo" : "conteudo"}>
                  {SIGLA_DIA[item]}
                </Texto>
              </Pressable>
            );
          })}
        </View>

        {produto.imagemUrl && <Image source={{ uri: produto.imagemUrl }} accessibilityLabel={produto.nome} contentFit="cover" style={estilos.imagem} />}

        <View style={estilos.resumo}>
          <View style={estilos.titulo}>
            <Texto variante="titulo">{produto.nome || "Nome do produto"}</Texto>
            {!produto.disponivel && <Selo rotulo="Indisponível" tom="atencao" />}
          </View>
          {produto.descricao && <Texto cor="conteudoSuave">{produto.descricao}</Texto>}
          <Texto variante="subtitulo">{formatarPrecoCentavos(produto.precoCentavos)}</Texto>
        </View>

        {!produto.disponivel && <Aviso tom="atencao">Produto indisponível: ele não aparece no cardápio do cliente enquanto estiver assim.</Aviso>}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {!programacoes && <Carregando texto="Carregando as opções do dia…" />}

        {programacoes &&
          (doDia.length > 0 ? (
            // `key`: trocar de dia recomeça a montagem (as opções mudam).
            <MontagemProduto key={dia} produto={publico} grupos={doDia} aoAdicionar={() => Alert.alert("Montagem válida", "É só uma prévia: nada foi adicionado.")} />
          ) : (
            <Texto cor="conteudoSuave">Neste dia o cliente adiciona o produto direto ao pedido, sem opções para escolher.</Texto>
          ))}

        {ocultos.length > 0 && (
          <Aviso>
            Não {ocultos.length === 1 ? "aparece" : "aparecem"} para o cliente neste dia: {ocultos.map((grupo) => grupo.nome).join(", ")} — sem opções disponíveis suficientes.
          </Aviso>
        )}
      </Secao>
    </Tela>
  );
}

const estilos = StyleSheet.create({
  semana: { flexDirection: "row", gap: Espaco.um },
  dia: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 40, minWidth: 0 },
  diaMarcado: { backgroundColor: Cores.marca, borderColor: Cores.marca },
  imagem: { aspectRatio: 2.4, borderRadius: Raio.bloco, width: "100%" },
  resumo: { gap: Espaco.um },
  titulo: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois },
});
