"use client";

import type { Empresa, Produto } from "@jaa/contratos";
import { useEffect, useState } from "react";
import { alterarDisponibilidade, atualizarProduto, criarProduto, listarProdutos, obterProduto } from "../lib/api-produtos";
import { FormularioProduto, type DadosFormularioProduto } from "./formulario-produto";
import { ListaProdutos } from "./lista-produtos";

// Interface TÉCNICA e TEMPORÁRIA: administração dos produtos de UMA empresa (gestão comercial é Web).
// Toda operação é autorizada pela API; esta tela só apresenta. Não é o design final.

type Edicao = { modo: "novo" } | { modo: "editar"; produto: Produto } | null;

export function AreaProdutos({ empresa }: { empresa: Empresa }) {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [edicao, setEdicao] = useState<Edicao>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let ativo = true;
    void listarProdutos(empresa.id).then((resultado) => {
      if (!ativo) return;
      if (resultado.ok) setProdutos(resultado.dados.produtos);
      else setErro(resultado.mensagem);
    });
    return () => {
      ativo = false;
    };
  }, [empresa.id]);

  const substituir = (atualizado: Produto) => setProdutos((atuais) => atuais.map((produto) => (produto.id === atualizado.id ? atualizado : produto)));

  async function abrirEdicao(produto: Produto) {
    const resultado = await obterProduto(empresa.id, produto.id);
    if (!resultado.ok) {
      setErro(resultado.mensagem);
      return;
    }
    setErro(null);
    setEdicao({ modo: "editar", produto: resultado.dados });
  }

  async function salvar(dados: DadosFormularioProduto) {
    if (!edicao) return;
    setErro(null);
    setEnviando(true);
    try {
      const resultado = edicao.modo === "novo" ? await criarProduto(empresa.id, dados) : await atualizarProduto(empresa.id, edicao.produto.id, dados);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      if (edicao.modo === "novo") setProdutos((atuais) => [...atuais, resultado.dados]);
      else substituir(resultado.dados);
      setEdicao(null);
    } finally {
      setEnviando(false);
    }
  }

  async function alternarDisponibilidade(produto: Produto) {
    setErro(null);
    const resultado = await alterarDisponibilidade(empresa.id, produto.id, produto.disponibilidade === "disponivel" ? "indisponivel" : "disponivel");
    if (resultado.ok) substituir(resultado.dados);
    else setErro(resultado.mensagem);
  }

  return (
    <section aria-label={`Produtos de ${empresa.nome}`} className="flex flex-col gap-2 rounded border border-zinc-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Produtos · {empresa.nome}</h3>
        {!edicao && (
          <button type="button" onClick={() => setEdicao({ modo: "novo" })} className="rounded border px-3 py-1.5 text-sm">
            + Novo produto
          </button>
        )}
      </div>
      {edicao && (
        <FormularioProduto
          key={edicao.modo === "editar" ? edicao.produto.id : "novo"}
          produto={edicao.modo === "editar" ? edicao.produto : null}
          enviando={enviando}
          aoSalvar={(dados) => void salvar(dados)}
          aoCancelar={() => setEdicao(null)}
        />
      )}
      <ListaProdutos produtos={produtos} aoEditar={(produto) => void abrirEdicao(produto)} aoAlternarDisponibilidade={(produto) => void alternarDisponibilidade(produto)} />
      {erro && (
        <p role="alert" className="text-sm text-red-600">
          {erro}
        </p>
      )}
    </section>
  );
}
