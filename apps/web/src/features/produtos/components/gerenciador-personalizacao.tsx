"use client";

import { MAXIMO_GRUPOS_POR_PRODUTO, type GrupoOpcoesProduto } from "@jaa/contratos";
import { useEffect, useState } from "react";
import { avisar } from "@/components/ui/avisos";
import { DialogoConfirmacao } from "@/components/ui/confirmacao";
import { IconeCalendario, IconeCamadas, IconeMais, IconeSeta } from "@/components/ui/icones";
import { MenuMais } from "@/components/ui/menu-mais";
import { Aviso, Carregando, Selo } from "@/components/ui/primitivos";
import { resumoDoGrupo } from "../lib/edicao-semana";
import { regraEmPalavras } from "../lib/regra-do-grupo";
import { listarGruposOpcoes, removerGrupoOpcoes } from "../lib/api-personalizacao";
import { EditorDeGrupo } from "./editor-de-grupo";

/*
 * GRUPOS DE OPÇÕES do produto, administrados pela EMPRESA — é aqui que "Tamanho", "Guarnições (até 5)"
 * e "Tipo de carne (apenas 1)" nascem. Nada disso está escrito no Jaa: são grupos que a empresa
 * cadastra, com o mínimo e o máximo que ela quiser.
 *
 * Na página do produto aparece só o RESUMO: um cartão por grupo (nome, regra, quantas opções, se é
 * semanal, se há problema). Tocar no cartão abre o editor do grupo; excluir fica no menu ⋯.
 *
 * Só existe para produto JÁ SALVO: um grupo pertence a um produto. Toda operação devolve a lista
 * completa (a API já responde assim), então a tela nunca fica diferente do banco, e o resumo usa só
 * essa lista: nenhuma consulta a mais por grupo.
 */

