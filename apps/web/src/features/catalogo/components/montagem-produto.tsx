"use client";

import {
  grupoDeEscolhaUnica,
  grupoDeVariacaoBase,
  grupoObrigatorio,
  OBSERVACAO_ITEM_TAMANHO_MAXIMO,
  precoUnitarioComEscolhas,
  QUANTIDADE_MAXIMA_POR_ITEM,
  validarEscolhas,
  type GrupoOpcoesPublico,
  type ProdutoPublico,
} from "@jaa/contratos";
import { useMemo, useState } from "react";
import {
  IconeCesta,
  IconeCheck,
  IconeMais,
  IconeMenos,
} from "@/components/ui/icones";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";

/*
 * MONTAGEM DO PRODUTO: os grupos de opções que a EMPRESA cadastrou, um passo por bloco.
 *
 * Nada aqui é específico de comida: o componente só sabe que existem grupos com um intervalo de
 * escolhas. "Tamanho", "até 5 guarnições" e "apenas 1 carne" são conteúdo do cardápio — quem define
 * mínimo, máximo e acréscimo é a empresa.
 *
 * A regra é a MESMA do servidor (`validarEscolhas` e `precoUnitarioComEscolhas` de @jaa/contratos):
 * aqui ela serve para habilitar o botão, dizer o que falta e mostrar o preço enquanto a pessoa monta.
 * A autoridade continua sendo a API, que reexecuta tudo com os grupos do banco na confirmação.
 */

/*
 * Escolha única obrigatória já começa marcada na primeira opção: é o que a pessoa escolheria de todo
 * jeito, e evita um "falta escolher o tamanho" de largada. Fora daí, nada vem pré-selecionado.
 */
function escolhasIniciais(grupos: readonly GrupoOpcoesPublico[]): string[] {
  return grupos
    .flatMap((grupo) =>
      grupoObrigatorio(grupo) && grupoDeEscolhaUnica(grupo)
        ? [grupo.opcoes[0]?.id ?? ""]
        : [],
    )
    .filter((id) => id !== "");
}

