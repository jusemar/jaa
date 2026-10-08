"use client";

import { PAGINA_PRODUTOS_TAMANHO_PADRAO, type CategoriaProduto, type Produto } from "@jaa/contratos";
import { useCallback, useEffect, useMemo, useState } from "react";
import { avisar } from "@/components/ui/avisos";
import { IconeBusca, IconeGrade, IconeMais } from "@/components/ui/icones";
import { Aviso, Botao, BotaoIcone, Carregando } from "@/components/ui/primitivos";
import {
  alterarDisponibilidade,
  atualizarProduto,
  criarProduto,
  enviarImagemProduto,
  listarCategorias,
  listarProdutos,
  obterProduto,
  removerImagemProduto,
} from "../lib/api-produtos";
import { executarAcaoDeImagem } from "../lib/acao-imagem";
import { CabecalhoDaPagina } from "./cabecalho-pagina";
import { FormularioProduto, type DadosFormularioProduto } from "./formulario-produto";
import { GerenciadorCategorias } from "./gerenciador-categorias";
import { ControlePaginacao, ListaProdutos, type Paginacao } from "./lista-produtos";

/*
 * CATÁLOGO da empresa: LISTAGEM e CADASTRO são telas diferentes.
 *
 * Misturar as duas foi o que tornou a tela antiga confusa — a lista inteira ficava atrás de um
 * formulário aberto. Aqui, abrir o cadastro substitui a listagem e voltar devolve a lista na mesma
 * página e com os mesmos filtros.
 */

type Tela = { nome: "lista" } | { nome: "formulario"; produto: Produto | null } | { nome: "categorias" };

const PAGINACAO_INICIAL: Paginacao = { pagina: 1, limite: PAGINA_PRODUTOS_TAMANHO_PADRAO, total: 0, totalPaginas: 1 };

