import {
  DESCRICAO_PRODUTO_TAMANHO_MAXIMO,
  DIAS_SEMANA,
  MAXIMO_GRUPOS_POR_PRODUTO,
  NOME_PRODUTO_TAMANHO_MAXIMO,
  ROTULO_DIA_SEMANA,
  grupoObrigatorio,
  type CategoriaProduto,
  type DisponibilidadeProduto,
  type GrupoOpcoesProduto,
  type Produto,
} from "@jaa/contratos";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Alert, BackHandler, Pressable, StyleSheet, Switch, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { CampoTexto } from "@/components/ui/campo-texto";
import { Icone } from "@/components/ui/icone";
import { MenuAcoes } from "@/components/ui/menu-acoes";
import { Aviso, Carregando, Cartao, Secao, Selo } from "@/components/ui/superficies";
import { Tela } from "@/components/ui/tela";
import { Texto } from "@/components/ui/texto";
import { ALTURA_TOQUE, Cores, Espaco, Raio } from "@/constants/theme";
import { ImagemProduto } from "@/features/catalogo/components/catalogo-apresentacao";
import { OPCOES_ANEXO, type OrigemImagem } from "@/features/conversas/lib/imagem-conversa";
import { listarGruposOpcoes, removerGrupoOpcoes } from "../lib/api-personalizacao";
import { resumoDoGrupo } from "../lib/edicao-semana";
import { centavosParaCampo, formatarPrecoCentavos, interpretarPrecoDigitado } from "../lib/precos";
import { descricaoDoRascunho, produtoAlterado } from "../lib/rascunho-do-produto";
import { regraEmPalavras } from "../lib/regra-do-grupo";
import { EditorDeGrupo } from "./editor-de-grupo";
import { BarraDeAcoes, CampoDeEscolha, FolhaDeEscolha, TopoComVoltar, mensagemDe } from "./pecas";
import { PreviaDoCliente } from "./previa-do-cliente";

/*
 * EDITAR PRODUTO — tela própria, separada da listagem; a mesma da Web (`formulario-produto.tsx`), em
 * uma coluna: informações, imagem, grupos de opções, "No cardápio do cliente" e, presa embaixo, a
 * barra com "Salvar produto".
 *
 * A imagem e os grupos de opções só existem para produto JÁ SALVO (ficam guardados sob o id dele): num
 * produto novo os dois blocos explicam isso em vez de sumir sem motivo.
 *
 * O editor de um grupo e a prévia abrem POR CIMA desta tela, que continua montada: o que foi digitado
 * no produto não se perde ao administrar um grupo.
 */

export type DadosFormularioProduto = {
  nome: string;
  descricao: string | null;
  precoCentavos: number;
  disponibilidade: DisponibilidadeProduto;
  categoriaId: string | null;
};

const SEM_CATEGORIA = "";

