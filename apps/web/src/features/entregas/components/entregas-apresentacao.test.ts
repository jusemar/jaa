import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type {
  EntregaAtribuida,
  EntregaDoPedido,
  EntregadorDaEmpresa,
  PainelOperacional,
  SaidaEntrega,
  SituacaoOperacional,
  StatusPedido,
  VinculoEntregador,
} from "@jaa/contratos";
import { GRUPOS_DO_QUADRO_DE_ENTREGADORES, classificarQuadroDeEntregadores, type GrupoDoQuadroDeEntregadores } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ConvitesParaEntregar,
  EmpresasEmQueTrabalho,
  ListaMinhasEntregas,
  MapaDaSaidaRecolhivel,
  entregasForaDasSaidas,
} from "./area-minhas-entregas.tsx";
import { EntregaDoPedidoEmpresa } from "./entrega-do-pedido.tsx";
import { AbasDoQuadro, ConvitesPendentes, ListaDoGrupo } from "./quadro-entregadores.tsx";

const texto = (html: string) => html.replace(/<[^>]+>/g, "").replace(/ /g, " ");
const uuid = (n: number) =>
  `${String(n).repeat(8)}-0000-4000-8000-000000000000`;

const pessoa = (nome: string, usuario: string) => ({
  identidadeId: uuid(nome.length),
  tipo: "pessoal" as const,
  nomeExibicao: nome,
  nomeUsuario: usuario,
});

const paulo: EntregadorDaEmpresa = {
  id: uuid(1),
  pessoa: pessoa("Paulo Entregador", "paulo"),
  status: "ativo",
  disponivel: true,
  convidadoEm: "2026-09-16T12:00:00.000Z",
  respondidoEm: "2026-09-16T12:05:00.000Z",
};
const joao: EntregadorDaEmpresa = {
  ...paulo,
  id: uuid(2),
  pessoa: pessoa("João Entregador", "joao"),
  status: "inativo",
};
const convidado: EntregadorDaEmpresa = {
  ...paulo,
  id: uuid(3),
  pessoa: pessoa("Carlos Entregador", "carlos"),
  status: "convidado",
  respondidoEm: null,
};

