"use client";

import {
  MAXIMO_ESCOLHAS_POR_GRUPO,
  MAXIMO_GRUPOS_POR_PRODUTO,
  MAXIMO_OPCOES_POR_GRUPO,
  grupoDeEscolhaUnica,
  grupoObrigatorio,
  type GrupoOpcoesProduto,
} from "@jaa/contratos";
import { useEffect, useState } from "react";
import { Aviso, Botao, CampoSelecao, CampoTexto, Carregando, EstadoVazio } from "@/components/ui/primitivos";
import { formatarPrecoCentavos, interpretarPrecoDigitado } from "../lib/precos";
import {
  atualizarOpcao,
  criarGrupoOpcoes,
  criarOpcao,
  listarGruposOpcoes,
  removerGrupoOpcoes,
  removerOpcao,
} from "../lib/api-personalizacao";

/*
 * PERSONALIZAÇÃO do produto, administrada pela EMPRESA — é aqui que "Tamanho", "Guarnições (até 5)"
 * e "Tipo de carne (apenas 1)" nascem. Nada disso está escrito no Jaa: são grupos que a empresa
 * cadastra, com o mínimo e o máximo que ela quiser.
 *
 * Como no envio de imagem, só aparece para produto JÁ SALVO: um grupo pertence a um produto, e o
 * produto precisa existir primeiro.
 *
 * Toda operação devolve a lista completa de grupos (a API já responde assim), então a tela nunca
 * fica com uma ordem ou um preço diferente do que está no banco.
 */

export function GerenciadorPersonalizacao({ empresaId, produtoId }: { empresaId: string; produtoId: string }) {
  const [grupos, setGrupos] = useState<GrupoOpcoesProduto[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let ativo = true;
    void listarGruposOpcoes(empresaId, produtoId).then((resultado) => {
      if (!ativo) return;
      if (resultado.ok) setGrupos(resultado.dados.grupos);
      else setErro(resultado.mensagem);
    });
    return () => {
      ativo = false;
    };
  }, [empresaId, produtoId]);

  /** Executa a operação e adota a lista que o servidor devolveu (nunca um palpite local). */
  async function aplicar(operacao: () => Promise<Awaited<ReturnType<typeof listarGruposOpcoes>>>) {
    setErro(null);
    setOcupado(true);
    try {
      const resultado = await operacao();
      if (resultado.ok) setGrupos(resultado.dados.grupos);
      else setErro(resultado.mensagem);
      return resultado.ok;
    } finally {
      setOcupado(false);
    }
  }

  if (grupos === null && !erro) return <Carregando texto="Carregando as opções do produto…" />;

  return (
    <section aria-label="Opções para o cliente montar" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="fonte-display text-base font-semibold">Opções para o cliente montar</h3>
        <p className="text-sm text-conteudo-suave">
          Crie grupos como tamanho, acompanhamentos ou tipo de carne. Você define quantas opções o cliente pode escolher em cada grupo, e quanto cada uma
          acrescenta ao preço. Sem nenhum grupo, o produto é adicionado direto ao pedido.
        </p>
      </div>

      {(grupos ?? []).length === 0 ? (
        <EstadoVazio
          titulo="Nenhum grupo de opções"
          descricao="Este produto é vendido como está. Crie um grupo se o cliente precisar escolher algo — por exemplo o tamanho."
        />
      ) : (
        <ol className="flex flex-col gap-3">
          {(grupos ?? []).map((grupo, indice) => (
            <CartaoGrupo
              key={grupo.id}
              grupo={grupo}
              passo={indice + 1}
              ocupado={ocupado}
              aoCriarOpcao={(entrada) => aplicar(() => criarOpcao(empresaId, produtoId, grupo.id, entrada))}
              aoAlternarDisponibilidadeOpcao={(opcaoId, disponibilidade) => aplicar(() => atualizarOpcao(empresaId, produtoId, grupo.id, opcaoId, { disponibilidade }))}
              aoRemoverOpcao={(opcaoId) => aplicar(() => removerOpcao(empresaId, produtoId, grupo.id, opcaoId))}
              aoRemoverGrupo={() => aplicar(() => removerGrupoOpcoes(empresaId, produtoId, grupo.id))}
            />
          ))}
        </ol>
      )}

      {(grupos ?? []).length < MAXIMO_GRUPOS_POR_PRODUTO ? (
        <FormularioGrupo ocupado={ocupado} aoCriar={(entrada) => aplicar(() => criarGrupoOpcoes(empresaId, produtoId, entrada))} />
      ) : (
        <Aviso tom="atencao">Este produto já tem o máximo de {MAXIMO_GRUPOS_POR_PRODUTO} grupos de opções.</Aviso>
      )}

      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </section>
  );
}