export function FormularioProduto({
  produto,
  categorias,
  enviando,
  empresaId,
  erro,
  recado,
  aoSalvar,
  aoCancelar,
  aoEnviarImagem,
  aoRemoverImagem,
}: {
  produto: Produto | null;
  categorias: CategoriaProduto[];
  enviando: boolean;
  empresaId: string;
  // Erro do servidor ao salvar o produto.
  erro: string | null;
  // "Produto salvo" / "Produto criado": some assim que algo é alterado de novo.
  recado: string | null;
  aoSalvar: (dados: DadosFormularioProduto) => void;
  // Sai da edição e volta ao catálogo.
  aoCancelar: () => void;
  aoEnviarImagem: (origem: OrigemImagem) => Promise<void>;
  aoRemoverImagem: () => Promise<void>;
}) {
  const [nome, setNome] = useState(produto?.nome ?? "");
  const [descricao, setDescricao] = useState(produto?.descricao ?? "");
  const [preco, setPreco] = useState(produto ? centavosParaCampo(produto.precoCentavos) : "");
  const [disponibilidade, setDisponibilidade] = useState<DisponibilidadeProduto>(produto?.disponibilidade ?? "disponivel");
  const [categoriaId, setCategoriaId] = useState(produto?.categoriaId ?? SEM_CATEGORIA);
  const [erroNome, setErroNome] = useState<string | null>(null);
  const [erroPreco, setErroPreco] = useState<string | null>(null);
  const [escolhendoCategoria, setEscolhendoCategoria] = useState(false);
  const [previa, setPrevia] = useState(false);

  // Grupos de opções (só de produto salvo). Toda operação devolve a lista completa do servidor.
  const produtoId = produto?.id ?? null;
  const [grupos, setGrupos] = useState<GrupoOpcoesProduto[] | null>(null);
  const [erroGrupos, setErroGrupos] = useState<string | null>(null);
  const [recadoGrupos, setRecadoGrupos] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  // Um editor por vez. `abertura` muda a cada abertura: o editor recomeça do zero, mas NÃO recomeça
  // quando o grupo novo ganha id no meio de um salvamento.
  const [aberto, setAberto] = useState<{ abertura: number; grupoId: string | null } | null>(null);
  const [menuDoGrupo, setMenuDoGrupo] = useState<GrupoOpcoesProduto | null>(null);

  useEffect(() => {
    if (!produtoId) return;
    let ativo = true;
    void listarGruposOpcoes(empresaId, produtoId).then((resultado) => {
      if (!ativo) return;
      if (resultado.ok) setGrupos(resultado.dados.grupos);
      else setErroGrupos(mensagemDe(resultado));
    });
    return () => {
      ativo = false;
    };
  }, [empresaId, produtoId]);

  const lista = grupos ?? [];
  const grupoAberto = aberto?.grupoId ? (lista.find((grupo) => grupo.id === aberto.grupoId) ?? null) : null;
  const editorAberto = aberto !== null && (aberto.grupoId === null || grupoAberto !== null);
  const coberto = editorAberto || previa;

  // O "Voltar" do Android sai do produto para a lista (com o editor ou a prévia abertos, é deles).
  useEffect(() => {
    if (coberto) return;
    const assinatura = BackHandler.addEventListener("hardwareBackPress", () => {
      aoCancelar();
      return true;
    });
    return () => assinatura.remove();
  }, [coberto, aoCancelar]);

  const precoCentavos = interpretarPrecoDigitado(preco);
  const alterado = produtoAlterado(produto, { nome, descricao, preco, disponibilidade, categoriaId });

  function enviar() {
    const semNome = nome.trim() === "";
    setErroNome(semNome ? "Informe o nome do produto." : null);
    setErroPreco(precoCentavos === null ? "Informe um preço válido maior que zero, ex.: 39,90." : null);
    if (semNome || precoCentavos === null) return;
    aoSalvar({ nome: nome.trim(), descricao: descricaoDoRascunho(descricao), precoCentavos, disponibilidade, categoriaId: categoriaId || null });
  }

  function pedirParaExcluir(grupo: GrupoOpcoesProduto) {
    if (!produtoId) return;
    Alert.alert("Excluir grupo de opções?", `“${grupo.nome}” e as opções dele serão removidos deste produto, incluindo a programação semanal. Pedidos já feitos não mudam.`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir grupo",
        style: "destructive",
        onPress: () => {
          setErroGrupos(null);
          setRecadoGrupos(null);
          setExcluindo(true);
          void removerGrupoOpcoes(empresaId, produtoId, grupo.id)
            .then((resultado) => {
              if (!resultado.ok) {
                setErroGrupos(mensagemDe(resultado));
                return;
              }
              setAberto(null);
              setGrupos(resultado.dados.grupos);
              setRecadoGrupos("Grupo excluído");
            })
            .finally(() => setExcluindo(false));
        },
      },
    ]);
  }

  const abrirGrupo = (grupoId: string | null) => {
    setRecadoGrupos(null);
    setErroGrupos(null);
    setAberto((atual) => ({ abertura: (atual?.abertura ?? 0) + 1, grupoId }));
  };

  const nomeDaCategoria = categoriaId === SEM_CATEGORIA ? "Sem categoria" : (categorias.find((categoria) => categoria.id === categoriaId)?.nome ?? produto?.categoriaNome ?? "Sem categoria");
  const semanais = lista.filter((grupo) => grupo.programacaoSemanal).length;
  const estado = produto === null ? "Produto ainda não criado" : alterado ? "Alterações ainda não salvas" : (recado ?? "Todas as alterações salvas");

  return (
    <View style={estilos.flex}>
      <View style={[estilos.flex, coberto && estilos.escondida]}>
        <Tela
          rodape={
            <BarraDeAcoes erro={erro} estado={estado} tom={produto !== null && alterado ? "pendente" : produto !== null ? "sucesso" : "neutro"}>
              <Botao rotulo="Cancelar" aparencia="secundario" onPress={aoCancelar} />
              <Botao rotulo={produto ? "Salvar produto" : "Criar produto"} carregando={enviando} textoCarregando="Salvando…" disabled={!alterado} onPress={enviar} />
            </BarraDeAcoes>
          }>
          <TopoComVoltar rotulo="Voltar para produtos" aoVoltar={aoCancelar} acao={produto ? <Botao rotulo="Prévia" aparencia="secundario" compacto onPress={() => setPrevia(true)} /> : undefined} />

          <Secao titulo={produto ? "Editar produto" : "Novo produto"} descricao="Detalhes e opções que fazem parte do seu produto.">
            <Cartao accessibilityLabel="Informações do produto" style={estilos.cartao}>
              <Texto variante="subtitulo">Informações do produto</Texto>
              <CampoTexto
                rotulo="Nome do produto"
                value={nome}
                maxLength={NOME_PRODUTO_TAMANHO_MAXIMO}
                placeholder="Nome do produto"
                erro={erroNome}
                onChangeText={(texto) => {
                  setNome(texto);
                  if (erroNome) setErroNome(null);
                }}
              />
              <CampoTexto
                rotulo="Descrição"
                value={descricao}
                maxLength={DESCRICAO_PRODUTO_TAMANHO_MAXIMO}
                multiline
                placeholder="Descreva seu produto"
                dica="Opcional. O que o cliente lê antes de fazer o pedido."
                onChangeText={setDescricao}
                style={estilos.descricao}
              />
              <CampoTexto
                rotulo="Preço base (R$)"
                value={preco}
                keyboardType="decimal-pad"
                placeholder="39,90"
                erro={erroPreco}
                onChangeText={(texto) => {
                  setPreco(texto);
                  if (erroPreco) setErroPreco(null);
                }}
              />
              <View style={estilos.linha}>
                <View style={estilos.flex}>
                  <Texto variante="corpoMedio">Disponibilidade</Texto>
                  <Texto variante="pequeno" cor="conteudoSuave">
                    {disponibilidade === "disponivel" ? "Disponível: aparece no cardápio do cliente." : "Indisponível: não aparece no cardápio do cliente."}
                  </Texto>
                </View>
                <Switch
                  value={disponibilidade === "disponivel"}
                  onValueChange={(ligado) => setDisponibilidade(ligado ? "disponivel" : "indisponivel")}
                  trackColor={{ true: Cores.marca, false: Cores.borda }}
                  thumbColor={Cores.superficie}
                  accessibilityLabel="Produto disponível"
                />
              </View>
              <CampoDeEscolha rotulo="Categoria" valor={nomeDaCategoria} dica="Organiza o catálogo. Não muda preço nem disponibilidade." aoAbrir={() => setEscolhendoCategoria(true)} />

              <View style={estilos.grupo}>
                <Texto variante="corpoMedio">Imagem do produto</Texto>
                <ImagemDoProduto produto={produto} aoEnviarImagem={aoEnviarImagem} aoRemoverImagem={aoRemoverImagem} />
              </View>
            </Cartao>
          </Secao>

          {/* Grupos de opções: como a imagem, só para produto JÁ SALVO — o grupo pertence a um produto. */}
          {produto ? (
            <Secao
              titulo="Grupos de opções"
              descricao={`Personalizações que o cliente pode escolher ao pedir.${grupos !== null && lista.length === 0 ? " Sem nenhum grupo, o produto é adicionado direto ao pedido." : ""}`}
              acoes={grupos !== null ? <Selo rotulo={lista.length === 1 ? "1 grupo" : `${lista.length} grupos`} /> : undefined}>
              {grupos === null && !erroGrupos && <Carregando texto="Carregando os grupos de opções…" />}

              {lista.map((grupo) => (
                <ItemDeGrupo key={grupo.id} grupo={grupo} ocupado={excluindo} aoAbrir={() => abrirGrupo(grupo.id)} aoAbrirMenu={() => setMenuDoGrupo(grupo)} />
              ))}

              {grupos !== null &&
                (lista.length < MAXIMO_GRUPOS_POR_PRODUTO ? (
                  <Pressable accessibilityRole="button" disabled={excluindo} onPress={() => abrirGrupo(null)} style={({ pressed }) => [estilos.novoGrupo, (pressed || excluindo) && estilos.apagado]}>
                    <Icone nome="mais" tamanho={18} cor="marca" />
                    <Texto variante="corpoMedio" cor="marca">
                      Adicionar grupo de opções
                    </Texto>
                  </Pressable>
                ) : (
                  <Aviso tom="atencao">Este produto já tem o máximo de {MAXIMO_GRUPOS_POR_PRODUTO} grupos de opções.</Aviso>
                ))}

              {recadoGrupos && (
                <View accessibilityLiveRegion="polite" style={estilos.recado}>
                  <Icone nome="check" tamanho={16} cor="marca" />
                  <Texto variante="corpoMedio" cor="marca">
                    {recadoGrupos}
                  </Texto>
                </View>
              )}
              {erroGrupos && <Aviso tom="erro">{erroGrupos}</Aviso>}
            </Secao>
          ) : (
            <Aviso>Os grupos de opções (tamanho, acompanhamentos…) são adicionados logo depois de criar o produto.</Aviso>
          )}

          {/* Como o produto aparece para quem compra — acompanha o que está sendo digitado. */}
          <View style={estilos.grupo}>
            <Texto variante="miniForte" cor="conteudoSuave" style={estilos.sobretitulo}>
              No cardápio do cliente
            </Texto>
            <Cartao style={estilos.cartaoDaPrevia}>
              {produto?.imagemUrl ? (
                <Image source={{ uri: produto.imagemUrl }} contentFit="cover" style={estilos.imagemDaPrevia} />
              ) : (
                <View style={[estilos.imagemDaPrevia, estilos.semImagem]}>
                  <Icone nome="imagem" tamanho={32} />
                </View>
              )}
              <View style={estilos.corpoDaPrevia}>
                <Selo rotulo={disponibilidade === "disponivel" ? "Disponível" : "Indisponível"} tom={disponibilidade === "disponivel" ? "marca" : "atencao"} />
                <Texto variante="titulo">{nome.trim() || "Nome do produto"}</Texto>
                <Texto cor="conteudoSuave">{descricao.trim() || "Descrição do produto"}</Texto>
                <Texto variante="titulo">{precoCentavos === null ? "R$ —" : formatarPrecoCentavos(precoCentavos)}</Texto>
                {lista.length > 0 && (
                  <View style={estilos.gruposDaPrevia}>
                    {lista.map((grupo) => (
                      <View key={grupo.id} style={estilos.linhaDaPrevia}>
                        <Texto style={estilos.flex}>{grupo.nome}</Texto>
                        <Texto cor="conteudoSuave">{grupoObrigatorio(grupo) ? "Obrigatório" : "Opcional"}</Texto>
                      </View>
                    ))}
                  </View>
                )}
                {produto && <Botao rotulo="Ver como cliente" aparencia="secundario" larguraTotal onPress={() => setPrevia(true)} />}
              </View>
            </Cartao>
          </View>

          {produto && (
            <View style={estilos.grupo}>
              <View style={estilos.recado}>
                <Icone nome="calendario" tamanho={16} cor="marca" />
                <Texto variante="corpoMedio">Um produto, diferentes dias</Texto>
              </View>
              <Texto variante="pequeno" cor="conteudoSuave">
                {semanais === 0 ? "Nenhum grupo com programação semanal: as opções são as mesmas todos os dias." : semanais === 1 ? "1 grupo com programação semanal." : `${semanais} grupos com programação semanal.`}
              </Texto>
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={estilos.dias}>
                {DIAS_SEMANA.map((dia) => (
                  <View key={dia} style={estilos.dia}>
                    <Texto variante="miniForte" cor="marcaSuaveConteudo">
                      {ROTULO_DIA_SEMANA[dia].slice(0, 1)}
                    </Texto>
                  </View>
                ))}
              </View>
            </View>
          )}

        </Tela>
      </View>

      {produto && aberto && editorAberto && (
        <EditorDeGrupo
          key={aberto.abertura}
          empresaId={empresaId}
          produtoId={produto.id}
          grupo={grupoAberto}
          idsDosGrupos={lista.map((grupo) => grupo.id)}
          aoFechar={() => setAberto(null)}
          aoGrupos={setGrupos}
          aoCriado={(grupoId) => setAberto((atual) => (atual ? { ...atual, grupoId } : atual))}
          aoMudarAtivacao={(grupoId, ativa) => setGrupos((atuais) => atuais?.map((item) => (item.id === grupoId ? { ...item, programacaoSemanal: ativa } : item)) ?? null)}
          aoPedirExcluir={pedirParaExcluir}
          aoAvisar={setRecadoGrupos}
        />
      )}

      {produto && previa && (
        <PreviaDoCliente
          empresaId={empresaId}
          produto={{ id: produto.id, nome: nome.trim(), descricao: descricao.trim() === "" ? null : descricao, precoCentavos: precoCentavos ?? produto.precoCentavos, disponivel: disponibilidade === "disponivel", imagemUrl: produto.imagemUrl }}
          grupos={lista}
          aoFechar={() => setPrevia(false)}
        />
      )}

      <FolhaDeEscolha
        titulo="Categoria"
        aberta={escolhendoCategoria}
        atual={categoriaId}
        itens={[{ id: SEM_CATEGORIA, rotulo: "Sem categoria" }, ...categorias.map((categoria) => ({ id: categoria.id, rotulo: categoria.nome }))]}
        aoEscolher={setCategoriaId}
        aoFechar={() => setEscolhendoCategoria(false)}
      />

      <MenuAcoes
        titulo={menuDoGrupo?.nome}
        aberto={menuDoGrupo !== null}
        aoFechar={() => setMenuDoGrupo(null)}
        acoes={
          menuDoGrupo
            ? [
                { rotulo: "Editar grupo", icone: "lapis", executar: () => abrirGrupo(menuDoGrupo.id) },
                { rotulo: "Excluir grupo", icone: "lixeira", perigosa: true, executar: () => pedirParaExcluir(menuDoGrupo) },
              ]
            : []
        }
      />
    </View>
  );
}

