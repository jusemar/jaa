import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { BaseEmpresa, BaseProfissionalDoDono, EnderecoCliente, IntencaoProfissional } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BuscaProfissionais } from "./components/busca-profissionais.tsx";
import { MAXIMO_SELECIONADOS, alternarSelecionado, alternarTodos, estadoSelecionarTodos, locaisSalvosParaPesquisa, modoDaPesquisa, rotuloHorario } from "./lib/apresentacao-busca.ts";
import { enviarParaSelecionados, type DependenciasEnvio } from "./lib/enviar-para-selecionados.ts";
import { carregarLocaisDaPesquisa, type FontesLocais } from "./lib/locais-da-pesquisa.ts";

const AGORA = "2026-09-27T12:00:00.000Z";
const endereco = (id: string, dados: Partial<EnderecoCliente>): EnderecoCliente => ({
  id,
  apelido: "Casa",
  cep: "30130010",
  logradouro: "Rua A",
  numero: "10",
  complemento: null,
  bairro: "Centro",
  cidade: "Belo Horizonte",
  uf: "MG",
  pontoReferencia: null,
  latitude: -19.9,
  longitude: -43.9,
  localizacaoConfirmadaEm: AGORA,
  criadoEm: AGORA,
  atualizadoEm: AGORA,
  ...dados,
});
const base: BaseProfissionalDoDono = {
  cep: "30130010",
  logradouro: "Av. Base",
  numero: "500",
  complemento: null,
  bairro: "Centro",
  cidade: "Belo Horizonte",
  uf: "MG",
  pontoReferencia: null,
  codigoIbge: null,
  coordenadas: { latitude: -19.91, longitude: -43.93 },
  atualizadoEm: AGORA,
};

describe("modo do campo Pesquisar no Jaaa", () => {
  it("@ = busca de pessoas; sem @ = também profissional", () => {
    assert.equal(modoDaPesquisa("@joao"), "usuario");
    assert.equal(modoDaPesquisa("  @joao"), "usuario");
    assert.equal(modoDaPesquisa("motoboy"), "livre");
    assert.equal(modoDaPesquisa("joão da silva"), "livre");
  });
});

describe("local da pesquisa reaproveitado", () => {
  it("base confirmada e endereços confirmados da própria pessoa; sem ponto confirmado não entra", () => {
    const locais = locaisSalvosParaPesquisa(
      [endereco("0199aaaa-0000-7000-8000-000000000001", { apelido: "Trabalho" }), endereco("0199aaaa-0000-7000-8000-000000000002", { latitude: null, longitude: null, localizacaoConfirmadaEm: null })],
      base,
    );
    assert.deepEqual(
      locais.map((local) => [local.rotulo, local.descricao, local.coordenadas]),
      [
        ["Base do perfil profissional", "Av. Base, 500 – Belo Horizonte", { latitude: -19.91, longitude: -43.93 }],
        ["Trabalho", "Rua A, 10 – Belo Horizonte", { latitude: -19.9, longitude: -43.9 }],
      ],
    );
  });

  it("base sem ponto confirmado e agenda vazia = nenhum local (a pessoa digita ou usa a localização)", () => {
    assert.deepEqual(locaisSalvosParaPesquisa([], { ...base, coordenadas: null }), []);
  });
});

