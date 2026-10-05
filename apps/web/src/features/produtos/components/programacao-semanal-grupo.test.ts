import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { DiaSemana, GrupoOpcoesProduto, ProgramacaoSemanalGrupo } from "@jaa/contratos";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { rascunhoInicial } from "../lib/rascunho-do-grupo.ts";
import { AbaOpcoesERegras } from "./editor-de-grupo.tsx";
import { ListaDeGrupos } from "./gerenciador-personalizacao.tsx";
import { AbaProgramacaoSemanal, SeletorDeDias } from "./programacao-semanal-grupo.tsx";

/*
 * "Grupos de opções" do produto: cartões-resumo → editor do grupo (Opções e regras | Programação
 * semanal). Estes testes leem a MARCAÇÃO que as telas geram (e o código-fonte, para o que não se vê na
 * marcação estática). O comportamento com cliques é validado no navegador.
 */
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const html = (elemento: ReactElement) => renderToStaticMarkup(elemento);
const texto = (marcacao: string) => marcacao.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const fonte = (arquivo: string) => readFileSync(new URL(arquivo, import.meta.url), "utf8");
const semComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
const nada = () => {};
// A tag de abertura que carrega o atributo (a ordem dos atributos na marcação não importa).
const tag = (marcacao: string, atributo: string) => marcacao.match(new RegExp(`<[^>]*${atributo}[^>]*>`))?.[0] ?? "";
const desabilitado = (marcacao: string, atributo: string) => tag(marcacao, atributo).includes('disabled=""');

const grupo = (extra: Partial<GrupoOpcoesProduto> = {}): GrupoOpcoesProduto => ({
  id: ID(100),
  nome: "Guarnições",
  instrucao: "Escolha seus favoritos",
  minimoEscolhas: 0,
  maximoEscolhas: 5,
  posicao: 0,
  programacaoSemanal: true,
  opcoes: [
    { id: ID(1), nome: "Arroz", precoAdicionalCentavos: 0, disponibilidade: "disponivel", posicao: 0 },
    { id: ID(2), nome: "Feijão", precoAdicionalCentavos: 250, disponibilidade: "disponivel", posicao: 1 },
    { id: ID(3), nome: "Macarrão", precoAdicionalCentavos: 0, disponibilidade: "indisponivel", posicao: 2 },
  ],
  ...extra,
});
const programacao = (porDia: Partial<Record<DiaSemana, string[]>>): ProgramacaoSemanalGrupo => ({
  grupoId: ID(100),
  programacaoSemanal: true,
  dias: ([1, 2, 3, 4, 5, 6, 7] as const).map((diaSemana) => ({ diaSemana, opcaoIds: porDia[diaSemana] ?? [] })),
});
const SEMANA = programacao({ 1: [ID(1), ID(2), ID(3)], 2: [ID(1)] });

