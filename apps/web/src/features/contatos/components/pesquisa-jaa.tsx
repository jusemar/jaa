"use client";

import {
  TERMO_BUSCA_TAMANHO_MINIMO,
  type IntencaoProfissional,
  type ResultadoBusca,
} from "@jaa/contratos";
import { useEffect, useRef, useState } from "react";
import { AvatarIdentidade } from "@/components/avatar-identidade";
import { IconeBusca, IconeSeta } from "@/components/ui/icones";
import { BuscaProfissionais } from "@/features/busca-profissionais/components/busca-profissionais";
import { listarIntencoesProfissionais } from "@/features/busca-profissionais/lib/api-busca-profissionais";
import { modoDaPesquisa } from "@/features/busca-profissionais/lib/apresentacao-busca";
import { pesquisarNoJaa, salvarContato } from "../lib/api-contatos";
import { ROTULO_FILTRO_PESQUISA, filtrosDaPesquisa, organizarResultados, textoSemResultados, type FiltroPesquisa } from "../lib/pesquisa-jaa";

/**
 * PESQUISAR NO JAA — busca única da área de conversas.
 *
 * Substituiu a antiga "Encontrar empresa (técnico)" e o campo separado de @usuario: aqui se procura
 * pessoa OU empresa, nos MEUS CONTATOS primeiro e depois no Jaa. Tocar no resultado abre a conversa —
 * não existe botão "Abrir conversa".
 *
 * O telefone nunca aparece nos resultados; por telefone só é encontrado quem optou por isso.
 *
 * Com `comProfissionais` (Conversas): "@joao" é só a busca de pessoas/empresas; SEM @ a busca de
 * pessoas continua igual e, se o texto for uma atividade do catálogo ("motoboy"), aparece também
 * a atividade em "Profissionais". Texto ambíguo ("moto") lista as opções: quem escolhe é a pessoa.
 *
 * COMO APARECE: logo abaixo do campo, filtros compactos (Tudo · Pessoas · Profissionais · Empresas) e
 * os resultados agrupados pelo TIPO — Profissionais (só o nome da atividade), Empresas e Pessoas.
 * Tocar numa atividade abre a busca de profissionais de sempre (local, raio, pesquisar, selecionar).
 */
const ESPERA_DIGITACAO_MS = 300;