export function AreaProdutos({ empresaId, nomeEmpresa }: { empresaId: string; nomeEmpresa: string }) {
  const [tela, setTela] = useState<Tela>({ nome: "lista" });
  const [produtos, setProdutos] = useState<Produto[] | null>(null);
  const [paginacao, setPaginacao] = useState<Paginacao>(PAGINACAO_INICIAL);
  const [categorias, setCategorias] = useState<CategoriaProduto[]>([]);
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // A busca se aplica sozinha, um instante depois de a pessoa parar de digitar (Enter aplica na hora).
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
    } else setErro(resultado.mensagem);
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
      } else setErro(resultado.mensagem);
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

  async function abrirEdicao(produto: Produto) {
    const resultado = await obterProduto(empresaId, produto.id);
    if (!resultado.ok) {
      setErro(resultado.mensagem);
      return;
    }
    setErro(null);
    setTela({ nome: "formulario", produto: resultado.dados });
  }

  async function salvar(dados: DadosFormularioProduto) {
    if (tela.nome !== "formulario") return;
    setErro(null);
    setEnviando(true);
    try {
      const resultado = tela.produto ? await atualizarProduto(empresaId, tela.produto.id, dados) : await criarProduto(empresaId, dados);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      await Promise.all([carregar(), carregarCategorias()]);
      // A edição continua aberta: salvar não tira o gestor da tela (e o produto novo libera imagem e grupos).
      setTela({ nome: "formulario", produto: resultado.dados });
      avisar.sucesso(tela.produto ? "Produto salvo" : "Produto criado");
    } finally {
      setEnviando(false);
    }
  }

  async function alternarDisponibilidade(produto: Produto) {
    setErro(null);
    const resultado = await alterarDisponibilidade(empresaId, produto.id, produto.disponibilidade === "disponivel" ? "indisponivel" : "disponivel");
    if (resultado.ok) setProdutos((atuais) => atuais?.map((item) => (item.id === resultado.dados.id ? resultado.dados : item)) ?? null);
    else setErro(resultado.mensagem);
  }

  async function recarregarProdutoAberto(produtoId: string) {
    const atualizado = await obterProduto(empresaId, produtoId);
    if (atualizado.ok) setTela({ nome: "formulario", produto: atualizado.dados });
    await carregar();
  }

  if (tela.nome === "formulario") {
    const produto = tela.produto;
    return (
      <div className="flex flex-col gap-4">
        <FormularioProduto
          // Depois de criar, a mesma tela vira a edição do produto criado.
          key={produto?.id ?? "novo"}
          produto={produto}
          categorias={categorias}
          enviando={enviando}
          empresaId={empresaId}
          aoSalvar={(dados) => void salvar(dados)}
          aoCancelar={() => setTela({ nome: "lista" })}
          {...(produto
            ? {
                aoEnviarImagem: (arquivo: File) =>
                  executarAcaoDeImagem(() => enviarImagemProduto(empresaId, produto.id, arquivo), () => recarregarProdutoAberto(produto.id)),
                aoRemoverImagem: () =>
                  executarAcaoDeImagem(() => removerImagemProduto(empresaId, produto.id), () => recarregarProdutoAberto(produto.id)),
              }
            : {})}
        />
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    );
  }

  if (tela.nome === "categorias") {
    return (
      <section aria-label="Categorias" className="flex flex-col gap-6">
        <CabecalhoDaPagina
          trilha={[{ rotulo: "Cardápio" }, { rotulo: "Produtos", aoIr: () => setTela({ nome: "lista" }) }, { rotulo: "Categorias" }]}
          titulo="Categorias"
          subtitulo={`Seções do catálogo de ${nomeEmpresa}.`}
          acoes={
            <Botao aparencia="secundario" onClick={() => setTela({ nome: "lista" })}>
              Catálogo
            </Botao>
          }
        />
        <GerenciadorCategorias
          empresaId={empresaId}
          categorias={categorias}
          aoMudar={() => {
            void carregarCategorias();
            void carregar();
          }}
        />
      </section>
    );
  }

  return (
    /*
     * No celular a lista fica um pouco mais larga que o título: a margem negativa tira 6 px do
     * respiro de 16 px da área de trabalho SÓ aqui (sobram 10 px), e título, filtros e paginação
     * recuperam os 16 px com um respiro próprio. A partir de `sm` vale o respiro normal.
     */
    <section aria-label="Produtos" data-lista-administrativa className="-mx-1.5 flex flex-col gap-3 sm:mx-0 sm:gap-5">
      <div className="px-1.5 sm:px-0">
        <CabecalhoDaPagina
          compacto
          trilha={[{ rotulo: "Cardápio" }, { rotulo: "Produtos" }]}
          titulo="Produtos"
          subtitulo={`O cardápio de ${nomeEmpresa}, organizado do seu jeito.`}
          acoes={
            <>
              {/* Só ícones: o nome de cada ação fica no rótulo acessível e na dica. */}
              <BotaoIcone aparencia="secundario" aria-label="Categorias" title="Categorias" data-abrir-categorias onClick={() => setTela({ nome: "categorias" })}>
                <IconeGrade className="h-5 w-5" />
              </BotaoIcone>
              <BotaoIcone aparencia="principal" aria-label="Novo produto" title="Novo produto" data-novo-produto onClick={() => setTela({ nome: "formulario", produto: null })}>
                <IconeMais className="h-5 w-5" />
              </BotaoIcone>
            </>
          }
        />
      </div>

      {/*
        Filtros numa linha só: busca e categoria lado a lado, sem rótulo ocupando altura (o nome de
        cada um fica no rótulo acessível) e sem botão — escolher a categoria ou digitar já filtra.
      */}
      <form
        data-filtros-de-produtos
        role="search"
        className="grid grid-cols-[minmax(0,1fr)_minmax(0,7rem)] gap-2 px-1.5 sm:grid-cols-[minmax(0,1fr)_12rem] sm:gap-3 sm:px-0"
        onSubmit={(evento) => {
          evento.preventDefault();
          setPagina(1);
          setBuscaAplicada(busca.trim());
        }}
      >
        <label className="flex min-h-11 min-w-0 items-center gap-2 rounded-jaa-compacto bg-superficie-suave px-3 text-conteudo-suave focus-within:ring-2 focus-within:ring-marca/30 sm:min-h-10">
          <span className="sr-only">Buscar produto</span>
          <IconeBusca className="h-4 w-4 shrink-0" />
          <input
            id="produtos-busca"
            type="search"
            value={busca}
            placeholder="Buscar produto"
            autoComplete="off"
            onChange={(evento) => setBusca(evento.target.value)}
            className="min-w-0 flex-1 bg-transparent text-base text-conteudo outline-none placeholder:text-conteudo-suave sm:text-sm"
          />
        </label>
        <select
          id="produtos-categoria"
          aria-label="Filtrar por categoria"
          value={filtroCategoria}
          onChange={(evento) => {
            setPagina(1);
            setFiltroCategoria(evento.target.value);
          }}
          className="min-h-11 w-full min-w-0 truncate rounded-jaa-compacto border border-borda bg-superficie px-2 text-sm text-conteudo sm:min-h-10"
        >
          <option value="">Todas</option>
          <option value="sem-categoria">Sem categoria</option>
          {categorias.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nome}
            </option>
          ))}
        </select>
      </form>

      {produtos === null && !erro && (
        <div className="px-1.5 sm:px-0">
          <Carregando texto="Carregando catálogo…" />
        </div>
      )}
      {produtos && (
        <>
          <ListaProdutos
            produtos={produtos}
            aoEditar={(produto) => void abrirEdicao(produto)}
            aoAlternarDisponibilidade={(produto) => void alternarDisponibilidade(produto)}
            aoNovo={() => setTela({ nome: "formulario", produto: null })}
          />
          <ControlePaginacao paginacao={paginacao} aoTrocar={setPagina} />
        </>
      )}
      {erro && (
        <div className="px-1.5 sm:px-0">
          <Aviso tom="erro">{erro}</Aviso>
        </div>
      )}
    </section>
  );
}
