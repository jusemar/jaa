"use client";

import { PAGINA_PRODUTOS_TAMANHO_PADRAO, type CategoriaProduto, type Produto } from "@jaa/contratos";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Aviso, Botao, CampoSelecao, CampoTexto, Carregando, Secao } from "@/components/ui/primitivos";
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
      // Produto novo continua aberto: é o único momento em que a imagem pode ser enviada.
      setTela(tela.produto ? { nome: "lista" } : { nome: "formulario", produto: resultado.dados });
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
      <Secao titulo={produto ? "Editar produto" : "Novo produto"} descricao={nomeEmpresa} acoes={<Botao aparencia="secundario" onClick={() => setTela({ nome: "lista" })}>Voltar ao catálogo</Botao>}>
        <FormularioProduto
          key={produto?.id ?? "novo"}
          produto={produto}
          categorias={categorias}
          enviando={enviando}
          aoSalvar={(dados) => void salvar(dados)}
          aoCancelar={() => setTela({ nome: "lista" })}
          {...(produto
            ? {
                aoEnviarImagem: async (arquivo: File) => {
                  const resposta = await enviarImagemProduto(empresaId, produto.id, arquivo);
                  if (!resposta.ok) throw new Error(resposta.mensagem);
                  await recarregarProdutoAberto(produto.id);
                },
                aoRemoverImagem: async () => {
                  await removerImagemProduto(empresaId, produto.id);
                  await recarregarProdutoAberto(produto.id);
                },
              }
            : {})}
        />
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </Secao>
    );
  }

  if (tela.nome === "categorias") {
    return (
      <Secao titulo="Categorias" descricao={`Seções do catálogo de ${nomeEmpresa}`} acoes={<Botao aparencia="secundario" onClick={() => setTela({ nome: "lista" })}>Voltar ao catálogo</Botao>}>
        <GerenciadorCategorias
          empresaId={empresaId}
          categorias={categorias}
          aoMudar={() => {
            void carregarCategorias();
            void carregar();
          }}
        />
      </Secao>
    );
  }

  return (
    <Secao
      titulo="Produtos"
      descricao={nomeEmpresa}
      acoes={
        <>
          <Botao aparencia="secundario" onClick={() => setTela({ nome: "categorias" })}>
            Categorias
          </Botao>
          <Botao onClick={() => setTela({ nome: "formulario", produto: null })}>Novo produto</Botao>
        </>
      }
    >
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(evento) => {
          evento.preventDefault();
          setPagina(1);
          setBuscaAplicada(busca.trim());
        }}
      >
        <div className="flex-1">
          <CampoTexto id="produtos-busca" rotulo="Buscar" type="search" value={busca} placeholder="Nome do produto" onChange={(evento) => setBusca(evento.target.value)} />
        </div>
        <div className="sm:w-56">
          <CampoSelecao
            id="produtos-categoria"
            rotulo="Categoria"
            value={filtroCategoria}
            onChange={(evento) => {
              setPagina(1);
              setFiltroCategoria(evento.target.value);
            }}
          >
            <option value="">Todas</option>
            <option value="sem-categoria">Sem categoria</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nome}
              </option>
            ))}
          </CampoSelecao>
        </div>
        <Botao type="submit" aparencia="secundario">
          Filtrar
        </Botao>
      </form>

      {produtos === null && !erro && <Carregando texto="Carregando catálogo…" />}
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
      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </Secao>
  );
}
