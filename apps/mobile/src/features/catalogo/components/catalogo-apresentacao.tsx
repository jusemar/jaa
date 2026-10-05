import { QUANTIDADE_MAXIMA_POR_ITEM, type EmpresaPublica, type FuncionamentoPublico, type GrupoOpcoesPublico, type ProdutoPublico } from "@jaa/contratos";
import { Image } from "expo-image";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Icone } from "@/components/ui/icone";
import { Cartao } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";
import { filtrarProdutos, secaoAtiva, type SecaoCardapio } from "../lib/cardapio";
import { acaoOuExplicacao, type BloqueioDePedido } from "../lib/funcionamento";
import { FuncionamentoDaEmpresa } from "./funcionamento-da-empresa";
import { MontagemProduto, Quantidade } from "./montagem-produto";

/*
 * CARDÁPIO do cliente dentro da conversa: busca, categorias da empresa e cards de produto — como na Web.
 *
 * Categorias, nomes, imagens e preços são TODOS da empresa. Quando a empresa não cadastrou categoria
 * nenhuma, os chips simplesmente não aparecem e o cardápio é uma lista só.
 *
 * Esta camada apenas apresenta: quem adiciona ao carrinho é a conversa, e o pedido é sempre
 * recalculado pelo servidor.
 */
export function Cardapio({
  empresa,
  secoes,
  secaoEscolhidaId,
  aoEscolherSecao,
  montagem,
  aoVer,
  aoAdicionar,
  aoFechar,
  funcionamento,
  bloqueio,
}: {
  empresa: EmpresaPublica;
  // Aberta ou fechada agora + a semana, como o servidor informou. Ausente enquanto não se sabe.
  funcionamento?: FuncionamentoPublico | undefined;
  // Empresa fechada: as ações de pedir ficam com cara de indisponíveis e explicam ao toque.
  bloqueio?: BloqueioDePedido | undefined;
  // Seções já montadas e ORDENADAS por quem cuida dos dados. Aqui é só apresentação: uma seção por vez.
  secoes: SecaoCardapio[];
  // null = ninguém escolheu ainda; a seção inicial é derivada, não gravada.
  secaoEscolhidaId: string | null;
  aoEscolherSecao: (secaoId: string) => void;
  // Montagem da seção atual: quando existe, ela substitui a lista de produtos (a seção É o montador).
  montagem?: { produto: ProdutoPublico; grupos: GrupoOpcoesPublico[]; chave: number } | undefined;
  aoVer: (produto: ProdutoPublico) => void;
  // Ausente quando quem olha é a própria empresa (não faz pedido de si mesma).
  aoAdicionar?: ((produto: ProdutoPublico, quantidade: number, opcaoIds: string[], observacao: string | null) => void) | undefined;
  aoFechar?: (() => void) | undefined;
}) {
  const [busca, setBusca] = useState("");
  const ativa = secaoAtiva(secoes, secaoEscolhidaId);
  // A busca filtra DENTRO da seção aberta; os chips seguem contando o total da categoria.
  const encontrados = useMemo(() => filtrarProdutos(ativa?.produtos ?? [], busca), [ativa, busca]);

  return (
    <View style={estilos.coluna}>
      {/* Cabeçalho do cardápio dentro da conversa: quem é a loja e como sair dela. */}
      <Cartao style={estilos.cabecalhoComEstado}>
        <View style={estilos.tituloDoCabecalho}>
          <Icone nome="loja" cor="marca" />
          <Texto variante="corpoForte" numberOfLines={1} accessibilityRole="header" style={estilos.flex}>
            Cardápio de {empresa.nome}
          </Texto>
          {aoFechar && (
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar cardápio" onPress={aoFechar} style={({ pressed }) => [estilos.fechar, pressed && estilos.pressionado]}>
              <Icone nome="fechar" tamanho={16} />
            </Pressable>
          )}
        </View>
        {/* Primeira coisa que o cliente lê: dá para pedir agora? Se não, quando? */}
        {funcionamento && <FuncionamentoDaEmpresa funcionamento={funcionamento} />}
      </Cartao>

      <Cartao style={estilos.filtros}>
        {/* No montador a busca não aparece: ali não há lista de produtos para filtrar. */}
        {!montagem && (
          <View style={estilos.busca}>
            <Icone nome="busca" tamanho={16} />
            <TextInput
              value={busca}
              onChangeText={setBusca}
              placeholder="Buscar produto"
              placeholderTextColor={Cores.conteudoSuave}
              accessibilityLabel="Buscar no cardápio"
              autoCorrect={false}
              style={estilos.entradaBusca}
            />
          </View>
        )}
        {/* Chips só quando há mais de uma seção. NÃO existe "Todos": cada chip troca o conteúdo abaixo. */}
        {secoes.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" accessibilityLabel="Categorias do cardápio" contentContainerStyle={estilos.chips}>
            {secoes.map((secao) => (
              <ChipCategoria key={secao.id} ativo={ativa?.id === secao.id} rotulo={secao.nome} total={secao.produtos.length} aoEscolher={() => aoEscolherSecao(secao.id)} />
            ))}
          </ScrollView>
        )}
      </Cartao>

      {montagem ? (
        // A categoria escolhida É a montagem. `key` inclui a contagem de montagens: cada prato começa do zero.
        <MontagemProduto
          key={`${montagem.produto.id}-${montagem.chave}`}
          produto={montagem.produto}
          grupos={montagem.grupos}
          bloqueio={aoAdicionar ? bloqueio : undefined}
          aoAdicionar={aoAdicionar ? (opcaoIds, quantidade, observacao) => aoAdicionar(montagem.produto, quantidade, opcaoIds, observacao) : () => {}}
        />
      ) : encontrados.length === 0 ? (
        <Cartao style={estilos.vazio}>
          <Icone nome="loja" tamanho={32} />
          <Texto variante="corpoForte" style={estilos.tituloVazio}>
            {busca.trim() === "" ? "Nada aqui por enquanto" : "Nada encontrado"}
          </Texto>
          <Texto variante="pequeno" cor="conteudoSuave" style={estilos.centro}>
            {busca.trim() === "" ? "Esta empresa ainda não tem produtos disponíveis." : `Nenhum produto de “${ativa?.nome ?? "cardápio"}” corresponde a “${busca.trim()}”.`}
          </Texto>
        </Cartao>
      ) : (
        // UMA seção por vez: o que aparece aqui é sempre o conteúdo do chip selecionado.
        <View accessibilityLabel={ativa?.nome ?? "Produtos"} style={estilos.produtos}>
          {encontrados.map((produto) => (
            <CardProduto key={produto.id} produto={produto} aoVer={aoVer} bloqueio={bloqueio} {...(aoAdicionar ? { aoAdicionar: (escolhido: ProdutoPublico) => aoAdicionar(escolhido, 1, [], null) } : {})} />
          ))}
        </View>
      )}
    </View>
  );
}

