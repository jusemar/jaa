import { PAGINA_PRODUTOS_TAMANHO_PADRAO, type CategoriaProduto, type Produto } from "@jaa/contratos";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { Icone } from "@/components/ui/icone";
import { MenuAcoes } from "@/components/ui/menu-acoes";
import { Aviso, Carregando, Cartao, EstadoVazio, Secao, Selo } from "@/components/ui/superficies";
import { Tela } from "@/components/ui/tela";
import { Texto } from "@/components/ui/texto";
import { ALTURA_TOQUE, Cores, Espaco, Raio } from "@/constants/theme";
import { ImagemProduto } from "@/features/catalogo/components/catalogo-apresentacao";
import { arquivoDaImagem, anexarImagem, type OrigemImagem } from "@/features/conversas/lib/imagem-conversa";
import { obterImagem, prepararImagem } from "@/features/conversas/lib/seletor-imagem";
import { executarAcaoDeImagem } from "../lib/acao-imagem";
import { alterarDisponibilidade, atualizarProduto, criarProduto, enviarImagemProduto, listarCategorias, listarProdutos, obterProduto, removerImagemProduto } from "../lib/api-produtos";
import { formatarPrecoCentavos } from "../lib/precos";
import { FormularioProduto, type DadosFormularioProduto } from "./formulario-produto";
import { GerenciadorCategorias } from "./gerenciador-categorias";
import { BotaoIcone, CampoDeEscolha, FolhaDeEscolha, TopoComVoltar, mensagemDe } from "./pecas";

/*
 * PRODUTOS DA EMPRESA no app — a mesma área da Web (`area-produtos.tsx`), pelas mesmas rotas e contratos.
 *
 *   LISTA (busca + categoria + página)  ── abrir ──▶  PRODUTO  ── voltar ──▶  a MESMA lista
 *
 * Listagem e cadastro são telas diferentes: abrir o cadastro cobre a lista (que continua montada por
 * baixo) e voltar devolve a mesma página, com os mesmos filtros. Toda regra é do servidor.
 */

type Camada = { nome: "lista" } | { nome: "formulario"; produto: Produto | null } | { nome: "categorias" };

interface Paginacao {
  pagina: number;
  limite: number;
  total: number;
  totalPaginas: number;
}

const PAGINACAO_INICIAL: Paginacao = { pagina: 1, limite: PAGINA_PRODUTOS_TAMANHO_PADRAO, total: 0, totalPaginas: 1 };
const TODAS = "";
const SEM_CATEGORIA = "sem-categoria";