export function MontagemProduto({
  produto,
  grupos,
  aoAdicionar,
}: {
  produto: ProdutoPublico;
  grupos: GrupoOpcoesPublico[];
  aoAdicionar: (
    opcaoIds: string[],
    quantidade: number,
    observacao: string | null,
  ) => void;
}) {
  const [escolhidas, setEscolhidas] = useState<string[]>(() =>
    escolhasIniciais(grupos),
  );
  const [quantidade, setQuantidade] = useState(1);
  // Observação pertence a ESTA unidade do item, não ao pedido: some ao reiniciar a montagem.
  const [observacao, setObservacao] = useState("");

  const validacao = useMemo(
    () => validarEscolhas(grupos, escolhidas),
    [grupos, escolhidas],
  );
  const precoUnitario = precoUnitarioComEscolhas(
    produto.precoCentavos,
    grupos,
    escolhidas,
  );
  const selecionadas = new Set(escolhidas);

  function alternar(grupo: GrupoOpcoesPublico, opcaoId: string) {
    setEscolhidas((atual) => {
      const noGrupo = grupo.opcoes
        .filter((opcao) => atual.includes(opcao.id))
        .map((opcao) => opcao.id);
      const foraDoGrupo = atual.filter(
        (id) => !grupo.opcoes.some((opcao) => opcao.id === id),
      );

      // Escolha única: a nova substitui a anterior (é o comportamento de um rádio).
      if (grupoDeEscolhaUnica(grupo)) return [...foraDoGrupo, opcaoId];

      if (noGrupo.includes(opcaoId))
        return [...foraDoGrupo, ...noGrupo.filter((id) => id !== opcaoId)];
      // No máximo, marcar mais uma não faz nada: o limite é do grupo, não um erro da pessoa.
      if (noGrupo.length >= grupo.maximoEscolhas) return atual;
      return [...foraDoGrupo, ...noGrupo, opcaoId];
    });
  }

  const escolhasSelecionadas = grupos.flatMap((grupo) =>
    grupo.opcoes
      .filter((opcao) => selecionadas.has(opcao.id))
      .map((opcao) => opcao.nome),
  );

  /*
   * Título do resumo: "Monte seu prato (Grande)". A variação entre parênteses é a opção da VARIAÇÃO
   * BASE (`grupoDeVariacaoBase`, em @jaa/contratos): regra derivada do modelo — primeiro grupo de
   * escolha única —, não um grupo com nome especial no código. A mesma distinção decide, abaixo,
   * qual grupo mostra preço final e quais mostram só acréscimo.
   */
  const grupoVariacao = grupoDeVariacaoBase(grupos);
  const variacao =
    grupoVariacao?.opcoes.find((opcao) => selecionadas.has(opcao.id))?.nome ??
    null;
  // No resumo detalhado a variação já aparece no título, então não se repete na lista.
  const demaisEscolhas = escolhasSelecionadas.filter(
    (nome) => nome !== variacao,
  );

  function adicionar() {
    const limpa = observacao.trim();
    aoAdicionar(escolhidas, quantidade, limpa === "" ? null : limpa);
    // Reinicia para a pessoa montar OUTRO item já em seguida, sem sair da tela.
    setEscolhidas(escolhasIniciais(grupos));
    setQuantidade(1);
    setObservacao("");
  }

  return (
    <div className="flex flex-col gap-2.5">
      {grupos.map((grupo, indice) => (
        <GrupoDeOpcoes
          key={grupo.id}
          grupo={grupo}
          passo={indice + 1}
          /*
           * Só a variação base recebe o preço do produto: é lá que cada alternativa É o item naquela
           * versão ("Pequeno R$ 17,00 / Grande R$ 20,00"). Nos outros grupos o preço do produto não
           * é passado, então a opção só pode mostrar o que acrescenta.
           */
          {...(grupo.id === grupoVariacao?.id
            ? { precoBaseCentavos: produto.precoCentavos }
            : {})}
          selecionadas={selecionadas}
          aoAlternar={(opcaoId) => alternar(grupo, opcaoId)}
        />
      ))}

      {/* Último passo antes do resumo: instrução de preparo DESTA unidade. */}
      <div className="rounded-jaa border border-borda bg-superficie p-3 shadow-cartao sm:p-4">
        <label
          htmlFor={`observacao-${produto.id}`}
          className="flex flex-wrap items-baseline gap-1.5 text-sm font-bold"
        >
          <span>{grupos.length + 1}. Observação</span>
          <span className="font-normal text-conteudo-suave">(opcional)</span>
        </label>
        <p className="mt-1 text-[11px] text-conteudo-suave">
          Vale só para este item; não é um recado do pedido inteiro.
        </p>
        <textarea
          id={`observacao-${produto.id}`}
          name="observacaoItem"
          value={observacao}
          maxLength={OBSERVACAO_ITEM_TAMANHO_MAXIMO}
          rows={2}
          placeholder="Sem cebola, carne bem passada…"
          onChange={(evento) => setObservacao(evento.target.value)}
          className="mt-3 w-full resize-y rounded-jaa-compacto border border-borda bg-superficie px-3 py-2 text-sm leading-relaxed placeholder:text-conteudo-suave/70"
        />
      </div>

      {/* Fecho da montagem: o que foi escolhido, o preço já somado e a ação. */}
      <div
        data-montagem-resumo
        className="grid gap-3 rounded-jaa border border-borda bg-superficie p-3 shadow-cartao sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-4"
      >
        <div className="min-w-0">
          <p className="text-xs font-bold">
            {produto.nome}
            {variacao && ` (${variacao})`}
          </p>
          {demaisEscolhas.length > 0 && (
            <p className="mt-0.5 text-[11px] leading-4 text-conteudo-suave [overflow-wrap:anywhere]">
              {demaisEscolhas.join(", ")}
            </p>
          )}
          {observacao.trim() !== "" && (
            <p
              data-observacao-resumo
              className="mt-0.5 text-[11px] italic leading-4 text-conteudo-suave [overflow-wrap:anywhere]"
            >
              “{observacao.trim()}”
            </p>
          )}
          <p
            data-preco-montagem
            className="fonte-display mt-1 text-sm font-bold text-marca"
          >
            {formatarPrecoCentavos(precoUnitario)}
          </p>
        </div>

        <div className="flex items-center gap-2 sm:justify-end">
          <Quantidade
            valor={quantidade}
            aoMudar={setQuantidade}
            rotulo={produto.nome}
          />
          <button
            type="button"
            data-adicionar-montagem
            disabled={!validacao.valido}
            onClick={adicionar}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-jaa-compacto bg-marca px-4 text-sm font-medium text-marca-conteudo shadow-suave transition-colors hover:bg-marca/90 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
          >
            <IconeCesta className="h-4 w-4" />
            Adicionar ao pedido
          </button>
        </div>

        {/* O que falta, dito com o nome do grupo: "faltam escolhas" sem dizer onde não ajuda ninguém. */}
        {!validacao.valido && (
          <p role="status" className="text-[11px] text-aviso sm:col-span-2">
            {mensagemDoQueFalta(validacao)}
          </p>
        )}
      </div>
    </div>
  );
}

