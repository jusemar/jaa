"use client";

import { DESCRICAO_PRODUTO_TAMANHO_MAXIMO, NOME_PRODUTO_TAMANHO_MAXIMO, type CategoriaProduto, type DisponibilidadeProduto, type Produto } from "@jaa/contratos";
import { useRef, useState, type FormEvent } from "react";
import { Aviso, Botao, CampoSelecao, CampoTexto, CampoTextoLongo, Cartao } from "@/components/ui/primitivos";
import { centavosParaCampo, interpretarPrecoDigitado } from "../lib/precos";

/*
 * CADASTRO do produto — tela própria, separada da listagem.
 *
 * A imagem só pode ser enviada depois que o produto existe (o arquivo é guardado sob o id dele): num
 * produto novo o bloco de imagem explica isso em vez de sumir sem motivo.
 */

export type DadosFormularioProduto = {
  nome: string;
  descricao: string | null;
  precoCentavos: number;
  disponibilidade: DisponibilidadeProduto;
  categoriaId: string | null;
};

export function FormularioProduto({
  produto,
  categorias,
  enviando,
  aoSalvar,
  aoCancelar,
  aoEnviarImagem,
  aoRemoverImagem,
}: {
  produto: Produto | null;
  categorias: CategoriaProduto[];
  enviando: boolean;
  aoSalvar: (dados: DadosFormularioProduto) => void;
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

  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const precoCentavos = interpretarPrecoDigitado(preco);
    if (precoCentavos === null) {
      setErroPreco("Informe um preço válido maior que zero, ex.: 39,90.");
      return;
    }
    setErroPreco(null);
    aoSalvar({ nome, descricao: descricao.trim() === "" ? null : descricao, precoCentavos, disponibilidade, categoriaId: categoriaId || null });
  }

  return (
    <Cartao className="p-4">
      <form aria-label={produto ? "Editar produto" : "Novo produto"} onSubmit={aoEnviar} className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">{produto ? "Editar produto" : "Novo produto"}</h3>

        <CampoTexto id="produto-nome" rotulo="Nome" name="nomeProduto" value={nome} required maxLength={NOME_PRODUTO_TAMANHO_MAXIMO} onChange={(evento) => setNome(evento.target.value)} />
        <CampoTextoLongo
          id="produto-descricao"
          rotulo="Descrição"
          name="descricaoProduto"
          value={descricao}
          maxLength={DESCRICAO_PRODUTO_TAMANHO_MAXIMO}
          dica="Opcional. É o que o cliente lê antes de pedir."
          onChange={(evento) => setDescricao(evento.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto
            id="produto-preco"
            rotulo="Preço (R$)"
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

        <ImagemDoProduto produto={produto} aoEnviarImagem={aoEnviarImagem} aoRemoverImagem={aoRemoverImagem} />

        <div className="flex flex-wrap gap-2">
          <Botao type="submit" disabled={enviando}>
            {enviando ? "Salvando…" : produto ? "Salvar produto" : "Criar produto"}
          </Botao>
          <Botao type="button" aparencia="secundario" onClick={aoCancelar}>
            Cancelar
          </Botao>
        </div>
      </form>
    </Cartao>
  );
}

function ImagemDoProduto({
  produto,
  aoEnviarImagem,
  aoRemoverImagem,
}: {
  produto: Produto | null;
  aoEnviarImagem?: (arquivo: File) => Promise<void>;
  aoRemoverImagem?: () => Promise<void>;
}) {
  const entrada = useRef<HTMLInputElement | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!produto || !aoEnviarImagem) {
    return <Aviso>Crie o produto primeiro para poder enviar a foto dele.</Aviso>;
  }

  async function executar(acao: () => Promise<void>) {
    setOcupado(true);
    setErro(null);
    try {
      await acao();
    } catch {
      setErro("Não foi possível alterar a imagem.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      {produto.imagemUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={produto.imagemUrl} alt="" className="h-20 w-20 shrink-0 rounded-jaa object-cover" />
      ) : (
        <span aria-hidden className="flex h-20 w-20 shrink-0 items-center justify-center rounded-jaa bg-superficie-suave text-2xl text-conteudo-suave">
          📦
        </span>
      )}
      <div className="flex flex-col gap-2">
        <input
          ref={entrada}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="Escolher imagem do produto"
          onChange={(evento) => {
            const arquivo = evento.target.files?.[0];
            if (arquivo && aoEnviarImagem) void executar(() => aoEnviarImagem(arquivo));
            evento.target.value = "";
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Botao aparencia="secundario" disabled={ocupado} onClick={() => entrada.current?.click()}>
            {ocupado ? "Enviando…" : produto.imagemUrl ? "Trocar imagem" : "Adicionar imagem"}
          </Botao>
          {produto.imagemUrl && aoRemoverImagem && (
            <Botao aparencia="discreto" disabled={ocupado} onClick={() => void executar(aoRemoverImagem)}>
              Remover
            </Botao>
          )}
        </div>
        <p className="text-xs text-conteudo-suave">JPEG, PNG ou WebP, até 8 MB.</p>
        {erro && (
          <p role="alert" className="text-xs text-perigo">
            {erro}
          </p>
        )}
      </div>
    </div>
  );
}