/** Um grupo com suas opções, a regra em palavras e as ações de administração. */
function CartaoGrupo({
  grupo,
  passo,
  ocupado,
  aoCriarOpcao,
  aoAlternarDisponibilidadeOpcao,
  aoRemoverOpcao,
  aoRemoverGrupo,
}: {
  grupo: GrupoOpcoesProduto;
  passo: number;
  ocupado: boolean;
  aoCriarOpcao: (entrada: { nome: string; precoAdicionalCentavos: number }) => Promise<boolean>;
  aoAlternarDisponibilidadeOpcao: (opcaoId: string, disponibilidade: "disponivel" | "indisponivel") => Promise<boolean>;
  aoRemoverOpcao: (opcaoId: string) => Promise<boolean>;
  aoRemoverGrupo: () => Promise<boolean>;
}) {
  return (
    <li data-grupo-admin={grupo.id} className="flex flex-col gap-2 rounded-jaa border border-borda bg-superficie p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <p className="fonte-display text-sm font-semibold">
            {passo}. {grupo.nome}
          </p>
          <p className="text-xs text-conteudo-suave">{regraEmPalavras(grupo)}</p>
          {grupo.instrucao && <p className="text-xs text-conteudo-suave">Dica ao cliente: {grupo.instrucao}</p>}
        </div>
        <Botao
          aparencia="perigo"
          disabled={ocupado}
          onClick={() => {
            // Apagar o grupo apaga as opções dele. Pedidos antigos não mudam: guardam o snapshot.
            if (window.confirm(`Apagar o grupo “${grupo.nome}” e as opções dele? Pedidos já feitos não mudam.`)) void aoRemoverGrupo();
          }}
          className="!min-h-9 text-xs"
        >
          Apagar grupo
        </Botao>
      </div>

      {grupo.opcoes.length === 0 ? (
        <Aviso tom="atencao">Este grupo ainda não tem opção nenhuma, então não aparece para o cliente.</Aviso>
      ) : (
        <ul className="flex flex-col divide-y divide-borda rounded-jaa border border-borda text-sm">
          {grupo.opcoes.map((opcao) => {
            const disponivel = opcao.disponibilidade === "disponivel";
            return (
              <li key={opcao.id} data-opcao-admin={opcao.id} className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2">
                <span className="flex min-w-0 flex-col">
                  <span className={`truncate ${disponivel ? "" : "text-conteudo-suave line-through"}`}>{opcao.nome}</span>
                  <span className="text-xs text-conteudo-suave">
                    {opcao.precoAdicionalCentavos > 0 ? `+${formatarPrecoCentavos(opcao.precoAdicionalCentavos)}` : "Sem acréscimo"}
                    {!disponivel && " · indisponível"}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <Botao
                    aparencia="secundario"
                    disabled={ocupado}
                    onClick={() => void aoAlternarDisponibilidadeOpcao(opcao.id, disponivel ? "indisponivel" : "disponivel")}
                    className="!min-h-9 text-xs"
                  >
                    {disponivel ? "Deixar indisponível" : "Deixar disponível"}
                  </Botao>
                  <Botao
                    aparencia="perigo"
                    disabled={ocupado}
                    onClick={() => {
                      if (window.confirm(`Apagar a opção “${opcao.nome}”? Pedidos já feitos não mudam.`)) void aoRemoverOpcao(opcao.id);
                    }}
                    className="!min-h-9 text-xs"
                  >
                    Apagar
                  </Botao>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {grupo.opcoes.length < MAXIMO_OPCOES_POR_GRUPO ? (
        <FormularioOpcao idGrupo={grupo.id} ocupado={ocupado} aoCriar={aoCriarOpcao} />
      ) : (
        <Aviso tom="atencao">Este grupo já tem o máximo de {MAXIMO_OPCOES_POR_GRUPO} opções.</Aviso>
      )}
    </li>
  );
}

/** A regra do grupo em português, derivada só de mínimo e máximo. */
function regraEmPalavras(grupo: GrupoOpcoesProduto): string {
  const obrigatorio = grupoObrigatorio(grupo) ? "obrigatório" : "opcional";
  if (grupoDeEscolhaUnica(grupo)) return `Escolha única · ${obrigatorio}`;
  if (grupo.minimoEscolhas === 0) return `Escolha múltipla · até ${grupo.maximoEscolhas} · opcional`;
  if (grupo.minimoEscolhas === grupo.maximoEscolhas) return `Escolha múltipla · exatamente ${grupo.minimoEscolhas} · obrigatório`;
  return `Escolha múltipla · de ${grupo.minimoEscolhas} a ${grupo.maximoEscolhas} · obrigatório`;
}

type TipoEscolha = "unica" | "multipla";

/**
 * Criação do grupo. A empresa escolhe entre "uma opção" e "várias opções" e diz se é obrigatório —
 * é como as pessoas pensam. Isso é traduzido para mínimo/máximo, que é o que o domínio guarda.
 */
function FormularioGrupo({ ocupado, aoCriar }: { ocupado: boolean; aoCriar: (entrada: { nome: string; instrucao: string | null; minimoEscolhas: number; maximoEscolhas: number }) => Promise<boolean> }) {
  const [nome, setNome] = useState("");
  const [instrucao, setInstrucao] = useState("");
  const [tipo, setTipo] = useState<TipoEscolha>("unica");
  const [obrigatorio, setObrigatorio] = useState(true);
  const [maximo, setMaximo] = useState("5");
  const [erro, setErro] = useState<string | null>(null);

  async function criar() {
    if (nome.trim() === "") {
      setErro("Informe o nome do grupo.");
      return;
    }
    const limite = tipo === "unica" ? 1 : Math.trunc(Number(maximo));
    if (tipo === "multipla" && (!Number.isInteger(limite) || limite < 1 || limite > MAXIMO_ESCOLHAS_POR_GRUPO)) {
      setErro(`O máximo de escolhas deve ser um número inteiro entre 1 e ${MAXIMO_ESCOLHAS_POR_GRUPO}.`);
      return;
    }
    setErro(null);
    const criado = await aoCriar({
      nome: nome.trim(),
      instrucao: instrucao.trim() === "" ? null : instrucao.trim(),
      // Obrigatório = pelo menos 1. Máximo é 1 na escolha única e o limite informado na múltipla.
      minimoEscolhas: obrigatorio ? 1 : 0,
      maximoEscolhas: limite,
    });
    if (criado) {
      setNome("");
      setInstrucao("");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-jaa border border-dashed border-borda p-3">
      <p className="fonte-display text-sm font-semibold">Novo grupo de opções</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoTexto id="grupo-nome" rotulo="Nome do grupo" value={nome} placeholder="Tamanho, Acompanhamentos, Tipo de carne…" onChange={(evento) => setNome(evento.target.value)} />
        <CampoTexto
          id="grupo-instrucao"
          rotulo="Dica ao cliente (opcional)"
          value={instrucao}
          placeholder="Explicação curta que aparece abaixo do título"
          onChange={(evento) => setInstrucao(evento.target.value)}
        />
        <CampoSelecao id="grupo-tipo" rotulo="Quantas opções o cliente escolhe" value={tipo} onChange={(evento) => setTipo(evento.target.value as TipoEscolha)}>
          <option value="unica">Apenas uma</option>
          <option value="multipla">Várias</option>
        </CampoSelecao>
        {tipo === "multipla" && (
          <CampoTexto
            id="grupo-maximo"
            rotulo="Máximo de escolhas"
            type="number"
            min={1}
            max={MAXIMO_ESCOLHAS_POR_GRUPO}
            value={maximo}
            onChange={(evento) => setMaximo(evento.target.value)}
          />
        )}
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={obrigatorio} onChange={(evento) => setObrigatorio(evento.target.checked)} className="accent-[var(--cor-marca)]" />
        O cliente precisa escolher neste grupo para fechar o item
      </label>
      <Botao disabled={ocupado} onClick={() => void criar()} className="self-start">
        Criar grupo
      </Botao>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </div>
  );
}

/** Criação de opção. O acréscimo é digitado em reais e convertido por texto para centavos inteiros. */
function FormularioOpcao({ idGrupo, ocupado, aoCriar }: { idGrupo: string; ocupado: boolean; aoCriar: (entrada: { nome: string; precoAdicionalCentavos: number }) => Promise<boolean> }) {
  const [nome, setNome] = useState("");
  const [acrescimo, setAcrescimo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function criar() {
    if (nome.trim() === "") {
      setErro("Informe o nome da opção.");
      return;
    }
    // Vazio = sem acréscimo (0), que é o caso mais comum. Só interpreta quando a empresa digita algo.
    const centavos = acrescimo.trim() === "" ? 0 : interpretarPrecoDigitado(acrescimo);
    if (centavos === null) {
      setErro("Informe o acréscimo como 5,00 — ou deixe em branco para não mudar o preço.");
      return;
    }
    setErro(null);
    const criada = await aoCriar({ nome: nome.trim(), precoAdicionalCentavos: centavos });
    if (criada) {
      setNome("");
      setAcrescimo("");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <CampoTexto id={`opcao-nome-${idGrupo}`} rotulo="Nova opção" value={nome} placeholder="Nome da opção" onChange={(evento) => setNome(evento.target.value)} />
        <CampoTexto
          id={`opcao-acrescimo-${idGrupo}`}
          rotulo="Acréscimo (R$)"
          value={acrescimo}
          inputMode="decimal"
          placeholder="0,00"
          onChange={(evento) => setAcrescimo(evento.target.value)}
        />
        <Botao aparencia="secundario" disabled={ocupado} onClick={() => void criar()}>
          Adicionar opção
        </Botao>
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </div>
  );
}