describe("quadro de entregadores da empresa", () => {
  const painel = (
    estado:
      | "disponivel_na_base"
      | "disponivel_fora_base"
      | "indisponivel"
      | "em_entrega",
    entregador = paulo,
  ): PainelOperacional => {
    const item = {
      id: entregador.id,
      pessoa: entregador.pessoa,
      status: entregador.status,
      disponivel: entregador.disponivel,
      naBase: estado === "disponivel_na_base",
      aptoParaSaida: true,
      estado,
      posicaoFila: estado === "disponivel_na_base" ? 1 : null,
      filaEntrouEm:
        estado === "disponivel_na_base" ? "2026-09-16T12:00:00.000Z" : null,
    };
    return {
      baseConfigurada: true,
      fila: estado === "disponivel_na_base" ? [item] : [],
      foraDaBase: estado === "disponivel_fora_base" ? [item] : [],
      indisponiveis:
        estado === "indisponivel" || estado === "em_entrega" ? [item] : [],
    };
  };
  const vazio: PainelOperacional = { baseConfigurada: true, fila: [], foraDaBase: [], indisponiveis: [] };
  // O grupo escolhido, como a tela o desenha: a classificação compartilhada + a lista de UMA situação.
  const grupo = (
    id: GrupoDoQuadroDeEntregadores,
    entregadores: EntregadorDaEmpresa[],
    operacao: PainelOperacional = vazio,
  ) => {
    const definicao = GRUPOS_DO_QUADRO_DE_ENTREGADORES.find((item) => item.id === id);
    assert.ok(definicao);
    return renderToStaticMarkup(
      createElement(ListaDoGrupo, {
        rotulo: definicao.rotulo,
        vazio: definicao.vazio,
        linhas: classificarQuadroDeEntregadores(entregadores, operacao).grupos[id],
        ocupado: false,
        aoAlterarStatus: () => {},
      }),
    );
  };
  const todos = [paulo, joao, convidado];

  it("cada opção mostra SOMENTE a sua categoria, com nome público e @usuario", () => {
    const disponiveis = texto(grupo("disponiveis", todos, painel("disponivel_na_base")));
    assert.ok(disponiveis.includes("Paulo Entregador") && disponiveis.includes("@paulo") && disponiveis.includes("1º da fila da base"));
    assert.equal(disponiveis.includes("João") || disponiveis.includes("Carlos"), false);

    const desativados = texto(grupo("desativados", todos, painel("disponivel_na_base")));
    assert.ok(desativados.includes("João Entregador") && desativados.includes("Desativado"));
    assert.equal(desativados.includes("Paulo") || desativados.includes("Carlos"), false);
    // Só identidade pública: nunca telefone nem dados de conta.
    assert.equal(disponiveis.includes("+55") || desativados.includes("+55"), false);
  });

  it("Na rota, Fora da base e Indisponíveis seguem o estado operacional do servidor", () => {
    const naRota = texto(grupo("na_rota", todos, painel("em_entrega")));
    assert.ok(naRota.includes("Paulo Entregador") && naRota.includes("Em entrega"));
    assert.equal(naRota.includes("Disponível"), false);
    assert.ok(texto(grupo("disponiveis", todos, painel("em_entrega"))).includes("Ninguém disponível na base agora."));

    assert.ok(texto(grupo("fora_da_base", todos, painel("disponivel_fora_base"))).includes("Disponível fora da base"));
    assert.ok(texto(grupo("fora_da_base", todos, painel("indisponivel"))).includes("Ninguém disponível fora da base."));
    assert.ok(texto(grupo("indisponiveis", todos, painel("indisponivel"))).includes("Não aceitando entregas"));
  });

  it("ativo pode ser desativado, desativado que já aceitou é reativado e quem nunca aceitou depende de novo convite", () => {
    assert.ok(texto(grupo("disponiveis", [paulo], painel("disponivel_na_base"))).includes("Desativar"));
    assert.ok(texto(grupo("desativados", [joao])).includes("Ativar"));
    const semAceite = grupo("desativados", [{ ...joao, respondidoEm: null }]);
    assert.equal(semAceite.includes("data-alternar-entregador"), false);
    assert.ok(texto(semAceite).includes("precisa de novo convite"));
  });

  it("convite pendente não aparece em nenhuma opção: fica junto do convite, sem ação da empresa", () => {
    for (const { id } of GRUPOS_DO_QUADRO_DE_ENTREGADORES) assert.equal(texto(grupo(id, todos, painel("disponivel_na_base"))).includes("Carlos"), false, id);
    const pendentes = renderToStaticMarkup(createElement(ConvitesPendentes, { pendentes: classificarQuadroDeEntregadores(todos, vazio).pendentes }));
    assert.ok(texto(pendentes).includes("Aguardando aceite") && texto(pendentes).includes("Carlos Entregador") && texto(pendentes).includes("Convite enviado"));
    assert.equal(pendentes.includes("<button"), false);
    assert.equal(renderToStaticMarkup(createElement(ConvitesPendentes, { pendentes: [] })), "");
  });

  it("as opções: uma marcada por vez, com a quantidade de cada grupo e a base por último", () => {
    const quadro = classificarQuadroDeEntregadores(todos, painel("disponivel_na_base"));
    const html = renderToStaticMarkup(createElement(AbasDoQuadro, { aba: "desativados", quadro, aoEscolher: () => {} }));
    assert.deepEqual([...html.matchAll(/data-aba-entregadores="([^"]+)"/g)].map((item) => item[1]), ["na_rota", "disponiveis", "fora_da_base", "indisponiveis", "desativados", "operacao_da_base"]);
    assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
    assert.ok(/aria-selected="true"[^>]*data-aba-entregadores="desativados"/.test(html));
    assert.ok(texto(html).includes("Disponíveis1") && texto(html).includes("Desativados1") && texto(html).includes("Na rota0") && texto(html).includes("Operação da base"));
  });

  it("um único fluxo de convite, e a base sai da visão permanente (vira a opção 'Operação da base')", () => {
    const fonte = readFileSync(new URL("./quadro-entregadores.tsx", import.meta.url), "utf8");
    assert.equal((fonte.match(/data-convidar-entregador/g) ?? []).length, 1);
    assert.equal((fonte.match(/Buscar pessoa para convidar/g) ?? []).length, 1);
    assert.ok(fonte.includes("{aba === ABA_OPERACAO_DA_BASE && <PainelOperacionalEmpresa"));
    const logistica = readFileSync(new URL("./area-logistica-empresa.tsx", import.meta.url), "utf8");
    assert.equal(logistica.includes("PainelOperacionalEmpresa"), false);
  });
});

describe("convite para entregar", () => {
  it("usa a mensagem aprovada sem apresentar a palavra vínculo", () => {
    const html = renderToStaticMarkup(
      createElement(ConvitesParaEntregar, {
        convites: [
          {
            id: uuid(6),
            empresa: {
              identidadeId: uuid(7),
              nome: "Pizzaria BH",
              nomeUsuario: "pizzaria",
              slug: "pizzaria",
            },
            status: "convidado",
            convidadoEm: "2026-09-16T12:00:00.000Z",
          },
        ],
        aoAceitar: () => {},
      }),
    );
    const conteudo = texto(html);
    assert.ok(
      conteudo.includes("Pizzaria BH convidou você para fazer entregas."),
    );
    assert.ok(conteudo.includes("status Disponível e na base local"));
    assert.ok(conteudo.includes("Aceitar convite"));
    // A única ação é aceitar: não existe recusa (quem não quer deixa o convite pendente).
    assert.equal(conteudo.includes("Recusar"), false);
    assert.equal(
      conteudo.toLocaleLowerCase("pt-BR").includes("vínculo"),
      false,
    );
  });
});

describe("entrega no detalhe do pedido", () => {
  const entrega = (
    parcial: Partial<EntregaDoPedido> = {},
  ): EntregaDoPedido => ({
    entregadorAtual: {
      id: paulo.id,
      pessoa: paulo.pessoa,
      status: "ativo",
      disponivel: true,
      atribuidoEm: "2026-09-16T14:30:00.000Z",
    },
    historico: [
      {
        id: uuid(4),
        entregador: paulo.pessoa,
        atribuidoEm: "2026-09-16T14:30:00.000Z",
        encerradoEm: null,
        motivoEncerramento: null,
      },
    ],
    ...parcial,
  });

  const render = (
    status: StatusPedido,
    dados: EntregaDoPedido | null,
    ativos: EntregadorDaEmpresa[] = [paulo],
  ) =>
    renderToStaticMarkup(
      createElement(EntregaDoPedidoEmpresa, {
        status,
        entrega: dados,
        entregadoresAtivos: ativos,
        ocupado: false,
        aoAtribuir: () => {},
      }),
    );

  it("pedido pronto sem entregador oferece atribuir", () => {
    const html = render("pronto", { entregadorAtual: null, historico: [] });
    assert.ok(texto(html).includes("Nenhum"));
    assert.ok(texto(html).includes("Atribuir entregador"));
  });

  it("com entregador mostra quem está levando e permite trocar", () => {
    const conteudo = texto(render("saiu_para_entrega", entrega()));
    assert.ok(conteudo.includes("Paulo Entregador (@paulo)"));
    assert.ok(conteudo.includes("Trocar entregador"));
  });

  it("status sem entrega (recebido, entregue, cancelado) não oferece atribuição", () => {
    for (const status of [
      "recebido",
      "confirmado",
      "em_preparacao",
      "entregue",
      "cancelado",
    ] as const) {
      assert.equal(
        render(status, entrega()).includes("data-atribuir-entregador"),
        false,
        status,
      );
    }
  });

  it("histórico preserva quem esteve atribuído antes, com o motivo do encerramento", () => {
    const comTroca = entrega({
      entregadorAtual: {
        id: joao.id,
        pessoa: joao.pessoa,
        status: "ativo",
        disponivel: true,
        atribuidoEm: "2026-09-16T14:45:00.000Z",
      },
      historico: [
        {
          id: uuid(4),
          entregador: paulo.pessoa,
          atribuidoEm: "2026-09-16T14:30:00.000Z",
          encerradoEm: "2026-09-16T14:45:00.000Z",
          motivoEncerramento: "Reatribuído a outro entregador",
        },
        {
          id: uuid(5),
          entregador: joao.pessoa,
          atribuidoEm: "2026-09-16T14:45:00.000Z",
          encerradoEm: null,
          motivoEncerramento: null,
        },
      ],
    });
    const conteudo = texto(render("em_rota", comTroca, [paulo, joao]));
    assert.ok(conteudo.includes("Paulo Entregador"));
    assert.ok(conteudo.includes("Reatribuído a outro entregador"));
    assert.ok(conteudo.includes("João Entregador"));
  });
});

describe("empresas em que trabalho (disponibilidade do entregador)", () => {
  const vinculo = (
    nome: string,
    status: VinculoEntregador["status"],
    disponivel: boolean,
  ): VinculoEntregador => ({
    id: uuid(nome.length),
    empresa: {
      identidadeId: uuid(2),
      nome,
      nomeUsuario: nome.toLowerCase().replace(/\W/g, ""),
      slug: nome.toLowerCase().replace(/\W/g, "-"),
    },
    status,
    disponivel,
    disponibilidadeAtualizadaEm: disponivel ? "2026-09-16T12:00:00.000Z" : null,
  });

  const render = (
    vinculos: VinculoEntregador[],
    situacoes: SituacaoOperacional[] = [],
  ) =>
    renderToStaticMarkup(
      createElement(EmpresasEmQueTrabalho, {
        vinculos,
        situacoes,
        ocupado: false,
        aoAlterarDisponibilidade: () => {},
      }),
    );

  it("mostra a disponibilidade POR EMPRESA, com a ação inversa em cada uma", () => {
    const html = render([
      vinculo("Pizzaria A", "ativo", true),
      vinculo("Pizzaria B", "ativo", false),
    ]);
    const conteudo = texto(html);
    assert.ok(conteudo.includes("Pizzaria A"));
    assert.ok(conteudo.includes("Disponibilidade: 🟢 Disponível"));
    assert.ok(conteudo.includes("Ficar indisponível"));
    assert.ok(conteudo.includes("Pizzaria B"));
    assert.ok(conteudo.includes("Disponibilidade: ⚪ Indisponível"));
    assert.ok(conteudo.includes("Ficar disponível"));
    assert.equal(
      (html.match(/data-alternar-disponibilidade/g) ?? []).length,
      2,
      "cada empresa tem seu próprio controle",
    );
  });

  it("consolida empresa, disponibilidade e estado operacional sem repetir Em entrega", () => {
    const ativo = vinculo("Pizzaria Isaque", "ativo", true);
    const situacao: SituacaoOperacional = {
      entregadorId: ativo.id,
      empresa: {
        identidadeId: ativo.empresa.identidadeId,
        nome: ativo.empresa.nome,
      },
      status: "ativo",
      disponivel: true,
      naBase: true,
      aptoParaSaida: false,
      estado: "em_entrega",
      posicaoFila: null,
      totalNaFila: 0,
      baseConfigurada: true,
    };
    const conteudo = texto(render([ativo], [situacao]));
    assert.equal((conteudo.match(/Pizzaria Isaque/g) ?? []).length, 1);
    assert.equal((conteudo.match(/Em entrega/g) ?? []).length, 1);
    assert.ok(conteudo.includes("Disponibilidade: 🟢 Disponível"));
    assert.ok(conteudo.includes("Ficar indisponível"));
  });

  it("vínculo inativo aparece como inativo e não oferece disponibilidade", () => {
    const html = render([vinculo("Pizzaria C", "inativo", false)]);
    assert.ok(texto(html).includes("Inativo"));
    assert.equal(html.includes("data-alternar-disponibilidade"), false);
    assert.equal(html.includes("data-disponibilidade"), false);
  });

  it("convite pendente também não escolhe disponibilidade", () => {
    const html = render([vinculo("Pizzaria D", "convidado", false)]);
    assert.ok(texto(html).includes("Convite enviado"));
    assert.equal(html.includes("data-alternar-disponibilidade"), false);
  });
});

describe("minhas entregas (área do entregador)", () => {
  const entrega: EntregaAtribuida = {
    pedidoId: uuid(6),
    numeroPedido: 6,
    empresa: {
      identidadeId: uuid(7),
      nome: "Pizzaria BH",
      nomeUsuario: "pizzariabh",
      slug: "pizzaria-bh",
    },
    status: "saiu_para_entrega",
    destino: {
      enderecoId: uuid(8),
      cep: "30123000",
      logradouro: "Rua das Flores",
      numero: "150",
      complemento: "Apto 302",
      bairro: "Centro",
      cidade: "Belo Horizonte",
      uf: "MG",
      pontoReferencia: "Portão azul",
      latitude: -19.919125,
      longitude: -43.938602,
      localizacaoConfirmadaEm: "2026-09-16T11:55:00.000Z",
    },
    cliente: pessoa("Bruna Cliente", "bruna"),
    itens: [{ nomeProduto: "Pizza Calabresa", quantidade: 2 }],
    totalCentavos: 7980,
    formaPagamentoNaEntrega: "dinheiro",
    trocoParaCentavos: 10000,
    atribuidoEm: "2026-09-16T14:30:00.000Z",
  };

  const lista = (entregas: EntregaAtribuida[]) =>
    renderToStaticMarkup(createElement(ListaMinhasEntregas, { entregas }));

  it("mostra o necessário para entregar: empresa, endereço, cliente, itens e pagamento", () => {
    const html = lista([entrega]);
    const conteudo = texto(html);
    for (const esperado of [
      "Pedido #6",
      "Pizzaria BH",
      "Rua das Flores, 150 — Apto 302",
      "Centro, Belo Horizonte/MG",
      "CEP 30123-000",
      "Referência: Portão azul",
      "Cliente: Bruna Cliente",
      "2× Pizza Calabresa",
      "R$ 79,80",
      "Dinheiro na entrega",
      "Troco para R$ 100,00",
      "Saiu para entrega",
    ]) {
      assert.ok(conteudo.includes(esperado), esperado);
    }
    assert.ok(conteudo.includes("📍 Ponto de entrega confirmado"));
  });

  it("cartão na entrega não mostra troco", () => {
    const conteudo = texto(
      lista([
        {
          ...entrega,
          formaPagamentoNaEntrega: "cartao",
          trocoParaCentavos: null,
        },
      ]),
    );
    assert.ok(conteudo.includes("Cartão na entrega"));
    assert.equal(conteudo.includes("Troco"), false);
  });

  it("abre o ponto no mapa usando a coordenada snapshot, sem exibir números crus", () => {
    const html = lista([entrega]);
    assert.ok(html.includes("data-abrir-no-mapa"));
    assert.ok(
      html.includes("mlat=-19.919125"),
      "o link usa o ponto confirmado do pedido",
    );
    assert.equal(
      texto(html).includes("-19.919125"),
      false,
      "coordenada crua não é texto para humano",
    );
  });

  it("sem entregas atribuídas explica o estado vazio", () => {
    assert.ok(
      texto(lista([])).includes("Nenhuma entrega atribuída a você agora."),
    );
  });

  it("não repete em uma segunda lista o pedido que já pertence a uma rota", () => {
    const rota = { paradas: [{ pedidoId: entrega.pedidoId }] } as SaidaEntrega;
    assert.deepEqual(entregasForaDasSaidas([entrega], [rota]), []);
    assert.deepEqual(entregasForaDasSaidas([entrega], []), [entrega]);
  });
});

describe("mapa da rota do entregador", () => {
  it("inicia recolhido e oferece Exibir mapa sem montar o Mapbox", () => {
    const rota = {
      id: uuid(9),
      empresa: {
        identidadeId: uuid(8),
        nome: "Pizzaria",
        nomeUsuario: "pizzaria",
        slug: "pizzaria",
      },
      entregador: pessoa("Paulo", "paulo"),
      status: "em_andamento",
      versaoSequencia: 1,
      paradas: [],
      rota: null,
      zonaPrincipal: null,
      zonasCombinadas: [],
      automatica: false,
      exigeRetornoBase: false,
      criadoEm: "2026-09-16T12:00:00.000Z",
      formacaoIniciadaEm: null,
      prazoFormacaoEm: null,
      fechadaEm: "2026-09-16T12:01:00.000Z",
      atribuidaEm: "2026-09-16T12:02:00.000Z",
      liberadaEm: "2026-09-16T12:03:00.000Z",
      iniciadaEm: "2026-09-16T12:04:00.000Z",
      concluidaEm: null,
    } satisfies SaidaEntrega;
    const html = renderToStaticMarkup(
      createElement(MapaDaSaidaRecolhivel, { saida: rota }),
    );
    assert.ok(texto(html).includes("Exibir mapa"));
    assert.ok(html.includes('aria-expanded="false"'));
    assert.equal(html.includes("data-mapa-percurso"), false);
    assert.equal(html.includes("data-mapa-percurso-mapbox"), false);
  });
});
