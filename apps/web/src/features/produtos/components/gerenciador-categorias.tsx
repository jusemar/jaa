"use client";

import { NOME_CATEGORIA_TAMANHO_MAXIMO, type CategoriaProduto } from "@jaa/contratos";
import { useState, type FormEvent } from "react";
import { Aviso, Botao, CampoTexto, Cartao, EstadoVazio, Selo } from "@/components/ui/primitivos";
import { atualizarCategoria, criarCategoria, removerCategoria } from "../lib/api-produtos";

/**
 * CATEGORIAS da empresa. Apagar uma categoria NÃO apaga produto — os produtos dela voltam para
 * "Sem categoria". A tela diz isso antes de confirmar, com o número de produtos afetados.
 */
export function GerenciadorCategorias({ empresaId, categorias, aoMudar }: { empresaId: string; categorias: CategoriaProduto[]; aoMudar: () => void }) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [emEdicao, setEmEdicao] = useState<string | null>(null);

  async function executar(acao: () => Promise<{ ok: boolean; mensagem?: string }>) {
    setOcupado(true);
    setErro(null);
    const resultado = await acao();
    if (!resultado.ok) setErro(resultado.mensagem ?? "Não foi possível concluir.");
    else aoMudar();
    setOcupado(false);
  }

  function criar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const nome = String(new FormData(formulario).get("nomeCategoria") ?? "").trim();
    if (!nome) return;
    void executar(async () => {
      const resposta = await criarCategoria(empresaId, { nome, posicao: categorias.length });
      if (resposta.ok) formulario.reset();
      return resposta;
    });
  }

  return (
    <Cartao className="flex flex-col gap-3 p-4">
      <form onSubmit={criar} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <CampoTexto id="categoria-nova" rotulo="Nova categoria" name="nomeCategoria" maxLength={NOME_CATEGORIA_TAMANHO_MAXIMO} placeholder="Bebidas" />
        </div>
        <Botao type="submit" disabled={ocupado}>
          Adicionar
        </Botao>
      </form>

      {categorias.length === 0 ? (
        <EstadoVazio titulo="Nenhuma categoria" descricao="Categorias organizam o catálogo em seções. Um produto sem categoria continua à venda normalmente." />
      ) : (
        <ul aria-label="Categorias" className="flex flex-col divide-y divide-borda">
          {categorias.map((categoria) => (
            <li key={categoria.id} data-categoria={categoria.id} className="flex flex-wrap items-center gap-2 py-2">
              {emEdicao === categoria.id ? (
                <form
                  className="flex flex-1 flex-wrap items-end gap-2"
                  onSubmit={(evento) => {
                    evento.preventDefault();
                    const nome = String(new FormData(evento.currentTarget).get("nomeCategoriaEdicao") ?? "").trim();
                    void executar(async () => {
                      const resposta = await atualizarCategoria(empresaId, categoria.id, { nome });
                      if (resposta.ok) setEmEdicao(null);
                      return resposta;
                    });
                  }}
                >
                  <div className="min-w-40 flex-1">
                    <CampoTexto id={`categoria-${categoria.id}`} rotulo="Nome" name="nomeCategoriaEdicao" defaultValue={categoria.nome} maxLength={NOME_CATEGORIA_TAMANHO_MAXIMO} required />
                  </div>
                  <Botao type="submit" disabled={ocupado}>
                    Salvar
                  </Botao>
                  <Botao type="button" aparencia="discreto" onClick={() => setEmEdicao(null)}>
                    Cancelar
                  </Botao>
                </form>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{categoria.nome}</span>
                  <Selo>{categoria.produtos} produto{categoria.produtos === 1 ? "" : "s"}</Selo>
                  <Botao aparencia="secundario" onClick={() => setEmEdicao(categoria.id)}>
                    Renomear
                  </Botao>
                  <Botao
                    aparencia="perigo"
                    data-remover-categoria={categoria.id}
                    disabled={ocupado}
                    onClick={() => {
                      const aviso =
                        categoria.produtos > 0
                          ? `Apagar "${categoria.nome}"? Os ${categoria.produtos} produtos dela continuam existindo e voltam para "Sem categoria".`
                          : `Apagar "${categoria.nome}"?`;
                      if (window.confirm(aviso)) void executar(() => removerCategoria(empresaId, categoria.id));
                    }}
                  >
                    Apagar
                  </Botao>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </Cartao>
  );
}
