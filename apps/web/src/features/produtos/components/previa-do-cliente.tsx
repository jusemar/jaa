"use client";

import { DIAS_SEMANA, ROTULO_DIA_SEMANA, type DiaSemana, type GrupoOpcoesProduto, type ProdutoPublico, type ProgramacaoSemanalGrupo } from "@jaa/contratos";
import { useEffect, useMemo, useState } from "react";
import { avisar } from "@/components/ui/avisos";
import { Janela } from "@/components/ui/janela";
import { Aviso, CampoSelecao, Selo } from "@/components/ui/primitivos";
import { MontagemProduto } from "@/features/catalogo/components/montagem-produto";
import { consultarProgramacaoSemanal } from "../lib/api-personalizacao";
import { diaDeHojeNoNavegador } from "../lib/edicao-semana";
import { formatarPrecoCentavos } from "../lib/precos";
import { gruposDoClienteNoDia } from "../lib/previa-do-cliente";

/*
 * PRÉVIA DO CARDÁPIO: como o cliente encontra ESTE produto num dia da semana.
 *
 * Não é simulação com dados inventados: usa o produto e os grupos reais e monta a escolha com o MESMO
 * componente do cardápio do cliente (`MontagemProduto`), com as mesmas regras de mínimo, máximo e
 * preço. A programação dos grupos semanais é lida só aqui, quando a prévia é aberta.
 *
 * Nada é pedido de verdade: "Adicionar" só confirma que a montagem está válida.
 */

export interface ProdutoDaPrevia {
  id: string;
  nome: string;
  descricao: string | null;
  precoCentavos: number;
  disponivel: boolean;
  imagemUrl: string | null;
}

export function PreviaDoCliente({
  empresaId,
  produto,
  grupos,
  aoFechar,
}: {
  empresaId: string;
  produto: ProdutoDaPrevia;
  grupos: GrupoOpcoesProduto[];
  aoFechar: () => void;
}) {
  const [dia, setDia] = useState<DiaSemana>(() => diaDeHojeNoNavegador());
  const [programacoes, setProgramacoes] = useState<Record<string, ProgramacaoSemanalGrupo> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const semanais = grupos.filter((grupo) => grupo.programacaoSemanal).map((grupo) => grupo.id).join(",");

  useEffect(() => {
    let atual = true;
    const ids = semanais === "" ? [] : semanais.split(",");
    void Promise.all(ids.map((grupoId) => consultarProgramacaoSemanal(empresaId, produto.id, grupoId))).then((respostas) => {
      if (!atual) return;
      const lidas: Record<string, ProgramacaoSemanalGrupo> = {};
      respostas.forEach((resposta, indice) => {
        const grupoId = ids[indice];
        if (resposta.ok && grupoId) lidas[grupoId] = resposta.dados;
      });
      if (respostas.some((resposta) => !resposta.ok)) setErro("Não foi possível ler a programação semanal. A prévia pode estar incompleta.");
      setProgramacoes(lidas);
    });
    return () => {
      atual = false;
    };
  }, [empresaId, produto.id, semanais]);

  const doDia = useMemo(() => (programacoes ? gruposDoClienteNoDia(grupos, programacoes, dia) : []), [grupos, programacoes, dia]);
  const ocultos = programacoes ? grupos.filter((grupo) => !doDia.some((item) => item.id === grupo.id)) : [];

  const publico: ProdutoPublico = {
    id: produto.id,
    nome: produto.nome,
    descricao: produto.descricao,
    precoCentavos: produto.precoCentavos,
    disponibilidade: "disponivel",
    categoriaId: null,
    imagemUrl: produto.imagemUrl,
    personalizavel: doDia.length > 0,
  };

  return (
    <Janela rotulo="Prévia do cardápio" titulo="Prévia do cardápio" subtitulo={`${ROTULO_DIA_SEMANA[dia]} · Opções disponíveis para o cliente`} largura="estreita" aoFechar={aoFechar}>
      <div data-previa-do-cliente className="flex flex-col gap-4">
        <CampoSelecao id="previa-dia" rotulo="Dia da semana" value={dia} onChange={(evento) => setDia(Number(evento.target.value) as DiaSemana)}>
          {DIAS_SEMANA.map((item) => (
            <option key={item} value={item}>
              {ROTULO_DIA_SEMANA[item]}
            </option>
          ))}
        </CampoSelecao>

        {produto.imagemUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={produto.imagemUrl} alt={produto.nome} className="aspect-[2.4] w-full rounded-jaa object-cover" />
        )}

        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="fonte-display text-xl font-semibold [overflow-wrap:anywhere]">{produto.nome || "Nome do produto"}</h3>
            {!produto.disponivel && <Selo tom="atencao">Indisponível</Selo>}
          </div>
          {produto.descricao && <p className="whitespace-pre-wrap text-sm leading-relaxed text-conteudo-suave [overflow-wrap:anywhere]">{produto.descricao}</p>}
          <p className="fonte-display font-semibold">{formatarPrecoCentavos(produto.precoCentavos)}</p>
        </div>

        {!produto.disponivel && <Aviso tom="atencao">Produto indisponível: ele não aparece no cardápio do cliente enquanto estiver assim.</Aviso>}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {!programacoes && <p role="status" className="text-sm text-conteudo-suave">Carregando as opções do dia…</p>}

        {programacoes &&
          (doDia.length > 0 ? (
            <div className="border-t border-borda pt-4">
              {/* `key`: trocar de dia recomeça a montagem (as opções mudam). */}
              <MontagemProduto key={dia} produto={publico} grupos={doDia} aoAdicionar={() => avisar.sucesso("Montagem válida. É só uma prévia: nada foi adicionado.")} />
            </div>
          ) : (
            <p className="border-t border-borda pt-4 text-sm text-conteudo-suave">Neste dia o cliente adiciona o produto direto ao pedido, sem opções para escolher.</p>
          ))}

        {ocultos.length > 0 && (
          <Aviso>
            Não {ocultos.length === 1 ? "aparece" : "aparecem"} para o cliente neste dia: {ocultos.map((grupo) => grupo.nome).join(", ")} — sem opções disponíveis suficientes.
          </Aviso>
        )}
      </div>
    </Janela>
  );
}