export function PesquisaJaa({
  aoAbrirConversa,
  aoSalvarContato,
  comProfissionais = false,
}: {
  aoAbrirConversa: (nomeUsuario: string) => void;
  aoSalvarContato?: () => void;
  comProfissionais?: boolean;
}) {
  const [termo, setTermo] = useState("");
  const [resultado, setResultado] = useState<{
    contatos: ResultadoBusca[];
    externos: ResultadoBusca[];
  } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [intencoes, setIntencoes] = useState<IntencaoProfissional[]>([]);
  const [intencaoAberta, setIntencaoAberta] = useState<IntencaoProfissional | null>(null);
  // Recorte de leitura dos resultados que já vieram: trocar de filtro não consulta nada.
  const [filtro, setFiltro] = useState<FiltroPesquisa>("tudo");
  const requisicaoAtual = useRef(0);

  // Debounce: digitar não vira uma consulta por tecla.
  const termoProcurado = termo.trim();
  const termoValido = termoProcurado.length >= TERMO_BUSCA_TAMANHO_MINIMO;
  const procurarProfissionais = comProfissionais && modoDaPesquisa(termoProcurado) === "livre";

  useEffect(() => {
    if (!termoValido) {
      // Limpar fora do caminho síncrono do efeito evita renderizações em cascata.
      const limpeza = setTimeout(() => {
        setResultado(null);
        setIntencoes([]);
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
      // Intenções profissionais: pedido separado, com seu próprio resultado (não mexe no limite de pessoas).
      if (procurarProfissionais) {
        void listarIntencoesProfissionais(termoProcurado).then((resposta) => {
          if (marca !== requisicaoAtual.current) return;
          setIntencoes(resposta.ok ? resposta.dados.intencoes : []);
        });
      } else setIntencoes([]);
    }, ESPERA_DIGITACAO_MS);

    return () => clearTimeout(temporizador);
  }, [termoProcurado, termoValido, procurarProfissionais]);

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

  const organizados = organizarResultados(resultado, intencoes, filtro);
  const semResultados = resultado !== null && !buscando && organizados.vazio;

  return (
    <search className="flex flex-col gap-2">
      {/* Campo suave com o ícone à esquerda, como na referência de UI/UX aprovada. */}
      {/* Mesma superfície clara da navegação; a borda desenha o campo, sem um cinza só daqui. */}
      <label className="flex min-h-11 items-center gap-2 rounded-jaa-compacto border border-borda bg-superficie px-3 text-conteudo-suave focus-within:ring-2 focus-within:ring-marca/30 sm:min-h-10">
        <span className="sr-only">Pesquisar no Jaaa</span>
        <IconeBusca className="h-4 w-4 shrink-0" />
        <input
          type="search"
          name="pesquisaJaa"
          value={termo}
          onChange={(evento) => setTermo(evento.target.value)}
          placeholder="Pesquisar no Jaaa"
          aria-label="Pesquisar no Jaaa"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-sm text-conteudo outline-none placeholder:text-conteudo-suave"
        />
      </label>

      {/* Filtros compactos: aparecem com a busca e cabem na coluna estreita (quebram de linha se preciso). */}
      {termoValido && (
        <div role="tablist" aria-label="Filtrar resultados da pesquisa" className="flex flex-wrap gap-1.5">
          {filtrosDaPesquisa(comProfissionais).map((opcao) => {
            const ativo = filtro === opcao;
            return (
              <button
                key={opcao}
                type="button"
                role="tab"
                aria-selected={ativo}
                data-filtro-pesquisa={opcao}
                onClick={() => setFiltro(opcao)}
                className={`flex min-h-8 items-center rounded-full border px-2.5 text-xs font-medium transition-colors ${
                  ativo ? "border-marca bg-marca-suave text-marca-suave-conteudo" : "border-borda text-conteudo-suave hover:bg-realce hover:text-conteudo"
                }`}
              >
                {ROTULO_FILTRO_PESQUISA[opcao]}
              </button>
            );
          })}
        </div>
      )}

      {buscando && <p className="px-1 text-xs text-conteudo-suave">Procurando…</p>}
      {semResultados && <p className="px-1 text-xs text-conteudo-suave">{textoSemResultados(termoProcurado, filtro)}</p>}

      {organizados.profissionais.length > 0 && (
        <div data-intencoes-profissionais className="flex flex-col gap-1">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-conteudo-suave">Profissionais</p>
          <ul aria-label="Profissionais" className="flex flex-col divide-y divide-borda overflow-hidden rounded-xl border border-borda bg-superficie">
            {organizados.profissionais.map((intencao) => (
              <li key={`${intencao.servicoId}|${intencao.especialidadeId ?? ""}|${intencao.opcaoId ?? ""}`}>
                {/* Só o nome da atividade: tocar abre a busca de profissionais (local, raio, pesquisar). */}
                <button
                  type="button"
                  data-intencao-profissional={intencao.rotulo}
                  aria-label={`Procurar ${intencao.rotulo}`}
                  onClick={() => setIntencaoAberta(intencao)}
                  className="flex min-h-12 w-full items-center gap-2.5 px-3 text-left text-sm font-medium text-conteudo hover:bg-superficie-suave focus-visible:bg-superficie-suave focus-visible:outline-2"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-marca-suave text-marca">
                    <IconeBusca className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{intencao.rotulo}</span>
                  <IconeSeta className="h-4 w-4 shrink-0 text-conteudo-suave" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {intencaoAberta && <BuscaProfissionais intencao={intencaoAberta} aoFechar={() => setIntencaoAberta(null)} aoAbrirConversa={aoAbrirConversa} />}

      {organizados.empresas.length > 0 && (
        <GrupoResultados titulo="Empresas" itens={organizados.empresas} aoAbrirConversa={aoAbrirConversa} aoSalvar={(item) => void salvar(item)} salvando={salvando} />
      )}
      {organizados.pessoas.length > 0 && (
        <GrupoResultados titulo="Pessoas" itens={organizados.pessoas} aoAbrirConversa={aoAbrirConversa} aoSalvar={(item) => void salvar(item)} salvando={salvando} />
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
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-conteudo">
                  <span className="truncate">{item.apelido ?? item.identidade.nomeExibicao}</span>
                  {/* O grupo já diz se é empresa ou pessoa; o selo marca quem já está na MINHA agenda. */}
                  {item.ehContato && (
                    <span data-ja-e-contato className="shrink-0 rounded-full bg-marca-suave px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-marca-suave-conteudo">
                      Contato
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
