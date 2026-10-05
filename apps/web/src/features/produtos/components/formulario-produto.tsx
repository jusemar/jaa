"use client";

import { DESCRICAO_PRODUTO_TAMANHO_MAXIMO, DIAS_SEMANA, NOME_PRODUTO_TAMANHO_MAXIMO, ROTULO_DIA_SEMANA, grupoObrigatorio, type CategoriaProduto, type DisponibilidadeProduto, type GrupoOpcoesProduto, type Produto } from "@jaa/contratos";
import { useRef, useState, type FormEvent } from "react";
import { IconeCalendario, IconeCheck, IconeDocumento, IconeImagem, IconeOlho, IconeVoltar } from "@/components/ui/icones";
import { Aviso, Botao, CampoSelecao, CampoTexto, CampoTextoLongo } from "@/components/ui/primitivos";
import { centavosParaCampo, formatarPrecoCentavos, interpretarPrecoDigitado } from "../lib/precos";
import { CabecalhoDaPagina } from "./cabecalho-pagina";
import { GerenciadorPersonalizacao } from "./gerenciador-personalizacao";
import { PreviaDoCliente } from "./previa-do-cliente";

/*
 * EDITAR PRODUTO — tela própria, separada da listagem.
 *
 * Duas composições da mesma tela:
 *  - celular: uma coluna, os campos direto na página (sem cartão em volta), "Prévia" e "Catálogo" no
 *    topo e "Salvar produto" preso acima da navegação — a ação principal nunca sai do alcance;
 *  - a partir de `lg`: o formulário e os grupos à esquerda e, à direita, "No cardápio do cliente",
 *    que acompanha o que está sendo digitado.
 *
 * A imagem e os grupos de opções só existem para produto JÁ SALVO (ficam guardados sob o id dele): num
 * produto novo os dois blocos explicam isso em vez de sumir sem motivo.
 */

export type DadosFormularioProduto = {
  nome: string;
  descricao: string | null;
  precoCentavos: number;
  disponibilidade: DisponibilidadeProduto;
  categoriaId: string | null;
};

const ID_FORMULARIO = "formulario-produto";