function mensagemDoQueFalta(
  validacao: Exclude<ReturnType<typeof validarEscolhas>, { valido: true }>,
): string {
  const grupo = validacao.grupoNome ? `“${validacao.grupoNome}”` : "de opções";
  if (validacao.motivo === "faltam-escolhas")
    return `Escolha as opções obrigatórias do grupo ${grupo}.`;
  if (validacao.motivo === "escolhas-demais")
    return `Você passou do limite de escolhas do grupo ${grupo}.`;
  return "Alguma opção não está mais disponível. Monte o item de novo.";
}

/**
 * Um grupo. Escolha única usa RÁDIO, múltipla usa CAIXA — e o rótulo diz o limite em palavras, não só
 * pelo tipo do controle. Quando o máximo é alcançado, as opções não marcadas ficam desabilitadas:
 * é mais honesto do que aceitar o clique e desfazer em silêncio.
 *
 * O ARRANJO vem do tipo do grupo, não de um nome escrito no código:
 *
 *  - ESCOLHA ÚNICA em UMA LINHA horizontal (tamanho, tipo de carne): as alternativas se comparam de
 *    relance, lado a lado. Com poucas opções elas esticam e preenchem a linha; com muitas, a linha
 *    rola na horizontal — nunca quebra em duas colunas, porque aí a comparação se perde;
 *  - MÚLTIPLA ESCOLHA em DUAS COLUNAS (guarnições): são muitas e curtas, e duas colunas fazem a
 *    lista caber sem rolagem infinita. O contador mostra quanto ainda cabe.
 */