function ChipCategoria({ ativo, rotulo, total, aoEscolher }: { ativo: boolean; rotulo: string; total: number; aoEscolher: () => void }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: ativo }} onPress={aoEscolher} style={[estilos.chip, ativo && estilos.chipAtivo]}>
      <Texto variante="pequenoMedio" cor={ativo ? "marcaConteudo" : "conteudoSuave"}>
        {rotulo}
      </Texto>
      <View style={[estilos.totalChip, ativo && estilos.totalChipAtivo]}>
        <Texto variante="miniForte" cor={ativo ? "marcaConteudo" : "conteudoSuave"}>
          {total}
        </Texto>
      </View>
    </Pressable>
  );
}

/**
 * Card do produto. O corpo inteiro abre o detalhe; o botão à direita é a ação rápida. Produto que
 * precisa ser MONTADO não tem "Adicionar" direto — seria adicionar algo que ainda não foi escolhido.
 */
function CardProduto({
  produto,
  aoVer,
  aoAdicionar,
  bloqueio,
}: {
  produto: ProdutoPublico;
  aoVer: (produto: ProdutoPublico) => void;
  aoAdicionar?: ((produto: ProdutoPublico) => void) | undefined;
  bloqueio?: BloqueioDePedido | undefined;
}) {
  return (
    <Cartao style={estilos.produto}>
      <Pressable accessibilityRole="button" onPress={() => aoVer(produto)} style={estilos.corpoProduto}>
        <ImagemProduto url={produto.imagemUrl} nome={produto.nome} lado={56} />
        <View style={estilos.flex}>
          <Texto variante="corpoForte" numberOfLines={1}>
            {produto.nome}
          </Texto>
          {produto.descricao && (
            <Texto variante="mini" cor="conteudoSuave" numberOfLines={2} style={estilos.descricao}>
              {produto.descricao}
            </Texto>
          )}
          <View style={estilos.precoLinha}>
            <Texto variante="corpoForte" cor="marca">
              {formatarPrecoCentavos(produto.precoCentavos)}
            </Texto>
            {produto.personalizavel && (
              <Texto variante="miniForte" cor="conteudoSuave" style={estilos.normal}>
                a partir de · monte do seu jeito
              </Texto>
            )}
          </View>
        </View>
      </Pressable>
      {aoAdicionar ? (
        produto.personalizavel ? (
          <Pressable accessibilityRole="button" onPress={() => aoVer(produto)} style={({ pressed }) => [estilos.montar, pressed && estilos.pressionado]}>
            <Texto variante="pequenoMedio" cor="marcaSuaveConteudo">
              Montar
            </Texto>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Adicionar ${produto.nome}`}
            // Fechada: parece indisponível, mas continua tocável para explicar o motivo.
            accessibilityState={{ disabled: Boolean(bloqueio) }}
            onPress={acaoOuExplicacao(bloqueio, () => aoAdicionar(produto))}
            style={({ pressed }) => [estilos.adicionarRapido, bloqueio && estilos.inativo, pressed && estilos.pressionado]}>
            <Icone nome="mais" tamanho={16} cor="marcaConteudo" />
          </Pressable>
        )
      ) : null}
    </Cartao>
  );
}

export function DetalheProdutoCatalogo({
  empresa,
  produto,
  grupos,
  aoVoltar,
  aoAdicionar,
  funcionamento,
  bloqueio,
}: {
  funcionamento?: FuncionamentoPublico | undefined;
  bloqueio?: BloqueioDePedido | undefined;
  empresa: EmpresaPublica;
  produto: ProdutoPublico;
  // Vazio = produto comum: adiciona com quantidade, sem montagem.
  grupos: GrupoOpcoesPublico[];
  aoVoltar: () => void;
  aoAdicionar?: ((produto: ProdutoPublico, quantidade: number, opcaoIds: string[], observacao: string | null) => void) | undefined;
}) {
  return (
    <View accessibilityLabel="Detalhe do produto" style={estilos.coluna}>
      <Cartao style={estilos.cabecalhoComEstado}>
        <Pressable accessibilityRole="button" onPress={aoVoltar} style={({ pressed }) => [estilos.voltar, pressed && estilos.pressionado]}>
          <Icone nome="voltar" tamanho={16} />
          <Texto variante="pequenoMedio" cor="conteudoSuave">
            Cardápio
          </Texto>
        </Pressable>
        {funcionamento && <FuncionamentoDaEmpresa funcionamento={funcionamento} />}
      </Cartao>

      <Cartao style={estilos.resumoProduto}>
        <ImagemProduto url={produto.imagemUrl} nome={produto.nome} lado={80} />
        <View style={estilos.flex}>
          <Texto variante="corpoForte" accessibilityRole="header">
            {produto.nome}
          </Texto>
          <Texto variante="mini" cor="conteudoSuave">
            {empresa.nome}
          </Texto>
          {produto.descricao && (
            <Texto variante="mini" cor="conteudoSuave" style={estilos.descricao}>
              {produto.descricao}
            </Texto>
          )}
          <Texto variante="subtitulo" cor="marca" style={estilos.descricao}>
            {formatarPrecoCentavos(produto.precoCentavos)}
          </Texto>
          <Texto variante="mini" cor="marca">
            Disponível
          </Texto>
        </View>
      </Cartao>

      {aoAdicionar &&
        (grupos.length > 0 ? (
          <MontagemProduto produto={produto} grupos={grupos} bloqueio={bloqueio} aoAdicionar={(opcaoIds, quantidade, observacao) => aoAdicionar(produto, quantidade, opcaoIds, observacao)} />
        ) : (
          <AdicionarAoCarrinho produto={produto} bloqueio={bloqueio} aoAdicionar={(quantidade) => aoAdicionar(produto, quantidade, [], null)} />
        ))}
    </View>
  );
}

/** Quantidade (inteira, de 1 ao limite) antes de adicionar ao carrinho — para produto sem montagem. */
function AdicionarAoCarrinho({ produto, aoAdicionar, bloqueio }: { produto: ProdutoPublico; aoAdicionar: (quantidade: number) => void; bloqueio?: BloqueioDePedido | undefined }) {
  const [quantidade, setQuantidade] = useState(1);
  const limitar = (valor: number) => Math.min(Math.max(Math.trunc(valor), 1), QUANTIDADE_MAXIMA_POR_ITEM);
  return (
    <Cartao style={estilos.adicionarAoPedido}>
      <Quantidade valor={quantidade} aoMudar={(valor) => setQuantidade(limitar(valor))} rotulo={produto.nome} />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(bloqueio) }}
        onPress={acaoOuExplicacao(bloqueio, () => aoAdicionar(quantidade))}
        style={({ pressed }) => [estilos.botaoAdicionar, bloqueio && estilos.inativo, pressed && estilos.pressionado]}>
        <Icone nome="cesta" tamanho={16} cor="marcaConteudo" />
        <Texto variante="corpoMedio" cor="marcaConteudo">
          Adicionar ao pedido
        </Texto>
      </Pressable>
      {bloqueio && (
        <Texto variante="mini" cor="aviso" style={estilos.motivo}>
          {bloqueio.motivo}
        </Texto>
      )}
    </Cartao>
  );
}

/** Imagem do produto quando a empresa cadastrou uma; sem ela, um marcador neutro. */
export function ImagemProduto({ url, nome, lado }: { url: string | null; nome: string; lado: number }) {
  const forma = { width: lado, height: lado, borderRadius: Raio.compacto };
  if (!url) {
    return (
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[estilos.semImagem, forma]}>
        <Icone nome="imagem" tamanho={lado >= 56 ? 24 : 20} />
      </View>
    );
  }
  return <Image source={{ uri: url }} accessibilityLabel={nome} contentFit="cover" style={[forma, estilos.imagem]} />;
}

const estilos = StyleSheet.create({
  coluna: { gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  cabecalho: { alignItems: "center", flexDirection: "row", gap: Espaco.dois, padding: Espaco.tres },
  fechar: { alignItems: "center", borderRadius: Raio.compacto, height: 36, justifyContent: "center", width: 36 },
  voltar: { alignItems: "center", borderRadius: Raio.compacto, flexDirection: "row", gap: 6, minHeight: 36, paddingHorizontal: Espaco.dois },
  pressionado: { opacity: 0.8 },
  inativo: { opacity: 0.5 },
  motivo: { width: "100%" },
  cabecalhoComEstado: { gap: 2, paddingHorizontal: Espaco.tres, paddingVertical: Espaco.dois },
  tituloDoCabecalho: { alignItems: "center", flexDirection: "row", gap: Espaco.dois, minHeight: 36 },
  filtros: { gap: Espaco.tres, padding: Espaco.tres },
  busca: { alignItems: "center", backgroundColor: Cores.superficieSuave, borderRadius: Raio.compacto, flexDirection: "row", gap: Espaco.dois, minHeight: 44, paddingHorizontal: Espaco.tres },
  entradaBusca: { color: Cores.conteudo, flex: 1, fontSize: 14, minWidth: 0, paddingVertical: 0 },
  chips: { gap: Espaco.dois },
  chip: { alignItems: "center", borderRadius: Raio.total, flexDirection: "row", gap: 6, minHeight: 32, paddingHorizontal: Espaco.tres },
  chipAtivo: { backgroundColor: Cores.marca },
  totalChip: { backgroundColor: Cores.superficieSuave, borderRadius: Raio.total, paddingHorizontal: 6, paddingVertical: 2 },
  totalChipAtivo: { backgroundColor: "rgba(255,255,255,0.2)" },
  vazio: { alignItems: "center", paddingHorizontal: Espaco.quatro, paddingVertical: 48 },
  tituloVazio: { marginTop: Espaco.tres },
  centro: { marginTop: Espaco.um, textAlign: "center" },
  produtos: { gap: Espaco.dois },
  produto: { alignItems: "center", flexDirection: "row", gap: Espaco.tres, padding: Espaco.tres },
  corpoProduto: { alignItems: "center", flex: 1, flexDirection: "row", gap: Espaco.tres, minWidth: 0 },
  descricao: { marginTop: 2 },
  precoLinha: { alignItems: "baseline", flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: Espaco.um },
  normal: { fontWeight: "400" },
  montar: { alignItems: "center", backgroundColor: Cores.marcaSuave, borderRadius: Raio.compacto, justifyContent: "center", minHeight: 40, paddingHorizontal: Espaco.tres },
  adicionarRapido: { alignItems: "center", backgroundColor: Cores.marca, borderRadius: Raio.compacto, height: 40, justifyContent: "center", width: 40 },
  resumoProduto: { flexDirection: "row", gap: Espaco.tres, padding: Espaco.tres },
  adicionarAoPedido: { alignItems: "center", flexDirection: "row", gap: Espaco.tres, padding: Espaco.tres },
  botaoAdicionar: { alignItems: "center", backgroundColor: Cores.marca, borderRadius: Raio.compacto, flex: 1, flexDirection: "row", gap: Espaco.dois, height: 40, justifyContent: "center", paddingHorizontal: Espaco.quatro },
  semImagem: { alignItems: "center", backgroundColor: Cores.superficieSuave, justifyContent: "center" },
  imagem: { borderColor: Cores.borda, borderWidth: 1 },
});