describe("grupos de opções na página do produto (cartões-resumo)", () => {
  const tamanho = grupo({ id: ID(200), nome: "Tamanho", minimoEscolhas: 1, maximoEscolhas: 1, programacaoSemanal: false, opcoes: grupo().opcoes.slice(0, 2) });
  const lista = () => html(createElement(ListaDeGrupos, { grupos: [grupo(), tamanho], ocupado: false, aoAbrir: nada, aoPedirExcluir: nada }));

  it("cada grupo é UM cartão: nome, regra em palavras, quantas opções e selos — sem opções, dias ou campos", () => {
    const marcacao = lista();
    assert.equal([...marcacao.matchAll(/data-grupo-admin=/g)].length, 2);
    assert.ok(texto(marcacao).includes("Guarnições Até 5 escolhas · Opcional 3 opções Semanal 1 indisponível"), texto(marcacao));
    assert.ok(texto(marcacao).includes("Tamanho Escolha única · Obrigatório 2 opções"));
    assert.ok(!texto(marcacao).includes("Arroz") && !texto(marcacao).includes("Feijão"), "as opções não aparecem no resumo");
    assert.ok(!marcacao.includes('role="tab"') && !marcacao.includes('role="switch"') && !marcacao.includes("<input"));
    assert.ok(!texto(marcacao).includes("Excluir"), "nenhuma ação destrutiva na superfície");
  });

  it("o cartão inteiro abre a edição (alvo ≥ 64px) e o menu ⋯ fica ao lado", () => {
    const marcacao = lista();
    assert.ok(tag(marcacao, "data-abrir-grupo").includes("min-h-16") && tag(marcacao, "data-abrir-grupo").includes('aria-label="Editar Guarnições"'));
    assert.equal([...marcacao.matchAll(/data-menu-mais/g)].length, 2);
    assert.ok(semComentarios(fonte("./gerenciador-personalizacao.tsx")).includes('rotulo: "Excluir grupo", perigosa: true'));
  });

  it("só o grupo COM programação ganha o selo 'Semanal'; problema de configuração vira selo de atenção", () => {
    const marcacao = lista();
    assert.equal([...marcacao.matchAll(/data-selo-semanal/g)].length, 1);
    const semOpcoes = html(createElement(ListaDeGrupos, { grupos: [grupo({ opcoes: [] })], ocupado: false, aoAbrir: nada, aoPedirExcluir: nada }));
    assert.ok(texto(semOpcoes).includes("Sem opções"));
    const exigeDemais = html(createElement(ListaDeGrupos, { grupos: [grupo({ minimoEscolhas: 3 })], ocupado: false, aoAbrir: nada, aoPedirExcluir: nada }));
    assert.ok(texto(exigeDemais).includes("Exige 3, há 2"));
  });

  it("o resumo não faz consulta por grupo, e 'Adicionar grupo de opções' abre o MESMO editor vazio", () => {
    const codigo = semComentarios(fonte("./gerenciador-personalizacao.tsx"));
    assert.ok(!codigo.includes("consultarProgramacaoSemanal"), "a programação só é lida dentro do grupo aberto");
    assert.ok(codigo.includes("data-novo-grupo") && codigo.includes("abrir(null)") && codigo.includes("Adicionar grupo de opções"));
    assert.ok(codigo.includes("<DialogoConfirmacao") && !codigo.includes("window.confirm"));
  });

  it("nenhum nome de grupo é especial no código", () => {
    for (const arquivo of ["./gerenciador-personalizacao.tsx", "./editor-de-grupo.tsx", "./programacao-semanal-grupo.tsx", "../lib/rascunho-do-grupo.ts", "../lib/previa-do-cliente.ts", "../lib/regra-do-grupo.ts"]) {
      assert.ok(!/Guarni|Tipo de carne|"Tamanho"/.test(semComentarios(fonte(arquivo))), arquivo);
    }
  });
});