export function TelaProdutosEmpresa({ empresaId, nomeEmpresa }: { empresaId: string; nomeEmpresa: string }) {
  const [camada, setCamada] = useState<Camada>({ nome: "lista" });
  const [produtos, setProdutos] = useState<Produto[] | null>(null);
  const [paginacao, setPaginacao] = useState<Paginacao>(PAGINACAO_INICIAL);
  const [categorias, setCategorias] = useState<CategoriaProduto[]>([]);
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState(TODAS);
  const [escolhendoCategoria, setEscolhendoCategoria] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [abrindoId, setAbrindoId] = useState<string | null>(null);
  const [menuDe, setMenuDe] = useState<Produto | null>(null);
  // Retorno do último salvamento, mostrado na barra do formulário ("Produto criado").
  const [recado, setRecado] = useState<string | null>(null);

  // A busca se aplica sozinha, um instante depois de a pessoa parar de digitar (o "ok" do teclado aplica na hora).
  useEffect(() => {
    const termo = busca.trim();
    if (termo === buscaAplicada) return;
    const espera = setTimeout(() => {
      setPagina(1);
      setBuscaAplicada(termo);
    }, 350);
    return () => clearTimeout(espera);
  }, [busca, buscaAplicada]);

  const consulta = useMemo(
    () => ({
      pagina,
      limite: PAGINA_PRODUTOS_TAMANHO_PADRAO,
      ...(buscaAplicada ? { busca: buscaAplicada } : {}),
      ...(filtroCategoria ? { categoriaId: filtroCategoria } : {}),
    }),
    [pagina, buscaAplicada, filtroCategoria],
  );

  const carregar = useCallback(async () => {
    const resultado = await listarProdutos(empresaId, consulta);
    if (resultado.ok) {
      setProdutos(resultado.dados.produtos);
      setPaginacao(resultado.dados.paginacao);
      setErro(null);
    } else setErro(mensagemDe(resultado));
  }, [empresaId, consulta]);

  const carregarCategorias = useCallback(async () => {
    const resultado = await listarCategorias(empresaId);
    if (resultado.ok) setCategorias(resultado.dados.categorias);
  }, [empresaId]);

  useEffect(() => {
    let ativo = true;
    void listarProdutos(empresaId, consulta).then((resultado) => {
      if (!ativo) return;
      if (resultado.ok) {
        setProdutos(resultado.dados.produtos);
        setPaginacao(resultado.dados.paginacao);
        setErro(null);
      } else setErro(mensagemDe(resultado));
    });
    return () => {
      ativo = false;
    };
  }, [empresaId, consulta]);

  useEffect(() => {
    let ativo = true;
    void listarCategorias(empresaId).then((resultado) => {
      if (ativo && resultado.ok) setCategorias(resultado.dados.categorias);
    });
    return () => {
      ativo = false;
    };
  }, [empresaId]);

  const voltarParaLista = useCallback(() => {
    setErro(null);
    setRecado(null);
    setCamada({ nome: "lista" });
  }, []);

  // O "Voltar" do Android sai de Categorias para a lista (o formulário cuida do próprio Voltar).
  const emCategorias = camada.nome === "categorias";
  useEffect(() => {
    if (!emCategorias) return;
    const assinatura = BackHandler.addEventListener("hardwareBackPress", () => {
      voltarParaLista();
      return true;
    });
    return () => assinatura.remove();
  }, [emCategorias, voltarParaLista]);

  async function abrirEdicao(produto: Produto) {
    setAbrindoId(produto.id);
    try {
      // Sempre relê do servidor: a lista local não é fonte da verdade.
      const resultado = await obterProduto(empresaId, produto.id);
      if (!resultado.ok) {
        setErro(mensagemDe(resultado));
        return;
      }
      setErro(null);
      setRecado(null);
      setCamada({ nome: "formulario", produto: resultado.dados });
    } finally {
      setAbrindoId(null);
    }
  }

  async function salvar(dados: DadosFormularioProduto) {
    if (camada.nome !== "formulario") return;
    const aberto = camada.produto;
    setErro(null);
    setRecado(null);
    setEnviando(true);
    try {
      const resultado = aberto ? await atualizarProduto(empresaId, aberto.id, dados) : await criarProduto(empresaId, dados);
      if (!resultado.ok) {
        setErro(mensagemDe(resultado));
        return;
      }
      await Promise.all([carregar(), carregarCategorias()]);
      // A edição continua aberta: salvar não tira o gestor da tela (e o produto novo libera imagem e grupos).
      setCamada({ nome: "formulario", produto: resultado.dados });
      setRecado(aberto ? "Produto salvo" : "Produto criado");
    } finally {
      setEnviando(false);
    }
  }

  async function alternarDisponibilidade(produto: Produto) {
    setErro(null);
    const resultado = await alterarDisponibilidade(empresaId, produto.id, produto.disponibilidade === "disponivel" ? "indisponivel" : "disponivel");
    if (resultado.ok) setProdutos((atuais) => atuais?.map((item) => (item.id === resultado.dados.id ? resultado.dados : item)) ?? null);
    else setErro(mensagemDe(resultado));
  }

  async function recarregarProdutoAberto(produtoId: string) {
    const atualizado = await obterProduto(empresaId, produtoId);
    if (atualizado.ok) setCamada({ nome: "formulario", produto: atualizado.dados });
    await carregar();
  }

  /** Galeria/câmera → imagem preparada (JPEG) → a mesma rota multipart da Web. Cancelar não é erro. */
  async function enviarImagem(produtoId: string, origem: OrigemImagem) {
    const anexo = await anexarImagem(origem, { obter: obterImagem, preparar: prepararImagem });
    if (anexo.tipo === "cancelado") return;
    if (anexo.tipo === "falha") throw new Error(anexo.mensagem);
    await executarAcaoDeImagem(
      async () => {
        const resposta = await enviarImagemProduto(empresaId, produtoId, arquivoDaImagem(anexo.imagem));
        return resposta.ok ? { ok: true } : { ok: false, mensagem: mensagemDe(resposta) };
      },
      () => recarregarProdutoAberto(produtoId),
    );
  }

  const naLista = camada.nome === "lista";
  const rotuloDoFiltro = filtroCategoria === TODAS ? "Todas" : filtroCategoria === SEM_CATEGORIA ? "Sem categoria" : (categorias.find((categoria) => categoria.id === filtroCategoria)?.nome ?? "Todas");
  const novoProduto = () => {
    setErro(null);
    setRecado(null);
    setCamada({ nome: "formulario", produto: null });
  };

  return (
    <View style={estilos.flex}>
      {/* A lista continua montada (só escondida) por baixo do cadastro: voltar devolve a mesma altura. */}
      <View style={[estilos.flex, !naLista && estilos.escondida]}>
        <Tela
          atualizando={atualizando}
          aoAtualizar={() => {
            setAtualizando(true);
            void Promise.all([carregar(), carregarCategorias()]).finally(() => setAtualizando(false));
          }}>
          <Secao
            titulo="Produtos"
            descricao={`O cardápio de ${nomeEmpresa}, organizado do seu jeito.`}
            acoes={
              <View style={estilos.acoesDoTopo}>
                <BotaoIcone icone="grade" rotulo="Categorias" aoTocar={() => setCamada({ nome: "categorias" })} />
                <BotaoIcone icone="mais" rotulo="Novo produto" principal aoTocar={novoProduto} />
              </View>
            }>
            {/* Filtros numa linha só: digitar ou escolher a categoria já filtra, sem botão. */}
            <View accessibilityRole="search" style={estilos.filtros}>
              <View style={estilos.busca}>
                <Icone nome="busca" tamanho={18} />
                <TextInput
                  accessibilityLabel="Buscar produto"
                  value={busca}
                  placeholder="Buscar produto"
                  placeholderTextColor="#A2AAAB"
                  autoCorrect={false}
                  returnKeyType="search"
                  onChangeText={setBusca}
                  onSubmitEditing={() => {
                    setPagina(1);
                    setBuscaAplicada(busca.trim());
                  }}
                  style={estilos.campoBusca}
                />
              </View>
              <View style={estilos.filtroCategoria}>
                <CampoDeEscolha semRotulo rotulo="Filtrar por categoria" valor={rotuloDoFiltro} aoAbrir={() => setEscolhendoCategoria(true)} />
              </View>
            </View>

            {produtos === null && !erro && <Carregando texto="Carregando catálogo…" />}
            {naLista && erro && <Aviso tom="erro">{erro}</Aviso>}

            {produtos &&
              (produtos.length === 0 ? (
                <EstadoVazio titulo="Nenhum produto por aqui" descricao="Cadastre o primeiro produto do catálogo ou ajuste os filtros da busca." acao={<Botao rotulo="Novo produto" centralizado onPress={novoProduto} />} />
              ) : (
                <View accessibilityLabel="Produtos" style={estilos.lista}>
                  {produtos.map((produto) => (
                    <ItemDaLista key={produto.id} produto={produto} abrindo={abrindoId === produto.id} aoAbrir={() => void abrirEdicao(produto)} aoAbrirMenu={() => setMenuDe(produto)} />
                  ))}
                </View>
              ))}

            {produtos && <ControlePaginacao paginacao={paginacao} aoTrocar={setPagina} />}
          </Secao>
        </Tela>
      </View>

      {camada.nome === "categorias" && (
        <Tela>
          <TopoComVoltar rotulo="Voltar para produtos" aoVoltar={voltarParaLista} />
          <Secao titulo="Categorias" descricao={`Seções do catálogo de ${nomeEmpresa}.`}>
            <GerenciadorCategorias
              empresaId={empresaId}
              categorias={categorias}
              aoMudar={() => {
                void carregarCategorias();
                void carregar();
              }}
            />
          </Secao>
        </Tela>
      )}

      {camada.nome === "formulario" && (
        <FormularioProduto
          // Depois de criar, a mesma tela vira a edição do produto criado.
          key={camada.produto?.id ?? "novo"}
          produto={camada.produto}
          categorias={categorias}
          enviando={enviando}
          empresaId={empresaId}
          erro={erro}
          recado={recado}
          aoSalvar={(dados) => void salvar(dados)}
          aoCancelar={voltarParaLista}
          aoEnviarImagem={(origem) => (camada.produto ? enviarImagem(camada.produto.id, origem) : Promise.resolve())}
          aoRemoverImagem={() => {
            const aberto = camada.produto;
            if (!aberto) return Promise.resolve();
            return executarAcaoDeImagem(
              async () => {
                const resposta = await removerImagemProduto(empresaId, aberto.id);
                return resposta.ok ? { ok: true } : { ok: false, mensagem: mensagemDe(resposta) };
              },
              () => recarregarProdutoAberto(aberto.id),
            );
          }}
        />
      )}

      <FolhaDeEscolha
        titulo="Filtrar por categoria"
        aberta={escolhendoCategoria}
        atual={filtroCategoria}
        itens={[{ id: TODAS, rotulo: "Todas" }, { id: SEM_CATEGORIA, rotulo: "Sem categoria" }, ...categorias.map((categoria) => ({ id: categoria.id, rotulo: categoria.nome }))]}
        aoEscolher={(id) => {
          setPagina(1);
          setFiltroCategoria(id);
        }}
        aoFechar={() => setEscolhendoCategoria(false)}
      />

      <MenuAcoes
        titulo={menuDe?.nome}
        aberto={menuDe !== null}
        aoFechar={() => setMenuDe(null)}
        acoes={
          menuDe
            ? [
                { rotulo: "Editar", icone: "lapis", executar: () => void abrirEdicao(menuDe) },
                { rotulo: menuDe.disponibilidade === "disponivel" ? "Marcar indisponível" : "Tornar disponível", icone: menuDe.disponibilidade === "disponivel" ? "bloqueio" : "check", executar: () => void alternarDisponibilidade(menuDe) },
              ]
            : []
        }
      />
    </View>
  );
}