export function GerenciadorPersonalizacao({
  empresaId,
  produtoId,
  aoMudarGrupos,
}: {
  empresaId: string;
  produtoId: string;
  // A página do produto mostra os grupos também na prévia do cliente.
  aoMudarGrupos?: (grupos: GrupoOpcoesProduto[]) => void;
}) {
  const [grupos, setGrupos] = useState<GrupoOpcoesProduto[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Um editor por vez. `abertura` muda a cada abertura: o editor recomeça do zero, mas NÃO recomeça
  // quando o grupo novo ganha id no meio de um salvamento.
  const [aberto, setAberto] = useState<{ abertura: number; grupoId: string | null } | null>(null);
  const [excluindo, setExcluindo] = useState<GrupoOpcoesProduto | null>(null);

  function adotar(lista: GrupoOpcoesProduto[]) {
    setGrupos(lista);
    aoMudarGrupos?.(lista);
  }

  useEffect(() => {
    let ativo = true;
    void listarGruposOpcoes(empresaId, produtoId).then((resultado) => {
      if (!ativo) return;
      if (resultado.ok) {
        setGrupos(resultado.dados.grupos);
        aoMudarGrupos?.(resultado.dados.grupos);
      } else setErro(resultado.mensagem);
    });
    return () => {
      ativo = false;
    };
    // `aoMudarGrupos` é só o aviso à página: não é motivo para reler os grupos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, produtoId]);

  if (grupos === null && !erro) return <Carregando texto="Carregando os grupos de opções…" />;

  const lista = grupos ?? [];
  const grupoAberto = aberto?.grupoId ? (lista.find((grupo) => grupo.id === aberto.grupoId) ?? null) : null;
  const abrir = (grupoId: string | null) => setAberto((atual) => ({ abertura: (atual?.abertura ?? 0) + 1, grupoId }));

  return (
    <section aria-label="Grupos de opções" data-grupos-de-opcoes className="flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <h2 className="fonte-display flex items-center gap-2.5 text-base font-semibold">
          <IconeCamadas className="h-[1.125rem] w-[1.125rem] text-conteudo-suave" />
          Grupos de opções
        </h2>
        <Selo>{lista.length === 1 ? "1 grupo" : `${lista.length} grupos`}</Selo>
      </div>
      <p className="mt-1.5 text-sm text-conteudo-suave">
        Personalizações que o cliente pode escolher ao pedir.{lista.length === 0 ? " Sem nenhum grupo, o produto é adicionado direto ao pedido." : ""}
      </p>

      <ListaDeGrupos grupos={lista} ocupado={ocupado} aoAbrir={abrir} aoPedirExcluir={setExcluindo} />

      {lista.length < MAXIMO_GRUPOS_POR_PRODUTO ? (
        <button
          type="button"
          data-novo-grupo
          disabled={ocupado}
          onClick={() => abrir(null)}
          className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-jaa border border-dashed border-borda bg-superficie px-4 text-sm font-medium text-marca shadow-suave transition-colors hover:border-marca hover:bg-marca-suave/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IconeMais className="h-4 w-4" />
          Adicionar grupo de opções
        </button>
      ) : (
        <div className="mt-3">
          <Aviso tom="atencao">Este produto já tem o máximo de {MAXIMO_GRUPOS_POR_PRODUTO} grupos de opções.</Aviso>
        </div>
      )}

      {erro && !excluindo && (
        <div className="mt-3">
          <Aviso tom="erro">{erro}</Aviso>
        </div>
      )}

      {aberto && (aberto.grupoId === null || grupoAberto) && (
        <EditorDeGrupo
          key={aberto.abertura}
          empresaId={empresaId}
          produtoId={produtoId}
          grupo={grupoAberto}
          idsDosGrupos={lista.map((grupo) => grupo.id)}
          aoFechar={() => setAberto(null)}
          aoGrupos={adotar}
          aoCriado={(grupoId) => setAberto((atual) => (atual ? { ...atual, grupoId } : atual))}
          aoMudarAtivacao={(grupoId, ativa) => adotar(lista.map((item) => (item.id === grupoId ? { ...item, programacaoSemanal: ativa } : item)))}
          aoPedirExcluir={setExcluindo}
        />
      )}

      {excluindo && (
        <DialogoConfirmacao
          titulo="Excluir grupo de opções?"
          texto={`“${excluindo.nome}” e as opções dele serão removidos deste produto, incluindo a programação semanal. Pedidos já feitos não mudam.`}
          rotuloConfirmar="Excluir grupo"
          perigosa
          ocupado={ocupado}
          erro={erro}
          dados={{ "data-confirmar-acao": "apagar-grupo" }}
          aoCancelar={() => {
            setErro(null);
            setExcluindo(null);
          }}
          aoConfirmar={() => {
            setErro(null);
            setOcupado(true);
            void removerGrupoOpcoes(empresaId, produtoId, excluindo.id)
              .then((resultado) => {
                if (!resultado.ok) {
                  setErro(resultado.mensagem);
                  return;
                }
                setAberto(null);
                setExcluindo(null);
                adotar(resultado.dados.grupos);
                avisar.sucesso("Grupo excluído");
              })
              .finally(() => setOcupado(false));
          }}
        />
      )}
    </section>
  );
}

/**
 * Um CARTÃO por grupo. O cartão inteiro abre a edição (a seta só reforça o gesto); o menu ⋯, ao lado,
 * guarda o que apaga. Tudo o que aparece vem da lista de grupos já carregada.
 */
export function ListaDeGrupos({
  grupos,
  ocupado,
  aoAbrir,
  aoPedirExcluir,
}: {
  grupos: GrupoOpcoesProduto[];
  ocupado: boolean;
  aoAbrir: (grupoId: string) => void;
  aoPedirExcluir: (grupo: GrupoOpcoesProduto) => void;
}) {
  if (grupos.length === 0) return null;
  return (
    <ul data-lista-de-grupos className="mt-1 flex flex-col">
      {grupos.map((grupo) => {
        const resumo = resumoDoGrupo(grupo);
        return (
          <li key={grupo.id} data-grupo-admin={grupo.id} className="mt-3 flex items-center gap-1 rounded-jaa border border-borda bg-superficie py-1 pl-3 pr-1 shadow-cartao transition-colors hover:border-marca sm:pl-4 sm:pr-2 lg:gap-2">
            <button type="button" data-abrir-grupo aria-label={`Editar ${grupo.nome}`} onClick={() => aoAbrir(grupo.id)} className="flex min-h-16 min-w-0 flex-1 items-center gap-3.5 rounded-jaa-compacto py-3 text-left">
              {/* O símbolo é só ornamento: some onde a largura é do conteúdo. */}
              <span aria-hidden className="hidden h-10 w-10 shrink-0 place-items-center rounded-jaa-compacto bg-superficie-suave text-conteudo-suave lg:grid">
                <IconeCamadas className="h-[1.125rem] w-[1.125rem]" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="fonte-display text-[15px] font-semibold leading-tight [overflow-wrap:anywhere] sm:text-sm">{grupo.nome}</span>
                <span className="text-xs text-conteudo-suave">{regraEmPalavras(grupo)}</span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="text-[11px] text-conteudo-suave">{resumo.total === 1 ? "1 opção" : `${resumo.total} opções`}</span>
                  {resumo.semanal && (
                    <span data-selo-semanal className="inline-flex items-center gap-1 rounded-jaa-compacto bg-marca-suave px-1.5 py-1 text-[11px] font-medium leading-none text-marca-suave-conteudo">
                      <IconeCalendario className="h-3 w-3" />
                      Semanal
                    </span>
                  )}
                  {resumo.indisponiveis > 0 && !resumo.problema && <Selo>{resumo.indisponiveis === 1 ? "1 indisponível" : `${resumo.indisponiveis} indisponíveis`}</Selo>}
                  {resumo.problema && <Selo tom="atencao">{resumo.problema}</Selo>}
                </span>
              </span>
              <IconeSeta className="mx-2 h-4 w-4 shrink-0 text-conteudo-suave" />
            </button>
            <MenuMais rotulo={`Ações de ${grupo.nome}`} disabled={ocupado} itens={[{ id: "apagar-grupo", rotulo: "Excluir grupo", perigosa: true, aoEscolher: () => aoPedirExcluir(grupo) }]} />
          </li>
        );
      })}
    </ul>
  );
}
