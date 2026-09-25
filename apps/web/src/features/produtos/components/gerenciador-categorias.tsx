"use client";

import { NOME_CATEGORIA_TAMANHO_MAXIMO, type CategoriaProduto } from "@jaa/contratos";
import { useRef, useState, type FormEvent } from "react";
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
  // Erro do campo de criação, separado do erro da operação: um é do formulário, o outro é do servidor.
  const [erroNome, setErroNome] = useState<string | null>(null);
  const campoNovaRef = useRef<HTMLInputElement>(null);

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

    /*
     * Nome vazio NÃO pode ser um clique mudo. Antes, o envio simplesmente retornava sem dizer nada —
     * para quem usa, "cliquei em adicionar e não aconteceu nada". Agora o campo é `required` (o
     * próprio navegador barra e aponta o campo) e, se ainda assim chegar vazio, a recusa é dita em
     * texto e o foco volta para o campo.
     */
    if (!nome) {
      setErroNome("Escreva o nome da categoria para adicionar.");
      campoNovaRef.current?.focus();
      return;
    }

    setErroNome(null);
    void executar(async () => {
      const resposta = await criarCategoria(empresaId, { nome, posicao: categorias.length });
      if (resposta.ok) {
        formulario.reset();
        // Foco de volta no campo: cadastrar categorias é uma tarefa em série.
        campoNovaRef.current?.focus();
      }
      return resposta;
    });
  }

  return (
    <Cartao className="flex flex-col gap-3 p-4">
      <form onSubmit={criar} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <CampoTexto
            ref={campoNovaRef}
            id="categoria-nova"
            rotulo="Nova categoria"
            name="nomeCategoria"
            maxLength={NOME_CATEGORIA_TAMANHO_MAXIMO}
            placeholder="Monte seu prato, Bebidas, Sobremesas…"
            erro={erroNome}
            required
            onChange={() => erroNome !== null && setErroNome(null)}
          />
        </div>
        <Botao type="submit" disabled={ocupado}>
          {ocupado ? "Adicionando…" : "Adicionar categoria"}
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