/*
 *   [imagem]  Nome do produto                     R$ 24,90  ⋮
 *             Descrição, em até duas linhas
 *             🏷 Categoria
 *
 * Tocar no item abre a edição; o menu ⋮ guarda "Editar" e a troca de disponibilidade. DISPONÍVEL é o
 * normal e não ganha selo: só o indisponível aparece marcado e esmaecido.
 */
function ItemDaLista({ produto, abrindo, aoAbrir, aoAbrirMenu }: { produto: Produto; abrindo: boolean; aoAbrir: () => void; aoAbrirMenu: () => void }) {
  const disponivel = produto.disponibilidade === "disponivel";
  return (
    <Cartao style={estilos.item}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Editar ${produto.nome}, ${formatarPrecoCentavos(produto.precoCentavos)}${disponivel ? "" : ", indisponível"}`}
        accessibilityState={{ busy: abrindo }}
        disabled={abrindo}
        onPress={aoAbrir}
        style={({ pressed }) => [estilos.abrir, (pressed || abrindo) && estilos.apagado]}>
        <View style={!disponivel && estilos.esmaecida}>
          <ImagemProduto url={produto.imagemUrl} nome="" lado={64} />
        </View>
        <View style={estilos.textoDoItem}>
          <Texto variante="corpoForte" cor={disponivel ? "conteudo" : "conteudoSuave"} numberOfLines={2}>
            {produto.nome}
          </Texto>
          {produto.descricao && (
            <Texto variante="pequeno" cor="conteudoSuave" numberOfLines={2}>
              {produto.descricao}
            </Texto>
          )}
          {(produto.categoriaNome || !disponivel) && (
            <View style={estilos.rodapeDoItem}>
              {produto.categoriaNome && (
                <View style={estilos.categoria}>
                  <Icone nome="etiqueta" tamanho={13} />
                  <Texto variante="pequeno" cor="conteudoSuave" numberOfLines={1} style={estilos.encolhe}>
                    {produto.categoriaNome}
                  </Texto>
                </View>
              )}
              {!disponivel && <Selo rotulo="Indisponível" tom="atencao" />}
            </View>
          )}
        </View>
        <Texto variante="corpoForte" cor={disponivel ? "conteudo" : "conteudoSuave"}>
          {formatarPrecoCentavos(produto.precoCentavos)}
        </Texto>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Ações de ${produto.nome}`} hitSlop={4} onPress={aoAbrirMenu} style={({ pressed }) => [estilos.menu, pressed && estilos.apagado]}>
        <Icone nome="maisAcoes" tamanho={20} />
      </Pressable>
    </Cartao>
  );
}