describe("editor do grupo: aba Opções e regras", () => {
  const aba = (g: GrupoOpcoesProduto | null = grupo(), extra: Record<string, unknown> = {}) =>
    html(
      createElement(AbaOpcoesERegras, {
        rascunho: rascunhoInicial(g),
        ocupado: false,
        erro: null,
        excluir: null,
        aoMudar: nada,
        aoMudarOpcao: nada,
        aoAdicionarOpcao: nada,
        aoPedirApagarOpcao: nada,
        ...extra,
      }),
    );

  it("tem nome, instrução, mínimo e máximo do grupo, preenchidos", () => {
    const marcacao = aba();
    assert.ok(tag(marcacao, 'id="grupo-nome"').includes('value="Guarnições"'));
    assert.ok(tag(marcacao, 'id="grupo-instrucao"').includes('value="Escolha seus favoritos"'));
    assert.ok(tag(marcacao, 'id="grupo-minimo"').includes('value="0"') && tag(marcacao, 'id="grupo-maximo"').includes('value="5"'));
    assert.ok(texto(marcacao).includes("0 para tornar o grupo opcional.") && texto(marcacao).includes("Limite de opções por pedido."));
  });

  it("cada opção é uma linha: nome editável, acréscimo em reais, a chave 'ativa' e excluir", () => {
    const marcacao = aba();
    assert.equal([...marcacao.matchAll(/data-opcao-admin=/g)].length, 3);
    assert.ok(marcacao.includes('value="Feijão"') && marcacao.includes('value="2,50"'), "acréscimo em reais, sem float");
    assert.equal([...marcacao.matchAll(/role="switch"/g)].length, 3);
    assert.ok(marcacao.includes('aria-label="Disponibilidade de Macarrão"') && /aria-checked="false"[^>]*aria-label="Disponibilidade de Macarrão"/.test(marcacao));
    assert.ok(marcacao.includes('aria-label="Excluir Arroz"') && marcacao.includes('aria-label="Acréscimo de Arroz"'));
  });

  it("a linha tem duas composições: tabela no desktop, nome em largura total no celular", () => {
    const marcacao = aba();
    const linha = tag(marcacao, "data-opcao-admin=");
    assert.ok(linha.includes("grid-cols-[minmax(0,1fr)_auto_auto]") && linha.includes("sm:grid-cols-[minmax(0,1fr)_6.5rem_2.75rem_2.25rem]"));
    assert.ok(tag(marcacao, 'aria-label="Nome da opção 1"').includes("col-span-full sm:col-span-1"));
    assert.ok(texto(marcacao).includes("Opção Acréscimo (R$) Ativa"), "cabeçalho das colunas (escondido no celular)");
  });

  it("'Adicionar opção' acrescenta uma linha ao RASCUNHO; grupo novo começa vazio e avisa", () => {
    assert.ok(tag(aba(), "data-adicionar-opcao") !== "");
    const novo = aba(null);
    assert.ok(tag(novo, 'id="grupo-nome"').includes('value=""') && tag(novo, 'id="grupo-maximo"').includes('value="1"'));
    assert.ok(texto(novo).includes("Este grupo ainda não tem opções"));
  });

  it("usa o Interruptor de primitivos.tsx — não existe um segundo switch no código", () => {
    for (const arquivo of ["./editor-de-grupo.tsx", "./programacao-semanal-grupo.tsx"]) {
      const codigo = semComentarios(fonte(arquivo));
      assert.ok(codigo.includes("<Interruptor") && !codigo.includes('role="switch"'), arquivo);
    }
  });

  it("nada é gravado a cada toque: só 'Salvar grupo' chama a API, uma gravação por vez, sem duplicar opção", () => {
    const codigo = semComentarios(fonte("./editor-de-grupo.tsx"));
    assert.ok(codigo.includes("planejarGravacao(grupo, rascunho)") && codigo.includes("data-salvar-grupo disabled={!regrasAlteradas || trabalhando}"));
    assert.ok(/for \(const nova of plano\.novas\)[\s\S]*comOpcaoGravada\(emEdicao, nova\.chave, criada\.id\)/.test(codigo));
    assert.ok(codigo.includes("O que já tinha sido salvo continua salvo"), "falha no meio é dita com precisão");
  });

  it("excluir opção e sair com alteração pendente passam pela confirmação comum", () => {
    const codigo = semComentarios(fonte("./editor-de-grupo.tsx"));
    assert.ok(codigo.includes('"data-confirmar-acao": "apagar-opcao"') && codigo.includes('"descartar-dia" : "descartar-grupo"'));
    assert.ok(codigo.includes("if (diaAlterado || regrasAlteradas) setConfirmacao({ tipo: \"descartar\", alvo: \"tudo\", depois: aoFechar })"));
    assert.ok(codigo.includes("if (diaAlterado) setConfirmacao({ tipo: \"descartar\", alvo: \"dia\", depois: trocar })"));
    assert.ok(!codigo.includes("window.confirm"));
  });
});

