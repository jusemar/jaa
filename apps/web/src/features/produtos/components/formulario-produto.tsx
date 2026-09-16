"use client";

import { DESCRICAO_PRODUTO_TAMANHO_MAXIMO, NOME_PRODUTO_TAMANHO_MAXIMO, type DisponibilidadeProduto, type Produto } from "@jaa/contratos";
import { useState, type FormEvent } from "react";
import { centavosParaCampo, interpretarPrecoDigitado } from "../lib/precos";
import { ImagemProdutoEmBreve } from "./imagem-produto-em-breve";

// Interface TÉCNICA: criar/editar produto. Validações finais são do servidor (contratos). Não é o design final.

export type DadosFormularioProduto = { nome: string; descricao: string | null; precoCentavos: number; disponibilidade: DisponibilidadeProduto };

export function FormularioProduto({
  produto,
  enviando,
  aoSalvar,
  aoCancelar,
}: {
  produto: Produto | null;
  enviando: boolean;
  aoSalvar: (dados: DadosFormularioProduto) => void;
  aoCancelar: () => void;
}) {
  const [nome, setNome] = useState(produto?.nome ?? "");
  const [descricao, setDescricao] = useState(produto?.descricao ?? "");
  const [preco, setPreco] = useState(produto ? centavosParaCampo(produto.precoCentavos) : "");
  const [disponibilidade, setDisponibilidade] = useState<DisponibilidadeProduto>(produto?.disponibilidade ?? "disponivel");
  const [erroPreco, setErroPreco] = useState<string | null>(null);

  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const precoCentavos = interpretarPrecoDigitado(preco);
    if (precoCentavos === null) {
      setErroPreco("Informe um preço válido maior que zero, ex.: 39,90.");
      return;
    }
    setErroPreco(null);
    aoSalvar({ nome, descricao: descricao.trim() === "" ? null : descricao, precoCentavos, disponibilidade });
  }

  return (
    <form aria-label={produto ? "Editar produto" : "Novo produto"} onSubmit={aoEnviar} className="flex flex-col gap-2 rounded border border-zinc-200 p-3 text-sm">
      <h4 className="font-semibold">{produto ? "Editar produto" : "Novo produto"}</h4>
      <label className="flex flex-col gap-1">
        Nome
        <input name="nomeProduto" value={nome} required maxLength={NOME_PRODUTO_TAMANHO_MAXIMO} onChange={(evento) => setNome(evento.target.value)} className="rounded border border-zinc-300 px-2 py-1.5" />
      </label>
      <label className="flex flex-col gap-1">
        Descrição
        <textarea
          name="descricaoProduto"
          value={descricao}
          maxLength={DESCRICAO_PRODUTO_TAMANHO_MAXIMO}
          rows={3}
          onChange={(evento) => setDescricao(evento.target.value)}
          className="rounded border border-zinc-300 px-2 py-1.5"
        />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          Preço (R$)
          <input name="precoProduto" value={preco} required inputMode="decimal" placeholder="39,90" onChange={(evento) => setPreco(evento.target.value)} className="rounded border border-zinc-300 px-2 py-1.5" />
        </label>
        <label className="flex flex-col gap-1">
          Disponibilidade
          <select name="disponibilidadeProduto" value={disponibilidade} onChange={(evento) => setDisponibilidade(evento.target.value as DisponibilidadeProduto)} className="rounded border border-zinc-300 px-2 py-1.5">
            <option value="disponivel">Disponível</option>
            <option value="indisponivel">Indisponível</option>
          </select>
        </label>
      </div>
      <ImagemProdutoEmBreve />
      {erroPreco && (
        <p role="alert" className="text-red-600">
          {erroPreco}
        </p>
      )}
      <span className="flex gap-2">
        <button type="submit" disabled={enviando} className="rounded bg-black px-3 py-1.5 text-white disabled:opacity-50">
          {produto ? "Salvar produto" : "Criar produto"}
        </button>
        <button type="button" onClick={aoCancelar} className="rounded border px-3 py-1.5">
          Cancelar
        </button>
      </span>
    </form>
  );
}