export function FormularioProduto({
  produto,
  categorias,
  enviando,
  empresaId,
  aoSalvar,
  aoCancelar,
  aoEnviarImagem,
  aoRemoverImagem,
}: {
  produto: Produto | null;
  categorias: CategoriaProduto[];
  enviando: boolean;
  // Com a empresa e o produto salvo, a tela administra também os grupos de opções e a prévia.
  empresaId?: string;
  aoSalvar: (dados: DadosFormularioProduto) => void;
  // Sai da edição e volta ao catálogo.
  aoCancelar: () => void;
  aoEnviarImagem?: (arquivo: File) => Promise<void>;
  aoRemoverImagem?: () => Promise<void>;
}) {
  const [nome, setNome] = useState(produto?.nome ?? "");
  const [descricao, setDescricao] = useState(produto?.descricao ?? "");
  const [preco, setPreco] = useState(produto ? centavosParaCampo(produto.precoCentavos) : "");
  const [disponibilidade, setDisponibilidade] = useState<DisponibilidadeProduto>(produto?.disponibilidade ?? "disponivel");
  const [categoriaId, setCategoriaId] = useState(produto?.categoriaId ?? "");
  const [erroPreco, setErroPreco] = useState<string | null>(null);
  const [grupos, setGrupos] = useState<GrupoOpcoesProduto[]>([]);
  const [previa, setPrevia] = useState(false);

  const precoCentavos = interpretarPrecoDigitado(preco);
  const alterado =
    produto === null ||
    nome !== produto.nome ||
    (descricao.trim() === "" ? null : descricao) !== produto.descricao ||
    precoCentavos !== produto.precoCentavos ||
    disponibilidade !== produto.disponibilidade ||
    (categoriaId || null) !== produto.categoriaId;

  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (precoCentavos === null) {
      setErroPreco("Informe um preço válido maior que zero, ex.: 39,90.");
      return;
    }
    setErroPreco(null);
    aoSalvar({ nome, descricao: descricao.trim() === "" ? null : descricao, precoCentavos, disponibilidade, categoriaId: categoriaId || null });
  }

  const podeVerPrevia = produto !== null && empresaId !== undefined;
  const abrirPrevia = () => setPrevia(true);

  return (
    <div data-editar-produto className="flex flex-col gap-6">
      <CabecalhoDaPagina
        trilha={[{ rotulo: "Cardápio" }, { rotulo: "Produtos", aoIr: aoCancelar }, { rotulo: produto ? "Editar produto" : "Novo produto" }]}
        titulo={produto ? "Editar produto" : "Novo produto"}
        subtitulo="Detalhes e opções que fazem parte do seu produto."
        acoes={
          <>
            {podeVerPrevia && (
              <Botao aparencia="secundario" data-abrir-previa onClick={abrirPrevia}>
                <IconeOlho className="h-4 w-4" />
                Prévia
              </Botao>
            )}
            <Botao aparencia="secundario" data-voltar-catalogo onClick={aoCancelar}>
              <IconeVoltar className="h-4 w-4" />
              Catálogo
            </Botao>
          </>
        }
      />

      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex min-w-0 flex-col gap-7">
          <section aria-label="Informações do produto" className="sm:rounded-jaa sm:border sm:border-borda sm:bg-superficie sm:p-6 sm:shadow-cartao">
            <h2 className="fonte-display mb-5 flex items-center gap-2.5 text-base font-semibold">
              <IconeDocumento className="h-[1.125rem] w-[1.125rem] text-conteudo-suave" />
              Informações do produto
            </h2>
            <form id={ID_FORMULARIO} aria-label={produto ? "Editar produto" : "Novo produto"} onSubmit={aoEnviar} className="flex flex-col gap-5">
              <CampoTexto id="produto-nome" rotulo="Nome do produto" name="nomeProduto" value={nome} required maxLength={NOME_PRODUTO_TAMANHO_MAXIMO} placeholder="Nome do produto" onChange={(evento) => setNome(evento.target.value)} />
              <CampoTextoLongo
                id="produto-descricao"
                rotulo="Descrição"
                name="descricaoProduto"
                value={descricao}
                maxLength={DESCRICAO_PRODUTO_TAMANHO_MAXIMO}
                placeholder="Descreva seu produto"
                dica="Opcional. O que o cliente lê antes de fazer o pedido."
                onChange={(evento) => setDescricao(evento.target.value)}
              />

              {/* Lado a lado também no celular; só abaixo de 360 px um embaixo do outro. */}
              <div className="grid gap-3 min-[360px]:grid-cols-2 sm:gap-4">
                <CampoTexto
                  id="produto-preco"
                  rotulo="Preço base (R$)"
                  name="precoProduto"
                  value={preco}
                  required
                  inputMode="decimal"
                  placeholder="39,90"
                  erro={erroPreco}
                  onChange={(evento) => setPreco(evento.target.value)}
                />
                <CampoSelecao id="produto-disponibilidade" rotulo="Disponibilidade" name="disponibilidadeProduto" value={disponibilidade} onChange={(evento) => setDisponibilidade(evento.target.value as DisponibilidadeProduto)}>
                  <option value="disponivel">Disponível</option>
                  <option value="indisponivel">Indisponível</option>
                </CampoSelecao>
              </div>

              <CampoSelecao
                id="produto-categoria"
                rotulo="Categoria"
                name="categoriaProduto"
                value={categoriaId}
                onChange={(evento) => setCategoriaId(evento.target.value)}
                dica="Organiza o catálogo. Não muda preço nem disponibilidade."
              >
                <option value="">Sem categoria</option>
                {categorias.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.nome}
                  </option>
                ))}
              </CampoSelecao>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-conteudo">Imagem do produto</span>
                <ImagemDoProduto produto={produto} aoEnviarImagem={aoEnviarImagem} aoRemoverImagem={aoRemoverImagem} />
              </div>
            </form>
          </section>

          {/*
            Grupos de opções: como o envio de imagem, só para produto JÁ SALVO — o grupo pertence a um
            produto, que precisa existir antes. Fica depois das informações porque é uma etapa
            opcional: a maioria dos produtos é vendida como está.
          */}
          {produto && empresaId ? (
            <GerenciadorPersonalizacao empresaId={empresaId} produtoId={produto.id} aoMudarGrupos={setGrupos} />
          ) : (
            !produto && <Aviso>Os grupos de opções (tamanho, acompanhamentos…) são adicionados logo depois de criar o produto.</Aviso>
          )}
        </div>

        <aside data-coluna-da-previa className="flex min-w-0 flex-col lg:sticky lg:top-0">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-conteudo-suave">No cardápio do cliente</p>
          <article data-cartao-da-previa className="overflow-hidden rounded-jaa border border-borda bg-superficie shadow-cartao sm:max-lg:grid sm:max-lg:grid-cols-2">
            {produto?.imagemUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={produto.imagemUrl} alt="" className="aspect-[1.8] w-full object-cover sm:max-lg:aspect-auto sm:max-lg:h-full lg:aspect-[1.58]" />
            ) : (
              <span aria-hidden className="grid aspect-[1.8] w-full place-items-center bg-superficie-suave text-conteudo-suave sm:max-lg:aspect-auto sm:max-lg:h-full lg:aspect-[1.58]">
                <IconeImagem className="h-8 w-8" />
              </span>
            )}
            <div className="flex min-w-0 flex-col p-5">
              <span data-previa-disponibilidade={disponibilidade} className={`inline-flex items-center gap-1.5 self-start rounded-jaa-compacto px-1.5 py-1 text-[11px] font-medium leading-none ${disponibilidade === "disponivel" ? "bg-marca-suave text-marca-suave-conteudo" : "bg-aviso/10 text-aviso"}`}>
                {disponibilidade === "disponivel" && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-marca" />}
                {disponibilidade === "disponivel" ? "Disponível" : "Indisponível"}
              </span>
              <h3 className="fonte-display mt-3 text-xl font-semibold leading-tight [overflow-wrap:anywhere]">{nome.trim() || "Nome do produto"}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-conteudo-suave [overflow-wrap:anywhere] lg:text-xs">{descricao.trim() || "Descrição do produto"}</p>
              <p data-previa-preco className="fonte-display my-4 text-xl font-semibold">
                {precoCentavos === null ? "R$ —" : formatarPrecoCentavos(precoCentavos)}
              </p>
              {grupos.length > 0 && (
                <dl className="flex flex-col gap-2.5 border-t border-borda py-3.5 text-sm lg:text-xs">
                  {grupos.map((grupo) => (
                    <div key={grupo.id} className="flex justify-between gap-3">
                      <dt className="min-w-0 [overflow-wrap:anywhere]">{grupo.nome}</dt>
                      <dd className="shrink-0 text-conteudo-suave">{grupoObrigatorio(grupo) ? "Obrigatório" : "Opcional"}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {podeVerPrevia && (
                <Botao aparencia="secundario" larguraTotal data-ver-como-cliente onClick={abrirPrevia} className="mt-auto">
                  <IconeOlho className="h-4 w-4" />
                  Ver como cliente
                </Botao>
              )}
            </div>
          </article>

          {produto && (
            <section data-um-produto-varios-dias className="mt-5 border-t border-borda py-4">
              <h3 className="flex items-center gap-2 text-sm font-medium lg:text-xs">
                <IconeCalendario className="h-4 w-4 text-marca" />
                Um produto, diferentes dias
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-conteudo-suave">{fraseDosGruposSemanais(grupos.filter((grupo) => grupo.programacaoSemanal).length)}</p>
              <div aria-hidden className="mt-3.5 flex justify-between">
                {DIAS_SEMANA.map((dia) => (
                  <span key={dia} className="grid h-7 w-7 place-items-center rounded-full bg-marca-suave text-[10px] font-medium text-marca-suave-conteudo">
                    {ROTULO_DIA_SEMANA[dia].slice(0, 1)}
                  </span>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>

      {/*
        Barra de ações. No celular fica presa logo acima da navegação inferior, que é fixa (4rem mais a
        área segura) e cobre parte do respiro de 6rem que a área rolável deixa no fim — daí o
        deslocamento negativo. A partir de `md` não há navegação embaixo e a barra fecha a página.
      */}
      <footer
        data-barra-de-acoes
        className="sticky bottom-[calc(env(safe-area-inset-bottom)-2rem)] z-10 -mx-4 -mb-8 flex flex-col gap-2 border-t border-borda bg-superficie px-4 py-2.5 md:static md:mx-0 md:mb-0 md:flex-row md:items-center md:justify-between md:gap-3 md:bg-transparent md:px-0 md:pb-0 md:pt-5"
      >
        <p data-estado-do-produto={alterado ? "nao-salvo" : "salvo"} aria-live="polite" className={`flex items-center justify-center gap-1.5 text-[11px] md:text-xs ${alterado && produto ? "font-semibold text-aviso" : "text-conteudo-suave"}`}>
          {!alterado && <IconeCheck className="h-3.5 w-3.5" />}
          {produto === null ? "Produto ainda não criado" : alterado ? "Alterações ainda não salvas" : "Todas as alterações salvas"}
        </p>
        <div className="grid grid-cols-[1fr_1.6fr] gap-2.5 md:flex md:gap-2">
          <Botao type="button" aparencia="secundario" onClick={aoCancelar}>
            Cancelar
          </Botao>
          <Botao type="submit" form={ID_FORMULARIO} disabled={enviando}>
            <IconeCheck className="h-4 w-4" />
            {enviando ? "Salvando…" : produto ? "Salvar produto" : "Criar produto"}
          </Botao>
        </div>
      </footer>

      {previa && produto && empresaId && (
        <PreviaDoCliente
          empresaId={empresaId}
          produto={{ id: produto.id, nome: nome.trim(), descricao: descricao.trim() === "" ? null : descricao, precoCentavos: precoCentavos ?? produto.precoCentavos, disponivel: disponibilidade === "disponivel", imagemUrl: produto.imagemUrl }}
          grupos={grupos}
          aoFechar={() => setPrevia(false)}
        />
      )}
    </div>
  );
}

function fraseDosGruposSemanais(total: number): string {
  if (total === 0) return "Nenhum grupo com programação semanal: as opções são as mesmas todos os dias.";
  return total === 1 ? "1 grupo com programação semanal." : `${total} grupos com programação semanal.`;
}

function ImagemDoProduto({
  produto,
  aoEnviarImagem,
  aoRemoverImagem,
}: {
  produto: Produto | null;
  aoEnviarImagem?: ((arquivo: File) => Promise<void>) | undefined;
  aoRemoverImagem?: (() => Promise<void>) | undefined;
}) {
  const entrada = useRef<HTMLInputElement | null>(null);
  const [ocupado, setOcupado] = useState<"enviando" | "removendo" | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  if (!produto || !aoEnviarImagem) {
    return <Aviso>A foto é adicionada logo depois de criar o produto: toque em “Criar produto” e esta área libera o envio da imagem.</Aviso>;
  }

  async function executar(acao: () => Promise<void>, tipo: "enviando" | "removendo") {
    setOcupado(tipo);
    setErro(null);
    try {
      await acao();
    } catch (falha) {
      // A mensagem vem do servidor (arquivo grande, tipo inválido, limite de envios, storage fora do ar).
      setErro(falha instanceof Error && falha.message ? falha.message : "Não foi possível alterar a imagem.");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div data-imagem-do-produto className="flex items-center gap-3.5 rounded-jaa-compacto border border-dashed border-borda bg-superficie p-3.5">
      {produto.imagemUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={produto.imagemUrl} alt="" className="h-16 w-16 shrink-0 rounded-jaa-compacto object-cover" />
      ) : (
        <span aria-hidden className="grid h-16 w-16 shrink-0 place-items-center rounded-jaa-compacto bg-superficie-suave text-conteudo-suave">
          <IconeImagem className="h-6 w-6" />
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-2">
        <input
          ref={entrada}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="Escolher imagem do produto"
          onChange={(evento) => {
            const arquivo = evento.target.files?.[0];
            if (arquivo && aoEnviarImagem) void executar(() => aoEnviarImagem(arquivo), "enviando");
            evento.target.value = "";
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Botao aparencia="secundario" disabled={ocupado !== null} aria-busy={ocupado === "enviando" || undefined} onClick={() => entrada.current?.click()} className="!px-3">
            <IconeImagem className="h-4 w-4" />
            {ocupado === "enviando" ? "Enviando…" : produto.imagemUrl ? "Alterar imagem" : "Adicionar imagem"}
          </Botao>
          {produto.imagemUrl && aoRemoverImagem && (
            <Botao aparencia="discreto" disabled={ocupado !== null} aria-busy={ocupado === "removendo" || undefined} onClick={() => void executar(aoRemoverImagem, "removendo")} className="!px-3">
              {ocupado === "removendo" ? "Removendo…" : "Remover"}
            </Botao>
          )}
        </div>
        <p className="text-xs text-conteudo-suave">JPG, PNG ou WebP. Até 8 MB.</p>
        {erro && (
          <p role="alert" className="text-xs text-perigo">
            {erro}
          </p>
        )}
      </div>
    </div>
  );
}