describe("local já cadastrado acompanha a IDENTIDADE ATUANTE", () => {
  const EMPRESA_ID = "0199aaaa-0000-7000-8000-0000000000e1";
  const IDENTIDADE_EMPRESA = "0199aaaa-0000-7000-8000-0000000000e2";
  const baseEmpresa: BaseEmpresa = {
    cep: "30668635",
    logradouro: "Avenida Perimetral",
    numero: "3368",
    complemento: null,
    bairro: "Santa Rita (Barreiro)",
    cidade: "Belo Horizonte",
    uf: "MG",
    pontoReferencia: null,
    raioMetros: 150,
    latitude: -20.0026,
    longitude: -44.0267,
    localizacaoConfirmadaEm: AGORA,
    atualizadoEm: AGORA,
  };

  function fontes(dados: { base?: BaseEmpresa | null; operavel?: boolean } = {}) {
    const chamadas: string[] = [];
    const fontesFalsas: FontesLocais = {
      listarEnderecos: async () => {
        chamadas.push("enderecos");
        return { ok: true, status: 200, dados: { enderecos: [endereco("0199aaaa-0000-7000-8000-000000000001", {})] } };
      },
      buscarPerfilProfissional: async () => {
        chamadas.push("perfil");
        return { ok: true, status: 200, dados: { perfil: { base } } };
      },
      verificarIdentidadeOperavel: async (identidadeId) => {
        chamadas.push(`operavel:${identidadeId}`);
        return dados.operavel === false
          ? { ok: false, status: 404, codigo: null, mensagem: "Não encontrada." }
          : { ok: true, status: 200, dados: { tipo: "empresarial", identidadeId, nomeExibicao: "pizzaria isaque", nomeUsuario: "isaque", fotoUrl: null, empresa: { id: EMPRESA_ID, slug: "isaque", papel: "proprietario" } } };
      },
      obterBaseEmpresa: async (empresaId) => {
        chamadas.push(`base:${empresaId}`);
        return dados.base ? { ok: true, status: 200, dados: dados.base } : { ok: false, status: 404, codigo: null, mensagem: "Base não configurada." };
      },
    };
    return { fontesFalsas, chamadas };
  }

  it("PESSOA: só a base profissional e os endereços dela; nunca consulta empresa", async () => {
    const { fontesFalsas, chamadas } = fontes({ base: baseEmpresa });
    const locais = await carregarLocaisDaPesquisa(null, fontesFalsas);
    assert.deepEqual(locais.map((local) => local.chave), ["base-profissional", "endereco-0199aaaa-0000-7000-8000-000000000001"]);
    assert.deepEqual(chamadas.sort(), ["enderecos", "perfil"]);
  });

  it("EMPRESA com base confirmada: a base DA EMPRESA ativa (empresa dita pelo servidor), sem locais pessoais", async () => {
    const { fontesFalsas, chamadas } = fontes({ base: baseEmpresa });
    const locais = await carregarLocaisDaPesquisa(IDENTIDADE_EMPRESA, fontesFalsas);
    assert.deepEqual(locais, [
      {
        chave: "base-empresa",
        rotulo: "Base de pizzaria isaque",
        descricao: "Avenida Perimetral, 3368 – Santa Rita (Barreiro), Belo Horizonte/MG",
        coordenadas: { latitude: -20.0026, longitude: -44.0267 },
      },
    ]);
    assert.deepEqual(chamadas, [`operavel:${IDENTIDADE_EMPRESA}`, `base:${EMPRESA_ID}`]);
  });

  it("EMPRESA sem base, ou com base sem ponto confirmado: nenhum local (Digitar endereço / Usar minha localização)", async () => {
    assert.deepEqual(await carregarLocaisDaPesquisa(IDENTIDADE_EMPRESA, fontes({ base: null }).fontesFalsas), []);
    const semPonto = { ...baseEmpresa, latitude: null, longitude: null, localizacaoConfirmadaEm: null };
    assert.deepEqual(await carregarLocaisDaPesquisa(IDENTIDADE_EMPRESA, fontes({ base: semPonto }).fontesFalsas), []);
  });

  it("identidade que a conta NÃO opera: nenhuma base é pedida (nem de outra empresa)", async () => {
    const { fontesFalsas, chamadas } = fontes({ base: baseEmpresa, operavel: false });
    assert.deepEqual(await carregarLocaisDaPesquisa(IDENTIDADE_EMPRESA, fontesFalsas), []);
    assert.deepEqual(chamadas, [`operavel:${IDENTIDADE_EMPRESA}`]);
  });
});

describe("resultados e seleção", () => {
  it("horário é informação: Atendendo agora / Fechado agora", () => {
    assert.equal(rotuloHorario(true), "Atendendo agora");
    assert.equal(rotuloHorario(false), "Fechado agora");
    assert.equal(rotuloHorario(null), null);
  });

  it(`seleção explícita, um por um, com teto de ${MAXIMO_SELECIONADOS}`, () => {
    let selecionados: string[] = [];
    for (let indice = 0; indice < MAXIMO_SELECIONADOS + 3; indice += 1) selecionados = alternarSelecionado(selecionados, `id-${indice}`);
    assert.equal(selecionados.length, MAXIMO_SELECIONADOS);
    assert.deepEqual(alternarSelecionado(selecionados, "id-0").includes("id-0"), false);
  });
});