/** "1–20 de 45 produtos" e, quando há mais de uma página, ‹ 2 / 3 ›. Com uma página só, fica a contagem. */
function ControlePaginacao({ paginacao, aoTrocar }: { paginacao: Paginacao; aoTrocar: (pagina: number) => void }) {
  if (paginacao.total === 0) return null;
  const primeiro = (paginacao.pagina - 1) * paginacao.limite + 1;
  const ultimo = Math.min(paginacao.pagina * paginacao.limite, paginacao.total);
  const variasPaginas = paginacao.totalPaginas > 1;
  return (
    <View accessibilityLabel="Páginas de produtos" style={estilos.paginacao}>
      <Texto variante="pequeno" cor="conteudoSuave" accessibilityLiveRegion="polite">
        {variasPaginas ? `${primeiro}–${ultimo} de ${paginacao.total} produtos` : `${paginacao.total} produto${paginacao.total === 1 ? "" : "s"}`}
      </Texto>
      {variasPaginas && (
        <View style={estilos.paginas}>
          <BotaoIcone icone="voltar" rotulo="Página anterior" desabilitado={paginacao.pagina <= 1} aoTocar={() => aoTrocar(paginacao.pagina - 1)} />
          <Texto variante="corpoMedio" accessibilityLabel={`Página ${paginacao.pagina} de ${paginacao.totalPaginas}`}>
            {paginacao.pagina} <Texto cor="conteudoSuave">/ {paginacao.totalPaginas}</Texto>
          </Texto>
          <BotaoIcone icone="seta" rotulo="Próxima página" desabilitado={paginacao.pagina >= paginacao.totalPaginas} aoTocar={() => aoTrocar(paginacao.pagina + 1)} />
        </View>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  escondida: { display: "none" },
  acoesDoTopo: { flexDirection: "row", gap: Espaco.dois },
  filtros: { alignItems: "center", flexDirection: "row", gap: Espaco.dois },
  busca: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, flex: 1, flexDirection: "row", gap: Espaco.dois, minHeight: ALTURA_TOQUE, paddingHorizontal: Espaco.tres },
  campoBusca: { color: Cores.conteudo, flex: 1, fontSize: 16, minWidth: 0, paddingVertical: 0 },
  filtroCategoria: { width: 132 },
  lista: { gap: Espaco.dois },
  item: { alignItems: "flex-start", flexDirection: "row", paddingLeft: Espaco.dois, paddingVertical: Espaco.dois },
  abrir: { alignItems: "flex-start", flex: 1, flexDirection: "row", gap: Espaco.tres, minWidth: 0 },
  textoDoItem: { flex: 1, gap: 2, minWidth: 0 },
  rodapeDoItem: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois, marginTop: 2 },
  categoria: { alignItems: "center", flexDirection: "row", flexShrink: 1, gap: Espaco.um, minWidth: 0 },
  encolhe: { flexShrink: 1 },
  menu: { alignItems: "center", height: ALTURA_TOQUE, justifyContent: "center", marginTop: -Espaco.dois, width: 36 },
  esmaecida: { opacity: 0.6 },
  apagado: { opacity: 0.5 },
  paginacao: { alignItems: "center", flexDirection: "row", gap: Espaco.dois, justifyContent: "space-between", minHeight: 36 },
  paginas: { alignItems: "center", flexDirection: "row", gap: Espaco.dois },
});