/**
 * Um CARTÃO por grupo: nome, regra, quantas opções, se é semanal, se há problema — tudo da lista de
 * grupos já carregada. O cartão abre a edição; o menu ⋮ guarda o que apaga.
 */
function ItemDeGrupo({ grupo, ocupado, aoAbrir, aoAbrirMenu }: { grupo: GrupoOpcoesProduto; ocupado: boolean; aoAbrir: () => void; aoAbrirMenu: () => void }) {
  const resumo = resumoDoGrupo(grupo);
  return (
    <Cartao style={estilos.itemDeGrupo}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Editar ${grupo.nome}`} onPress={aoAbrir} style={({ pressed }) => [estilos.abrirGrupo, pressed && estilos.apagado]}>
        <View style={estilos.textoDoGrupo}>
          <Texto variante="corpoForte">{grupo.nome}</Texto>
          <Texto variante="pequeno" cor="conteudoSuave">
            {regraEmPalavras(grupo)}
          </Texto>
          <View style={estilos.selosDoGrupo}>
            <Texto variante="mini" cor="conteudoSuave">
              {resumo.total === 1 ? "1 opção" : `${resumo.total} opções`}
            </Texto>
            {resumo.semanal && <Selo rotulo="Semanal" tom="marca" />}
            {resumo.indisponiveis > 0 && !resumo.problema && <Selo rotulo={resumo.indisponiveis === 1 ? "1 indisponível" : `${resumo.indisponiveis} indisponíveis`} />}
            {resumo.problema && <Selo rotulo={resumo.problema} tom="atencao" />}
          </View>
        </View>
        <Icone nome="seta" tamanho={18} />
      </Pressable>
      <BotaoSemBorda rotulo={`Ações de ${grupo.nome}`} desabilitado={ocupado} aoTocar={aoAbrirMenu} />
    </Cartao>
  );
}

function BotaoSemBorda({ rotulo, desabilitado, aoTocar }: { rotulo: string; desabilitado: boolean; aoTocar: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={rotulo} disabled={desabilitado} hitSlop={4} onPress={aoTocar} style={({ pressed }) => [estilos.menu, (pressed || desabilitado) && estilos.apagado]}>
      <Icone nome="maisAcoes" tamanho={20} />
    </Pressable>
  );
}

function ImagemDoProduto({ produto, aoEnviarImagem, aoRemoverImagem }: { produto: Produto | null; aoEnviarImagem: (origem: OrigemImagem) => Promise<void>; aoRemoverImagem: () => Promise<void> }) {
  const [ocupado, setOcupado] = useState<"enviando" | "removendo" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [escolhendo, setEscolhendo] = useState(false);

  if (!produto) {
    return <Aviso>A foto é adicionada logo depois de criar o produto: toque em “Criar produto” e esta área libera o envio da imagem.</Aviso>;
  }

  async function executar(acao: () => Promise<void>, tipo: "enviando" | "removendo") {
    setOcupado(tipo);
    setErro(null);
    try {
      await acao();
    } catch (falha) {
      // A mensagem vem do servidor (arquivo grande, tipo inválido, limite de envios, storage fora do ar).
      setErro(falha instanceof Error && falha.message ? falha.message : "Não foi possível alterar a imagem.");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <View style={estilos.imagem}>
      <ImagemProduto url={produto.imagemUrl} nome="" lado={64} />
      <View style={estilos.textoDoItem}>
        <View style={estilos.acoesDaImagem}>
          <Botao rotulo={produto.imagemUrl ? "Alterar imagem" : "Adicionar imagem"} aparencia="secundario" compacto carregando={ocupado === "enviando"} textoCarregando="Enviando…" disabled={ocupado !== null} onPress={() => setEscolhendo(true)} />
          {produto.imagemUrl && <Botao rotulo="Remover" aparencia="discreto" compacto carregando={ocupado === "removendo"} textoCarregando="Removendo…" disabled={ocupado !== null} onPress={() => void executar(aoRemoverImagem, "removendo")} />}
        </View>
        <Texto variante="pequeno" cor="conteudoSuave">
          Da galeria ou da câmera. Até 8 MB.
        </Texto>
        {erro && (
          <Texto variante="pequeno" cor="perigo" accessibilityRole="alert">
            {erro}
          </Texto>
        )}
      </View>
      <MenuAcoes
        titulo="Imagem do produto"
        aberto={escolhendo}
        aoFechar={() => setEscolhendo(false)}
        acoes={OPCOES_ANEXO.map((opcao) => ({ rotulo: opcao.rotulo, icone: opcao.icone, executar: () => void executar(() => aoEnviarImagem(opcao.origem), "enviando") }))}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  escondida: { display: "none" },
  apagado: { opacity: 0.5 },
  cartao: { gap: Espaco.quatro, padding: Espaco.quatro },
  grupo: { gap: Espaco.dois },
  descricao: { minHeight: 88, paddingVertical: Espaco.dois, textAlignVertical: "top" },
  linha: { alignItems: "center", flexDirection: "row", gap: Espaco.tres, minHeight: ALTURA_TOQUE },
  imagem: { alignItems: "center", borderColor: Cores.borda, borderRadius: Raio.compacto, borderStyle: "dashed", borderWidth: 1, flexDirection: "row", gap: Espaco.tres, padding: Espaco.tres },
  textoDoItem: { flex: 1, gap: Espaco.um, minWidth: 0 },
  acoesDaImagem: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois },
  itemDeGrupo: { alignItems: "center", flexDirection: "row", paddingLeft: Espaco.tres },
  abrirGrupo: { alignItems: "center", flex: 1, flexDirection: "row", gap: Espaco.tres, minHeight: 64, minWidth: 0, paddingVertical: Espaco.tres },
  textoDoGrupo: { flex: 1, gap: Espaco.um, minWidth: 0 },
  selosDoGrupo: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois },
  menu: { alignItems: "center", height: ALTURA_TOQUE, justifyContent: "center", width: 40 },
  novoGrupo: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.bloco, borderStyle: "dashed", borderWidth: 1, flexDirection: "row", gap: Espaco.dois, justifyContent: "center", minHeight: 48, paddingHorizontal: Espaco.quatro },
  recado: { alignItems: "center", flexDirection: "row", gap: Espaco.dois },
  sobretitulo: { letterSpacing: 0.4, textTransform: "uppercase" },
  cartaoDaPrevia: { overflow: "hidden" },
  imagemDaPrevia: { aspectRatio: 1.8, width: "100%" },
  semImagem: { alignItems: "center", backgroundColor: Cores.superficieSuave, justifyContent: "center" },
  corpoDaPrevia: { gap: Espaco.dois, padding: Espaco.quatro },
  gruposDaPrevia: { borderTopColor: Cores.borda, borderTopWidth: StyleSheet.hairlineWidth, gap: Espaco.dois, paddingTop: Espaco.tres },
  linhaDaPrevia: { flexDirection: "row", gap: Espaco.tres, justifyContent: "space-between" },
  dias: { flexDirection: "row", justifyContent: "space-between" },
  dia: { alignItems: "center", backgroundColor: Cores.marcaSuave, borderRadius: Raio.total, height: 28, justifyContent: "center", width: 28 },
});