describe("mensagem para os selecionados pelas conversas de sempre", () => {
  function falso(falhas: { abrir?: string[]; enviar?: string[] } = {}) {
    const chamadas: Array<{ conversaId: string; idCliente: string; conteudo: string }> = [];
    let contador = 0;
    const dependencias: DependenciasEnvio = {
      abrirConversa: async (nomeUsuario) =>
        falhas.abrir?.includes(nomeUsuario) ? { ok: false, status: 404, codigo: null, mensagem: "Não encontrado." } : { ok: true, status: 200, dados: { id: `conversa-${nomeUsuario}` } },
      enviarMensagem: async (conversaId, entrada) => {
        chamadas.push({ conversaId, ...entrada });
        return falhas.enviar?.includes(conversaId) ? { ok: false, status: 0, codigo: null, mensagem: "Sem conexão." } : { ok: true, status: 201, dados: {} };
      },
      novoIdCliente: () => `id-${++contador}`,
    };
    return { dependencias, chamadas };
  }
  const ana = { identidadeId: "a", nomeUsuario: "ana" };
  const beto = { identidadeId: "b", nomeUsuario: "beto" };
  const caio = { identidadeId: "c", nomeUsuario: "caio" };

  it("cada selecionado recebe numa conversa DIRETA própria, com idCliente próprio (sem grupo)", async () => {
    const { dependencias, chamadas } = falso();
    const situacoes = await enviarParaSelecionados([ana, beto], "Oi", new Map(), dependencias);
    assert.deepEqual(chamadas, [
      { conversaId: "conversa-ana", idCliente: "id-1", conteudo: "Oi" },
      { conversaId: "conversa-beto", idCliente: "id-2", conteudo: "Oi" },
    ]);
    assert.deepEqual([...situacoes.values()].map((situacao) => situacao.tipo), ["enviada", "enviada"]);
  });

  it("uma falha não impede os outros; tentar de novo reusa o MESMO idCliente e não reenvia a quem já recebeu", async () => {
    const primeira = falso({ enviar: ["conversa-beto"], abrir: ["caio"] });
    const ids = new Map<string, string>();
    const situacoes = await enviarParaSelecionados([ana, beto, caio], "Oi", ids, primeira.dependencias);
    assert.deepEqual([situacoes.get("a")?.tipo, situacoes.get("b")?.tipo, situacoes.get("c")?.tipo], ["enviada", "erro", "erro"]);

    const segunda = falso();
    await enviarParaSelecionados([ana, beto, caio], "Oi", ids, segunda.dependencias, situacoes);
    // Ana já recebeu: não é chamada de novo. Beto usa o mesmo id da tentativa anterior (idempotência).
    assert.deepEqual(
      segunda.chamadas.map((chamada) => [chamada.conversaId, chamada.idCliente]),
      [
        ["conversa-beto", ids.get("b")],
        ["conversa-caio", ids.get("c")],
      ],
    );
    assert.equal(ids.get("b"), "id-2");
  });
});

