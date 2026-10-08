import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { calcularFuncionamento, type DiaSemana, type EmpresaPublica, type FuncionamentoEmpresa, type FuncionamentoPublico, type PeriodoFuncionamento, type ProdutoPublico } from "@jaa/contratos";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { acaoOuExplicacao } from "../../../components/ui/acao-indisponivel.ts";
import { EditorDeHorarios } from "../../empresas/components/horarios-de-funcionamento.tsx";
import { rascunhoDoFuncionamento } from "../../empresas/lib/rascunho-funcionamento.ts";
import { PainelCarrinho } from "../../carrinho/components/painel-carrinho.tsx";
import type { Carrinho } from "../../carrinho/lib/carrinho.ts";
import type { FreteEntrega } from "../../carrinho/lib/frete-entrega.ts";
import { montarSecoes } from "../lib/cardapio.ts";
import { Cardapio, DetalheProdutoCatalogo } from "./catalogo-apresentacao.tsx";
import { FuncionamentoDaEmpresa } from "./funcionamento-da-empresa.tsx";

/*
 * Aberto/fechado na Web: o que o cliente vê no cardápio (conversa e link público usam o MESMO
 * componente), a ação indisponível que explica ao toque e a tela do gestor. Os estados vêm da regra
 * central (`calcularFuncionamento`) com um instante fixo — a tela só apresenta.
 */
const html = (elemento: ReactElement) => renderToStaticMarkup(elemento);
const texto = (marcacao: string) => marcacao.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const fonte = (arquivo: string) => readFileSync(new URL(arquivo, import.meta.url), "utf8");
const semComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
const tag = (marcacao: string, atributo: string) => marcacao.match(new RegExp(`<[^>]*${atributo}[^>]*>`))?.[0] ?? "";
const nada = () => {};

const p = (diaSemana: number, inicio: string, fim: string): PeriodoFuncionamento => ({ diaSemana: diaSemana as DiaSemana, inicio, fim });
const SEMANA = [p(1, "08:00", "14:00"), p(1, "18:00", "23:00"), p(2, "08:00", "23:00"), p(6, "18:00", "02:00")];
// Segunda, 05/10/2026, em São Paulo.
const em = (hora: string, ativo = true): FuncionamentoPublico => {
  const { estado, hoje } = calcularFuncionamento({ ativo, periodos: SEMANA }, new Date(`2026-10-05T${hora}:00-03:00`), "America/Sao_Paulo");
  return { estado, hoje, semana: ativo ? SEMANA : [] };
};
const ABERTA = em("10:00");
const INTERVALO = em("15:00");
const empresa: EmpresaPublica = { identidadeId: "11111111-1111-4111-8111-111111111111", nome: "Cantina", nomeUsuario: "cantina", slug: "cantina" };
const suco: ProdutoPublico = { id: "22222222-2222-4222-8222-222222222222", nome: "Suco", descricao: null, precoCentavos: 900, disponibilidade: "disponivel", categoriaId: null, imagemUrl: null, personalizavel: false };
const bloqueio = { motivo: INTERVALO.estado.aviso!, aoExplicar: nada };
const SECOES = montarSecoes([], [suco]);