function GrupoDeOpcoes({
  grupo,
  passo,
  precoBaseCentavos,
  selecionadas,
  aoAlternar,
}: {
  grupo: GrupoOpcoesPublico;
  passo: number;
  /*
   * Presente SOMENTE na variação base (ver `grupoDeVariacaoBase`): com o preço do produto em mão, a
   * opção mostra o preço FINAL daquela versão. Ausente, ela mostra apenas o acréscimo — e nada
   * quando o acréscimo é zero.
   */
  precoBaseCentavos?: number;
  selecionadas: Set<string>;
  aoAlternar: (opcaoId: string) => void;
}) {
  const unica = grupoDeEscolhaUnica(grupo);
  const marcadas = grupo.opcoes.filter((opcao) =>
    selecionadas.has(opcao.id),
  ).length;
  const noLimite = !unica && marcadas >= grupo.maximoEscolhas;

  const tituloId = `grupo-${grupo.id}-titulo`;

  return (
    /*
     * `div role="group" + aria-labelledby` no lugar de `fieldset/legend`.
     *
     * O `<legend>` é posicionado pelo navegador NA BORDA do fieldset, não dentro da caixa de
     * padding: era isso que fazia o título "sair" do card, sobrepondo o contorno. `role="group"`
     * com `aria-labelledby` dá exatamente a mesma semântica de agrupamento para leitor de tela,
     * sem o posicionamento especial — título, regra, contador e opções ficam no MESMO card.
     *
     * `min-w-0` porque o card é filho de coluna flex: sem ele, o conteúdo mínimo das opções
     * empurraria a largura do card para fora da coluna em vez de rolar internamente.
     */
    <div
      role="group"
      aria-labelledby={tituloId}
      data-grupo-opcoes={grupo.id}
      className="min-w-0 rounded-jaa border border-borda bg-superficie p-3 shadow-cartao sm:p-4"
    >
      {/* Passo numerado com a REGRA ao lado, como na referência ("2. Guarnições (até 5)"). */}
      <p
        id={tituloId}
        className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-sm font-bold"
      >
        <span>
          {passo}. {grupo.nome}
        </span>
        <span className="font-normal text-conteudo-suave">
          {regraDoGrupo(grupo)}
        </span>
        {/* Contador só na múltipla escolha: na única, "1 de 1" não informa nada. */}
        {!unica && (
          <span
            data-contador-grupo
            className={`font-normal ${noLimite ? "text-aviso" : "text-conteudo-suave"}`}
          >
            · {marcadas}/{grupo.maximoEscolhas}{" "}
            {marcadas === 1 ? "selecionada" : "selecionadas"}
          </span>
        )}
      </p>
      {grupo.instrucao && (
        <p className="mt-1 text-[11px] text-conteudo-suave">
          {grupo.instrucao}
        </p>
      )}

      <div
        className={
          unica
            ? /*
               * UMA LINHA sempre: `flex-nowrap` impede a quebra e `overflow-x-auto` faz a rolagem
               * acontecer AQUI DENTRO, não na página. `min-w-0` deixa esta faixa encolher até a
               * largura do card — sem ele, o conteúdo mínimo dos cartões vazaria para fora.
               * As margens negativas colam a rolagem na borda do card sem cortar o contorno da opção.
               */
              "-mx-1 mt-3 flex min-w-0 max-w-full flex-nowrap gap-2 overflow-x-auto px-1 pb-1"
            : "mt-3 grid grid-cols-2 gap-2"
        }
      >
        {grupo.opcoes.map((opcao) => {
          const marcada = selecionadas.has(opcao.id);
          return (
            <label
              key={opcao.id}
              data-opcao={opcao.id}
              /*
               * O controle nativo continua existindo (só fica fora da vista): teclado, leitor de tela
               * e o próprio grupo do rádio funcionam como sempre. O desenho vem de `group-has-[:checked]`,
               * então não há estado duplicado nem div fingindo ser input.
               */
              className={`group/opcao cursor-pointer items-center rounded-jaa-compacto border border-borda transition-colors has-[:checked]:border-selecionado-borda has-[:checked]:bg-selecionado-fundo has-[:checked]:font-medium has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 [&:not(:has(:checked)):hover]:bg-superficie-suave has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-marca ${
                unica
                  ? /*
                     * Cartão da linha horizontal: `basis-36` dá o tamanho de partida, `grow` estica
                     * quando sobra espaço (2 tamanhos ocupam a linha) e `shrink-0` garante que ele
                     * nunca seja espremido — quando não cabe, a faixa rola em vez de amassar.
                     */
                    "flex min-h-16 shrink-0 grow basis-36 gap-2.5 px-3 text-sm"
                  : "grid min-h-12 grid-cols-[1rem_minmax(0,1fr)_auto] gap-2.5 px-3 text-sm sm:min-h-11"
              }`}
            >
              <input
                type={unica ? "radio" : "checkbox"}
                name={`grupo-${grupo.id}`}
                value={opcao.id}
                checked={marcada}
                disabled={noLimite && !marcada}
                onChange={() => aoAlternar(opcao.id)}
                className="peer sr-only"
              />
              {unica ? (
                <span
                  aria-hidden
                  className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-borda group-has-[:checked]/opcao:border-marca"
                >
                  <span className="h-2 w-2 rounded-full bg-marca opacity-0 group-has-[:checked]/opcao:opacity-100" />
                </span>
              ) : (
                <span
                  aria-hidden
                  className="grid h-4 w-4 shrink-0 place-items-center rounded-[3px] border border-borda text-marca-conteudo group-has-[:checked]/opcao:border-marca group-has-[:checked]/opcao:bg-marca"
                >
                  <IconeCheck className="h-3 w-3 opacity-0 group-has-[:checked]/opcao:opacity-100" />
                </span>
              )}
              {unica ? (
                /*
                 * Nome sobre o valor. Na VARIAÇÃO BASE o valor é o preço FINAL daquela versão
                 * ("Pequeno R$ 17,00 / Grande R$ 20,00"): é ele que a pessoa compara ao escolher, e
                 * é ele que o resumo passa a mostrar. Nos demais grupos de escolha única (o tipo de
                 * carne, por exemplo) o valor é só o ACRÉSCIMO, e opção sem acréscimo não exibe
                 * valor nenhum — nem "R$ 0,00", nem o total do item repetido.
                 * Apresentação apenas: o dinheiro vem de `precoUnitarioComEscolhas`, e a autoridade
                 * continua sendo o servidor.
                 */
                <span className="flex min-w-0 flex-col">
                  <span className="text-xs font-bold [overflow-wrap:anywhere]">
                    {opcao.nome}
                  </span>
                  {precoBaseCentavos === undefined ? (
                    opcao.precoAdicionalCentavos > 0 && (
                      <span className="mt-0.5 text-sm font-bold text-marca">
                        +{formatarPrecoCentavos(opcao.precoAdicionalCentavos)}
                      </span>
                    )
                  ) : (
                    <span className="mt-0.5 text-sm font-bold text-marca">
                      {formatarPrecoCentavos(
                        precoBaseCentavos + opcao.precoAdicionalCentavos,
                      )}
                    </span>
                  )}
                </span>
              ) : (
                <>
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {opcao.nome}
                  </span>
                  {opcao.precoAdicionalCentavos > 0 && (
                    <span className="shrink-0 text-xs font-bold text-marca">
                      +{formatarPrecoCentavos(opcao.precoAdicionalCentavos)}
                    </span>
                  )}
                </>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** A regra do grupo em português, derivada só de mínimo e máximo (nunca de um rótulo no código). */
function regraDoGrupo(grupo: GrupoOpcoesPublico): string {
  if (grupoDeEscolhaUnica(grupo))
    return grupoObrigatorio(grupo)
      ? "(escolha 1)"
      : "(escolha até 1, opcional)";
  if (grupo.minimoEscolhas === 0)
    return `(até ${grupo.maximoEscolhas}, opcional)`;
  if (grupo.minimoEscolhas === grupo.maximoEscolhas)
    return `(escolha ${grupo.minimoEscolhas})`;
  return `(de ${grupo.minimoEscolhas} a ${grupo.maximoEscolhas})`;
}

/** Quantidade inteira, entre 1 e o limite do contrato. Os botões evitam teclado no celular. */
function Quantidade({
  valor,
  aoMudar,
  rotulo,
}: {
  valor: number;
  aoMudar: (quantidade: number) => void;
  rotulo: string;
}) {
  const limitar = (quantidade: number) =>
    Math.min(Math.max(Math.trunc(quantidade), 1), QUANTIDADE_MAXIMA_POR_ITEM);
  return (
    <span className="flex h-10 shrink-0 items-center rounded-jaa-compacto border border-borda">
      <button
        type="button"
        aria-label={`Diminuir quantidade de ${rotulo}`}
        onClick={() => aoMudar(limitar(valor - 1))}
        className="grid h-9 w-9 place-items-center rounded-jaa-compacto text-conteudo-suave transition-colors hover:bg-realce"
      >
        <IconeMenos className="h-4 w-4" />
      </button>
      <span
        data-quantidade-montagem
        className="w-7 text-center text-sm font-bold"
      >
        {valor}
      </span>
      <button
        type="button"
        aria-label={`Aumentar quantidade de ${rotulo}`}
        onClick={() => aoMudar(limitar(valor + 1))}
        className="grid h-9 w-9 place-items-center rounded-jaa-compacto text-conteudo-suave transition-colors hover:bg-realce"
      >
        <IconeMais className="h-4 w-4" />
      </button>
    </span>
  );
}