describe("tela de busca dentro de Conversas", () => {
  const intencao: IntencaoProfissional = { servicoId: "0199b000-0000-7000-8000-000000000011", especialidadeId: null, opcaoId: "0199b000-0000-7000-8000-000000000031", rotulo: "Entregador · Moto", exata: true };

  it("abre pedindo o local da pesquisa; raio padrão 10 km; pesquisar só com local confirmado", () => {
    const html = renderToStaticMarkup(createElement(BuscaProfissionais, { intencao, aoFechar: () => {}, aoAbrirConversa: () => {} }));
    assert.ok(html.includes("Entregador · Moto"));
    assert.ok(html.includes("Local da pesquisa"));
    for (const km of [5, 10, 20, 30, 50]) assert.ok(html.includes(`>${km} km<`));
    assert.match(html, /aria-checked="true"[^>]*>10 km</);
    assert.match(html, /<button[^>]*disabled=""[^>]*>Pesquisar<\/button>/);
    assert.ok(html.includes("Usar minha localização"));
    assert.ok(html.includes("Digitar endereço"));
  });

  it("reusa o mapa Mapbox aprovado, o mensageiro existente e não chama Leaflet", () => {
    const mapa = readFileSync(new URL("./components/confirmar-ponto-pesquisa.tsx", import.meta.url), "utf8");
    assert.match(mapa, /criarMapaPontoPreferido\(/);
    assert.doesNotMatch(mapa, /criarMapaLeaflet|mapbox-gl/);
    const tela = readFileSync(new URL("./components/busca-profissionais.tsx", import.meta.url), "utf8");
    assert.match(tela, /abrirConversaDireta/);
    assert.match(tela, /enviarMensagem/);
  });
});

describe("selecionar todos os profissionais exibidos", () => {
  const ids = (quantos: number) => Array.from({ length: quantos }, (_, indice) => `id-${indice}`);

  it("marca todos os exibidos e, marcado, desmarca todos", () => {
    const exibidos = ids(4);
    const todos = alternarTodos(exibidos, []);
    assert.deepEqual(todos, exibidos);
    assert.equal(estadoSelecionarTodos(exibidos, todos), "todos");
    assert.deepEqual(alternarTodos(exibidos, todos), []);
    assert.equal(estadoSelecionarTodos(exibidos, []), "nenhum");
  });

  it("desmarcar um à mão deixa de ser 'todos'; tocar de novo completa mantendo os já marcados", () => {
    const exibidos = ids(4);
    const semUm = alternarSelecionado(alternarTodos(exibidos, []), "id-2");
    assert.equal(estadoSelecionarTodos(exibidos, semUm), "alguns");
    const completos = alternarTodos(exibidos, semUm);
    assert.deepEqual([...completos].sort(), [...exibidos].sort());
    assert.equal(estadoSelecionarTodos(exibidos, completos), "todos");
  });

  it(`respeita o teto de ${MAXIMO_SELECIONADOS}: lista maior seleciona os primeiros, preservando quem já estava`, () => {
    const exibidos = ids(MAXIMO_SELECIONADOS + 5);
    const todos = alternarTodos(exibidos, []);
    assert.deepEqual(todos, exibidos.slice(0, MAXIMO_SELECIONADOS));
    assert.equal(estadoSelecionarTodos(exibidos, todos), "todos", "no teto, é o máximo possível");
    // Quem a pessoa marcou à mão (lá no fim da lista) continua na seleção.
    const comEscolha = alternarTodos(exibidos, [`id-${MAXIMO_SELECIONADOS + 4}`]);
    assert.equal(comEscolha.length, MAXIMO_SELECIONADOS);
    assert.ok(comEscolha.includes(`id-${MAXIMO_SELECIONADOS + 4}`));
  });

  it("na tela: a opção fica acima da lista e usa a mesma seleção do envio (nada novo no envio)", () => {
    const tela = readFileSync(new URL("./components/busca-profissionais.tsx", import.meta.url), "utf8");
    assert.ok(tela.indexOf("<SelecionarTodos") > 0 && tela.indexOf("<SelecionarTodos") < tela.indexOf("{resultados.map((item) => {"));
    assert.ok(tela.includes("Selecionar todos") && tela.includes("caixa.indeterminate = estado === \"alguns\""));
    assert.equal((tela.match(/enviarParaSelecionados\(/g) ?? []).length, 1);
  });
});

describe("pagamento online no carrinho", () => {
  it("é um accordion RECOLHIDO por padrão, com as duas formas como 'Em breve' e desabilitadas", () => {
    const tela = readFileSync(new URL("../carrinho/components/painel-carrinho.tsx", import.meta.url), "utf8");
    assert.match(tela, /<details data-pagamento-online-em-breve className/);
    assert.doesNotMatch(tela, /<details data-pagamento-online-em-breve[^>]* open/);
    assert.ok(tela.includes("Pagamento online — em breve") && tela.includes("<fieldset disabled aria-labelledby=\"pagamento-online-titulo\""));
    assert.ok(tela.includes('rotulo: "Pix online"') && tela.includes('rotulo: "Cartão online"') && tela.includes("(Em breve)"));
  });
});