describe("editor do grupo: aba Programação semanal", () => {
  const aba = (extra: Record<string, unknown> = {}) =>
    html(
      createElement(AbaProgramacaoSemanal, {
        grupo: grupo(),
        programacao: SEMANA,
        dia: 2 as DiaSemana,
        hoje: 1 as DiaSemana,
        rascunho: [ID(1)],
        alterado: false,
        ocupado: false,
        erro: null,
        aplicacao: null,
        aoAlternarProgramacao: nada,
        aoEscolherDia: nada,
        aoAlternarOpcao: nada,
        aoMarcarTodas: nada,
        aoLimpar: nada,
        aoAbrirAplicar: nada,
        aoAlternarDestino: nada,
        aoDefinirDestinos: nada,
        aoAplicar: nada,
        aoCancelarAplicar: nada,
        ...extra,
      }),
    );

  it("desligada: a chave e a explicação — nada de sete dias", () => {
    const marcacao = aba({ grupo: grupo({ programacaoSemanal: false }), programacao: null });
    assert.ok(marcacao.includes('data-programacao-semanal="desligada"') && marcacao.includes('aria-checked="false"'));
    assert.ok(texto(marcacao).includes("As opções estão disponíveis todos os dias"));
    assert.ok(!marcacao.includes("data-seletor-de-dias") && !marcacao.includes('type="checkbox"'));
  });

  it("grupo ainda não salvo: explica que é preciso salvar antes", () => {
    assert.ok(texto(aba({ grupo: null, programacao: null })).includes("Salve o grupo primeiro"));
  });

  it("Segunda–Domingo em sete colunas iguais (cabe em 320px, sem rolagem), com a contagem de cada dia", () => {
    const marcacao = html(createElement(SeletorDeDias, { grupo: grupo(), programacao: SEMANA, dia: 2 as DiaSemana, hoje: 1 as DiaSemana, aoEscolher: nada }));
    assert.ok(tag(marcacao, "data-seletor-de-dias").includes("grid-cols-7") && !marcacao.includes("overflow-x"));
    assert.equal([...marcacao.matchAll(/role="tab"/g)].length, 7);
    for (const sigla of ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]) assert.ok(texto(marcacao).includes(sigla), sigla);
    // Segunda: 3 marcadas, mas Macarrão está indisponível → o cliente encontra 2.
    assert.ok(tag(marcacao, 'data-dia="1"').includes('aria-label="Segunda (hoje): 2 opções"'));
    assert.ok(tag(marcacao, 'data-dia="2"').includes('aria-selected="true"') && tag(marcacao, 'data-dia="2"').includes("min-h-14"));
    assert.ok(marcacao.includes('<span class="hidden sm:inline"> opções</span>'), "por extenso só onde há espaço");
  });

  it("dia que não cumpre o mínimo é sinalizado na posição dele, com texto (não só cor)", () => {
    const exigente = grupo({ minimoEscolhas: 2 });
    const marcacao = html(createElement(SeletorDeDias, { grupo: exigente, programacao: SEMANA, dia: 1 as DiaSemana, hoje: 1 as DiaSemana, aoEscolher: nada }));
    assert.ok(tag(marcacao, 'data-dia="2"').includes("menos do que o grupo exige"));
    assert.ok(!tag(marcacao, 'data-dia="1"').includes("menos do que o grupo exige"));
  });

  it("mostra só o dia escolhido, com as opções JÁ cadastradas, 'Marcar todas' e 'Limpar'", () => {
    const marcacao = aba();
    assert.ok(texto(marcacao).includes("terça-feira"));
    assert.equal([...marcacao.matchAll(/data-opcao-do-dia=/g)].length, 3);
    assert.equal([...marcacao.matchAll(/type="checkbox"[^>]*checked=""/g)].length, 1, "só Arroz está marcado na terça");
    assert.ok(tag(marcacao, "data-marcar-todas") !== "" && tag(marcacao, "data-limpar-dia") !== "");
    assert.ok(desabilitado(aba({ rascunho: [] }), "data-limpar-dia"), "nada marcado: não há o que limpar");
  });

  it("opção indisponível: selo na linha e a explicação de que programar não a faz aparecer", () => {
    const marcacao = aba();
    assert.ok(/Macarrão\s+Indisponível/.test(texto(marcacao)));
    assert.ok(texto(marcacao).includes("Opções indisponíveis não aparecem no cardápio, mesmo quando programadas."));
    assert.ok(texto(marcacao).includes("Opção nova não entra sozinha nos dias"));
  });

  it("as marcações na tela são o RASCUNHO: nada é gravado a cada toque, só em 'Salvar dia'", () => {
    const codigo = semComentarios(fonte("./editor-de-grupo.tsx"));
    assert.ok(codigo.includes("aoAlternarOpcao={(opcaoId, marcada) => setRascunhoDoDia(alternarOpcao(marcacoes, opcaoId, marcada))}"));
    assert.equal([...codigo.matchAll(/definirOpcoesDoDia\(/g)].length, 2, "só em salvarDia e em aplicar");
    assert.ok(codigo.includes("data-salvar-dia disabled={!diaAlterado || trabalhando}"), "desabilitado sem alteração e enquanto salva");
    assert.ok(!semComentarios(fonte("./programacao-semanal-grupo.tsx")).includes("definirOpcoesDoDia"), "a aba é só apresentação");
  });

  it("o rodapé da janela diz o estado e traz a ação da aba atual (Salvar grupo ou Salvar dia)", () => {
    const codigo = semComentarios(fonte("./editor-de-grupo.tsx"));
    assert.ok(codigo.includes('"Alterações ainda não salvas"') && codigo.includes('"Todas as alterações salvas"'));
    assert.ok(codigo.includes("data-estado-do-dia=") && codigo.includes("data-estado-do-grupo="));
    assert.ok(codigo.includes("grid grid-cols-[1fr_1.4fr] gap-2 sm:flex"), "no celular, dois botões largos lado a lado");
  });

  it("aviso de mínimo acompanha o que está NA TELA; com mínimo 0, dia vazio não avisa", () => {
    const exigente = grupo({ minimoEscolhas: 2 });
    assert.ok(texto(aba({ grupo: exigente, rascunho: [ID(1)] })).includes("Este grupo exige pelo menos 2 escolhas, mas terça-feira possui apenas 1 opção disponível"));
    assert.ok(!texto(aba({ grupo: exigente, rascunho: [ID(1), ID(2)] })).includes("exige pelo menos"));
    assert.ok(!texto(aba({ rascunho: [] })).includes("exige pelo menos"));
  });

  it("'Copiar para outros dias' só com o dia SALVO; escolhe destinos (sem o próprio dia), com atalhos", () => {
    assert.ok(!desabilitado(aba(), "data-abrir-aplicar"));
    assert.ok(desabilitado(aba({ alterado: true, rascunho: [ID(1), ID(2)] }), "data-abrir-aplicar"), "com alteração pendente, primeiro salvar");
    const aberto = aba({ aplicacao: { destinos: [3, 4], mensagem: null } });
    assert.equal([...aberto.matchAll(/data-destino=/g)].length, 6);
    assert.ok(!aberto.includes('data-destino="2"'), "o próprio dia não é destino");
    assert.ok(texto(aberto).includes("Aplicar opções de terça em:") && texto(aberto).includes("Dias úteis") && texto(aberto).includes("Todos os outros"));
    assert.ok(!desabilitado(aberto, 'data-aplicar="true"') && desabilitado(aba({ aplicacao: { destinos: [], mensagem: null } }), 'data-aplicar="true"'));
  });

  it("falha parcial ao copiar fica escrita na tela, com os dias que ficaram de fora", () => {
    const marcacao = aba({ aplicacao: { destinos: [6], mensagem: { tom: "erro", texto: "Aplicado a quarta. NÃO foi aplicado a sábado — tente de novo nesses dias." } } });
    assert.ok(marcacao.includes('role="alert"') && texto(marcacao).includes("NÃO foi aplicado a sábado"));
    const codigo = semComentarios(fonte("./editor-de-grupo.tsx"));
    assert.ok(codigo.includes("setAplicacao({ destinos: resultado.falhas, mensagem })") && codigo.includes("if (resultado.programacao) setProgramacao(resultado.programacao)"));
  });
});