describe("estado no topo do cardápio", () => {
  it("aberta: 'Aberto agora · até 14:00'", () => {
    const marcacao = html(createElement(FuncionamentoDaEmpresa, { funcionamento: ABERTA }));
    assert.ok(marcacao.includes('data-funcionamento="aberto"'));
    assert.ok(texto(marcacao).includes("Aberto agora · até 14:00"));
  });

  it("fechada no intervalo: 'Fechado · abre hoje às 18:00' — em texto, não só em cor", () => {
    const marcacao = html(createElement(FuncionamentoDaEmpresa, { funcionamento: INTERVALO }));
    assert.ok(marcacao.includes('data-funcionamento="fechado"'));
    assert.ok(texto(marcacao).includes("Fechado · abre hoje às 18:00"));
  });

  it("uma linha compacta que abre a semana a um toque (fechada por padrão, com aria-expanded)", () => {
    const marcacao = html(createElement(FuncionamentoDaEmpresa, { funcionamento: ABERTA }));
    const botao = tag(marcacao, "data-ver-horarios");
    assert.ok(botao.includes('aria-expanded="false"') && botao.includes("min-h-11") && texto(marcacao).includes("Horários"));
    // Hierarquia: o estado em destaque e o complemento ("até 14:00") em peso secundário.
    assert.ok(/<span class="font-semibold text-marca">Aberto agora<\/span><span class="text-conteudo-suave"> · até 14:00<\/span>/.test(marcacao), marcacao);
    assert.ok(!marcacao.includes("data-semana-de-funcionamento"), "a semana não ocupa espaço até ser pedida");
    const codigo = semComentarios(fonte("./funcionamento-da-empresa.tsx"));
    assert.ok(codigo.includes("DIAS_SEMANA.map") && codigo.includes("horariosDoDiaEmTexto(semana, dia)") && codigo.includes("dia === hoje"));
  });

  it("empresa que não controla horário não mostra nada (comportamento de sempre)", () => {
    assert.equal(html(createElement(FuncionamentoDaEmpresa, { funcionamento: em("10:00", false) })), "");
  });

  it("a tela não compara horário: estado e textos vêm prontos do servidor", () => {
    for (const arquivo of ["./funcionamento-da-empresa.tsx", "./catalogo-da-empresa.tsx", "./catalogo-apresentacao.tsx", "../hooks/use-funcionamento.ts", "../../carrinho/components/painel-carrinho.tsx"]) {
      const codigo = semComentarios(fonte(arquivo));
      assert.ok(!/new Date\(|Date\.now|getHours|calcularFuncionamento/.test(codigo), arquivo);
    }
    assert.ok(semComentarios(fonte("../hooks/use-funcionamento.ts")).includes("obterFuncionamento(identidadeEmpresaId)"));
  });
});

describe("ação de pedir com a empresa fechada: parece indisponível, mas explica ao toque", () => {
  it("o botão NÃO usa `disabled`: aria-disabled + aparência apagada, e o clique chama a explicação", () => {
    let explicou = 0;
    let executou = 0;
    const fechada = acaoOuExplicacao("Fechada", () => (explicou += 1), () => (executou += 1));
    assert.equal(fechada["aria-disabled"], true);
    fechada.onClick();
    assert.deepEqual([explicou, executou], [1, 0], "a ação real não roda");
    const aberta = acaoOuExplicacao(null, () => (explicou += 1), () => (executou += 1));
    assert.equal(aberta["aria-disabled"], undefined);
    aberta.onClick();
    assert.deepEqual([explicou, executou], [1, 1]);
  });

  it("card do produto: fechado, o '+' fica aria-disabled e apagado; aberto, normal", () => {
    const props = { empresa, secoes: SECOES, secaoEscolhidaId: null, aoEscolherSecao: nada, aoVer: nada, aoAdicionar: nada };
    const fechado = tag(html(createElement(Cardapio, { ...props, funcionamento: INTERVALO, bloqueio })), "data-adicionar-produto");
    assert.ok(fechado.includes('aria-disabled="true"') && fechado.includes("opacity-50") && !fechado.includes('disabled=""'));
    const aberto = tag(html(createElement(Cardapio, { ...props, funcionamento: ABERTA })), "data-adicionar-produto");
    assert.ok(!aberto.includes("aria-disabled") && !aberto.includes("opacity-50"));
  });

  it("o cardápio e o detalhe do produto mostram o estado; o detalhe ainda escreve o motivo junto do botão", () => {
    const cardapio = html(createElement(Cardapio, { empresa, secoes: SECOES, secaoEscolhidaId: null, aoEscolherSecao: nada, aoVer: nada, aoAdicionar: nada, funcionamento: INTERVALO, bloqueio }));
    assert.ok(cardapio.indexOf("data-funcionamento") < cardapio.indexOf("data-produto-catalogo-id"), "o estado vem antes dos produtos");
    assert.ok(texto(cardapio).includes("Suco"), "fechada, os produtos continuam à vista");
    const detalhe = html(createElement(DetalheProdutoCatalogo, { empresa, produto: suco, grupos: [], aoVoltar: nada, aoAdicionar: nada, funcionamento: INTERVALO, bloqueio }));
    assert.ok(detalhe.includes('data-funcionamento="fechado"') && tag(detalhe, "data-adicionar-produto").includes('aria-disabled="true"'));
    assert.ok(texto(detalhe).includes("Esta empresa está fechada agora. Abre novamente hoje às 18:00."));
  });

  it("carrinho: 'Confirmar pedido' indisponível com o motivo, e os itens continuam", () => {
    const carrinho: Carrinho = { empresa, itens: [{ linhaId: "l1", produtoId: suco.id, nome: "Suco", precoUnitarioCentavos: 900, quantidade: 2, imagemUrl: null, escolhas: [], observacao: null }] };
    const frete: FreteEntrega = { estado: "sem-endereco" };
    const base = { carrinho, endereco: null, frete, enviando: false, erro: null, aoAlterarQuantidade: nada, aoRemover: nada, aoTrocarEndereco: nada, aoConfirmar: nada, aoFechar: nada };
    const fechado = html(createElement(PainelCarrinho, { ...base, bloqueio }));
    const botao = tag(fechado, "data-confirmar-pedido");
    assert.ok(botao.includes('aria-disabled="true"') && !botao.includes('disabled=""') && botao.includes("opacity-50"));
    assert.ok(texto(fechado).includes("Abre novamente hoje às 18:00. Seus itens continuam aqui."));
    assert.ok(texto(fechado).includes("Suco"), "o carrinho não é esvaziado");
    const aberto = tag(html(createElement(PainelCarrinho, base)), "data-confirmar-pedido");
    assert.ok(!aberto.includes("aria-disabled") && aberto.includes('disabled=""'), "sem endereço, continua desabilitado como antes");
  });

  it("a recusa do servidor (empresa fechou na hora de confirmar) é tratada sem apagar o carrinho", () => {
    const codigo = semComentarios(fonte("../../conversas/components/conversa-tecnica.tsx"));
    assert.ok(codigo.includes('if (resultado.codigo === "EMPRESA_FECHADA") atualizarFuncionamento();'));
    const recusa = codigo.slice(codigo.indexOf("if (!resultado.ok) {"), codigo.indexOf("limpar();", codigo.indexOf("if (!resultado.ok) {")));
    assert.ok(recusa.includes("return;"), "na recusa a função sai antes de limpar o carrinho");
    assert.ok(semComentarios(fonte("./catalogo-da-empresa.tsx")).includes("if (!catalogo || !aoAdicionarAoCarrinho || bloqueio) return;"));
  });

  it("o visitante (link público) também recebe a explicação: a página dele monta os avisos", () => {
    assert.ok(fonte("../../link/components/entrada-pelo-link.tsx").includes("<AvisosDeAcao />"));
    assert.ok(fonte("../../link/components/pagina-do-visitante.tsx").includes("<CatalogoDaEmpresa"));
  });
});

describe("tela do gestor: Horários de funcionamento", () => {
  const salvo = (ativo: boolean, periodos: PeriodoFuncionamento[]): FuncionamentoEmpresa => {
    const { estado, hoje } = calcularFuncionamento({ ativo, periodos }, new Date("2026-10-05T10:00:00-03:00"), "America/Sao_Paulo");
    return { ativo, fusoHorario: "America/Sao_Paulo", periodos, estado, hoje };
  };
  const tela = (dados: FuncionamentoEmpresa, rascunho = rascunhoDoFuncionamento(dados.ativo, dados.periodos)) =>
    html(createElement(EditorDeHorarios, { salvo: dados, rascunho, erro: null, salvando: false, aoMudar: nada, aoDescartar: nada, aoSalvar: nada }));

  it("desligado: explica que recebe pedidos a qualquer hora e não mostra dias", () => {
    const marcacao = tela(salvo(false, []));
    assert.ok(tag(marcacao, 'id="controlar-horario"').includes('aria-checked="false"'));
    assert.ok(texto(marcacao).includes("a empresa recebe pedidos a qualquer dia e hora") && !marcacao.includes("data-dia-da-semana"));
  });

  it("ligado: Segunda a Domingo, com os períodos de cada dia ou 'Fechado', e o estado de agora", () => {
    const marcacao = tela(salvo(true, SEMANA));
    assert.equal([...marcacao.matchAll(/data-dia-da-semana=/g)].length, 7);
    for (const dia of ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]) assert.ok(texto(marcacao).includes(dia), dia);
    assert.equal([...marcacao.matchAll(/type="time"/g)].length, SEMANA.length * 2);
    assert.ok(marcacao.includes('value="08:00"') && marcacao.includes('value="14:00"') && marcacao.includes('value="02:00"'));
    assert.ok(texto(marcacao).includes("Fechado") && texto(marcacao).includes("Aberto agora · até 14:00"));
    assert.ok(texto(marcacao).includes("Fecha no dia seguinte, às 02:00."), "período que passa da meia-noite é explicado");
    assert.ok(texto(marcacao).includes("America/Sao Paulo"), "diz em que fuso os horários valem");
  });

  it("'Salvar horários' só habilita com alteração; com alteração o estado antigo não é exibido como atual", () => {
    const dados = salvo(true, SEMANA);
    assert.ok(tag(tela(dados), "data-salvar-horarios").includes('disabled=""') && tela(dados).includes('data-estado-dos-horarios="salvo"'));
    const mexido = tela(dados, { ...rascunhoDoFuncionamento(true, SEMANA), ativo: false });
    assert.ok(!tag(mexido, "data-salvar-horarios").includes('disabled=""') && mexido.includes('data-estado-dos-horarios="nao-salvo"') && !mexido.includes("data-estado-agora"));
  });

  it("usa o Interruptor e os campos de hora nativos; mobile-first, sem estilo inline", () => {
    const marcacao = tela(salvo(true, SEMANA));
    assert.ok(!marcacao.includes(" style="));
    assert.ok(marcacao.includes("sm:grid-cols-[9.5rem_minmax(0,1fr)]") && marcacao.includes("grid-cols-[1fr_1.6fr]"));
    const codigo = semComentarios(fonte("../../empresas/components/horarios-de-funcionamento.tsx"));
    assert.ok(codigo.includes("<Interruptor") && !codigo.includes('role="switch"') && !/style=\{/.test(codigo));
  });
});

describe("padronização de cores: áreas da empresa na mesma superfície de Conversas", () => {
  it("a área de trabalho usa `bg-superficie`, o mesmo token do painel de conversas — sem cor avulsa", () => {
    const app = fonte("../../../components/navegacao/app-jaa.tsx");
    assert.ok(/data-area-de-trabalho className="[^"]*\bbg-superficie\b/.test(app));
    assert.ok(fonte("../../../components/navegacao/mestre-detalhe.tsx").includes("border-borda bg-superficie"));
    assert.ok(fonte("../../../components/ui/janela.tsx").includes("bg-superficie") && !fonte("../../../components/ui/janela.tsx").includes("bg-fundo"));
    for (const arquivo of ["../../../components/navegacao/app-jaa.tsx", "../../../components/ui/janela.tsx"]) assert.ok(!/#[0-9a-fA-F]{6}\b/.test(semComentarios(fonte(arquivo))), `${arquivo}: nenhum hex avulso`);
  });
});
