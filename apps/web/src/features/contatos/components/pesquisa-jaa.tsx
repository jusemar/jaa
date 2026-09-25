"use client";

import {
  TERMO_BUSCA_TAMANHO_MINIMO,
  type ResultadoBusca,
} from "@jaa/contratos";
import { useEffect, useRef, useState } from "react";
import { AvatarIdentidade } from "@/components/avatar-identidade";
import { IconeBusca } from "@/components/ui/icones";
import { pesquisarNoJaa, salvarContato } from "../lib/api-contatos";

/**
 * PESQUISAR NO JAA — busca única da área de conversas.
 *
 * Substituiu a antiga "Encontrar empresa (técnico)" e o campo separado de @usuario: aqui se procura
 * pessoa OU empresa, nos MEUS CONTATOS primeiro e depois no Jaa. Tocar no resultado abre a conversa —
 * não existe botão "Abrir conversa".
 *
 * O telefone nunca aparece nos resultados; por telefone só é encontrado quem optou por isso.
 */
const ESPERA_DIGITACAO_MS = 300;

export function PesquisaJaa({
  aoAbrirConversa,
  aoSalvarContato,
}: {
  aoAbrirConversa: (nomeUsuario: string) => void;
  aoSalvarContato?: () => void;
}) {
  const [termo, setTermo] = useState("");
  const [resultado, setResultado] = useState<{
    contatos: ResultadoBusca[];
    externos: ResultadoBusca[];
  } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const requisicaoAtual = useRef(0);

  // Debounce: digitar não vira uma consulta por tecla.
  const termoProcurado = termo.trim();
  const termoValido = termoProcurado.length >= TERMO_BUSCA_TAMANHO_MINIMO;

  useEffect(() => {
    if (!termoValido) {
      // Limpar fora do caminho síncrono do efeito evita renderizações em cascata.
      const limpeza = setTimeout(() => {
        setResultado(null);
        setBuscando(false);
      }, 0);
      return () => clearTimeout(limpeza);
    }

    const marca = ++requisicaoAtual.current;
    const temporizador = setTimeout(() => {
      setBuscando(true);
      void pesquisarNoJaa(termoProcurado).then((resposta) => {
        // Resposta de uma digitação antiga não sobrescreve a atual.
        if (marca !== requisicaoAtual.current) return;
        setBuscando(false);
        if (resposta.ok) {
          setResultado(resposta.dados);
          setErro(null);
        } else setErro(resposta.mensagem);
      });
    }, ESPERA_DIGITACAO_MS);

    return () => clearTimeout(temporizador);
  }, [termoProcurado, termoValido]);

  async function salvar(item: ResultadoBusca) {
    setSalvando(item.identidade.identidadeId);
    try {
      const resposta = await salvarContato(item.identidade.identidadeId);
      if (!resposta.ok) {
        setErro(resposta.mensagem);
        return;
      }
      setErro(null);
      aoSalvarContato?.();
      // Passa a constar como contato sem precisar refazer a busca.
      setResultado((atual) =>
        atual
          ? {
              contatos: [
                { ...item, ehContato: true },
                ...atual.contatos.filter(
                  (outro) =>
                    outro.identidade.identidadeId !==
                    item.identidade.identidadeId,
                ),
              ],
              externos: atual.externos.filter(
                (outro) =>
                  outro.identidade.identidadeId !==
                  item.identidade.identidadeId,
              ),
            }
          : atual,
      );
    } finally {
      setSalvando(null);
    }
  }

  const semResultados =
    resultado !== null &&
    resultado.contatos.length === 0 &&
    resultado.externos.length === 0 &&
    !buscando;

  return (
    <search className="flex flex-col gap-2">
      {/* Campo suave com o ícone à esquerda, como na referência de UI/UX aprovada. */}
      {/* Mesma superfície clara da navegação; a borda desenha o campo, sem um cinza só daqui. */}
      <label className="flex min-h-11 items-center gap-2 rounded-jaa-compacto border border-borda bg-superficie px-3 text-conteudo-suave focus-within:ring-2 focus-within:ring-marca/30 sm:min-h-10">
        <span className="sr-only">Pesquisar no Jaa</span>
        <IconeBusca className="h-4 w-4 shrink-0" />
        <input
          type="search"
          name="pesquisaJaa"
          value={termo}
          onChange={(evento) => setTermo(evento.target.value)}
          placeholder="Pesquisar no Jaa"
          aria-label="Pesquisar no Jaa"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-sm text-conteudo outline-none placeholder:text-conteudo-suave"
        />
      </label>

      {buscando && (
        <p className="px-1 text-xs text-conteudo-suave">Procurando…</p>
      )}
      {semResultados && (
        <p className="px-1 text-xs text-conteudo-suave">
          Nada encontrado para “{termo.trim()}”.
        </p>
      )}

      {resultado && resultado.contatos.length > 0 && (
        <GrupoResultados
          titulo="Meus contatos"
          itens={resultado.contatos}
          aoAbrirConversa={aoAbrirConversa}
        />
      )}
      {resultado && resultado.externos.length > 0 && (
        <GrupoResultados
          titulo="No Jaa"
          itens={resultado.externos}
          aoAbrirConversa={aoAbrirConversa}
          aoSalvar={(item) => void salvar(item)}
          salvando={salvando}
        />
      )}

      {erro && (
        <p role="alert" className="px-1 text-xs text-perigo">
          {erro}
        </p>
      )}
    </search>
  );
}

function GrupoResultados({
  titulo,
  itens,
  aoAbrirConversa,
  aoSalvar,
  salvando,
}: {
  titulo: string;
  itens: ResultadoBusca[];
  aoAbrirConversa: (nomeUsuario: string) => void;
  aoSalvar?: (item: ResultadoBusca) => void;
  salvando?: string | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-conteudo-suave">
        {titulo}
      </p>
      <ul
        aria-label={titulo}
        className="flex flex-col divide-y divide-borda overflow-hidden rounded-xl border border-borda bg-superficie"
      >
        {itens.map((item) => (
          <li
            key={item.identidade.identidadeId}
            data-resultado-busca={item.identidade.identidadeId}
            className="flex items-center gap-2 px-2"
          >
            {/* Tocar no resultado abre a conversa: sem botão "Abrir conversa". */}
            <button
              type="button"
              onClick={() => aoAbrirConversa(item.identidade.nomeUsuario)}
              className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-1 text-left hover:bg-superficie-suave focus-visible:bg-superficie-suave focus-visible:outline-2"
            >
              <AvatarIdentidade identidade={item.identidade} />
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1.5 truncate text-sm font-medium text-conteudo">
                  {item.apelido ?? item.identidade.nomeExibicao}
                  {item.identidade.tipo === "empresarial" && (
                    <span className="rounded-full bg-ouro/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-aviso">
                      Empresa
                    </span>
                  )}
                </span>
                <span className="truncate text-xs text-conteudo-suave">
                  @{item.identidade.nomeUsuario}
                </span>
              </span>
            </button>
            {aoSalvar && !item.ehContato && (
              <button
                type="button"
                data-salvar-contato={item.identidade.identidadeId}
                disabled={salvando === item.identidade.identidadeId}
                onClick={() => aoSalvar(item)}
                aria-label={`Salvar ${item.identidade.nomeExibicao} nos contatos`}
                className="shrink-0 rounded-jaa-compacto border border-borda px-3 py-1.5 text-xs font-medium text-conteudo transition-colors hover:bg-realce disabled:opacity-50"
              >
                Salvar
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