describe("responsividade estrutural e Tailwind", () => {
  const ARQUIVOS = [
    "./editor-de-grupo.tsx",
    "./programacao-semanal-grupo.tsx",
    "./gerenciador-personalizacao.tsx",
    "./formulario-produto.tsx",
    "./previa-do-cliente.tsx",
    "./cabecalho-pagina.tsx",
    "../../../components/ui/janela.tsx",
    "../../../components/ui/folha.tsx",
    "../../../components/ui/faixa-rolavel.tsx",
    "../../../components/ui/menu-mais.tsx",
    "../../../components/ui/confirmacao.tsx",
  ];

  it("nenhum estilo inline, CSS Module ou styled-components nos arquivos da funcionalidade", () => {
    for (const arquivo of ARQUIVOS) {
      const codigo = semComentarios(fonte(arquivo));
      assert.ok(!/style=\{/.test(codigo), `${arquivo}: sem style inline`);
      assert.ok(!/\.module\.css|styled-components|styled\./.test(codigo), `${arquivo}: sem CSS Modules/styled`);
    }
  });

  it("a janela: TELA INTEIRA no celular, diálogo centralizado a partir de sm, rodapé com área segura", () => {
    const codigo = fonte("../../../components/ui/janela.tsx");
    assert.ok(codigo.includes("h-dvh w-full") && codigo.includes("sm:h-auto sm:max-h-[90dvh] sm:rounded-jaa"));
    assert.ok(codigo.includes("sm:items-center sm:justify-center") && codigo.includes('larga: "sm:max-w-3xl"') && codigo.includes('estreita: "sm:max-w-lg"'));
    assert.ok(codigo.includes("pb-[max(0.75rem,env(safe-area-inset-bottom))]") && codigo.includes("pt-[max(1rem,env(safe-area-inset-top))]"));
    assert.ok(codigo.includes("overflow-y-auto overscroll-contain"), "só o corpo rola; cabeçalho, abas e ações ficam no lugar");
    assert.ok(codigo.includes('if (evento.key === "Escape") aoFechar()'));
  });

  it("áreas de toque ≥ 44px no celular: abas, dias, opções do dia, destinos e menu", () => {
    assert.ok(fonte("../../../components/ui/janela.tsx").includes("min-h-12"), "abas");
    const semana = fonte("./programacao-semanal-grupo.tsx");
    assert.ok(semana.includes("min-h-14 min-w-0") && semana.includes("flex min-h-14 cursor-pointer") && semana.includes("flex min-h-11 cursor-pointer"));
    assert.ok(fonte("../../../components/ui/menu-mais.tsx").includes("h-11 w-11"));
  });
});
