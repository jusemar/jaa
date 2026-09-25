import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DestinoPedido, EnderecoCliente } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EnderecoDoPedido } from "@/features/pedidos/components/apresentacao-pedido.tsx";
import { EtapaEnderecoEntrega } from "./etapa-endereco-entrega.tsx";
import { FormularioEndereco } from "./formulario-endereco.tsx";
import { ConfirmarPontoEntrega } from "./confirmar-ponto-entrega.tsx";
import { ListaEnderecos } from "./lista-enderecos.tsx";

const texto = (html: string) => html.replace(/<[^>]+>/g, "").replace(/ /g, " ");

const semPonto: EnderecoCliente = {
  id: "aaaaaaaa-0000-4000-8000-000000000000",
  apelido: "Casa",
  cep: "30123000",
  logradouro: "Rua das Flores",
  numero: "150",
  complemento: "Apto 302",
  bairro: "Centro",
  cidade: "Belo Horizonte",
  uf: "MG",
  pontoReferencia: "Portão azul",
  latitude: null,
  longitude: null,
  localizacaoConfirmadaEm: null,
  criadoEm: "2026-09-16T11:00:00.000Z",
  atualizadoEm: "2026-09-16T11:00:00.000Z",
};

const confirmado: EnderecoCliente = {
  ...semPonto,
  id: "bbbbbbbb-0000-4000-8000-000000000000",
  apelido: "Trabalho",
  latitude: -19.919125,
  longitude: -43.938602,
  localizacaoConfirmadaEm: "2026-09-16T12:00:00.000Z",
};

const lista = (enderecos: EnderecoCliente[]) =>
  renderToStaticMarkup(
    createElement(ListaEnderecos, {
      enderecos,
      selecionadoId: null,
      aoUsar: () => {},
      aoEditar: () => {},
      aoAjustarPonto: () => {},
    }),
  );

describe("lista de endereços do cliente", () => {
  it("mostra o endereço como o cliente cadastrou, com CEP formatado", () => {
    const conteudo = texto(lista([semPonto]));
    for (const esperado of [
      "Rua das Flores, 150 — Apto 302",
      "Centro, Belo Horizonte/MG",
      "CEP 30123-000",
      "Usar este",
    ]) {
      assert.ok(conteudo.includes(esperado), esperado);
    }
    assert.equal(
      conteudo.includes("Casa"),
      false,
      "a escolha não exibe o apelido do endereço",
    );
  });

  it("mostra o estado vazio próprio da escolha de entrega", () => {
    assert.ok(
      texto(lista([])).includes(
        "Você ainda não possui endereço de entrega cadastrado.",
      ),
    );
  });

  it("a etapa vazia orienta cadastrar e permite voltar ao carrinho", () => {
    const conteudo = texto(
      renderToStaticMarkup(
        createElement(EtapaEnderecoEntrega, {
          empresaIdentidadeId: "cccccccc-0000-4000-8000-000000000000",
          aoSelecionar: () => {},
          aoVoltar: () => {},
        }),
      ),
    );
    for (const esperado of [
      "Escolha um endereço",
      "Você ainda não possui endereço de entrega cadastrado.",
      "+ Cadastrar endereço",
      "Voltar ao carrinho",
    ]) {
      assert.ok(conteudo.includes(esperado), esperado);
    }
  });

  it("distingue endereço com ponto confirmado do que ainda precisa de confirmação", () => {
    const html = lista([semPonto, confirmado]);
    assert.ok(html.includes('data-localizacao="pendente"'));
    assert.ok(html.includes('data-localizacao="confirmada"'));
    const conteudo = texto(html);
    assert.ok(conteudo.includes("Ponto de entrega ainda não confirmado"));
    assert.ok(conteudo.includes("📍 Localização confirmada"));
    // Já confirmado oferece ajuste; ainda não confirmado convida a confirmar.
    assert.ok(conteudo.includes("Ajustar ponto"));
    // O significado completo continua disponível para leitor de tela.
    assert.ok(html.includes("Ajustar ponto no mapa:"));
    assert.ok(conteudo.includes("Confirmar no mapa"));
  });

  it("nunca exibe latitude/longitude cruas para a pessoa", () => {
    const conteudo = texto(lista([confirmado]));
    assert.equal(conteudo.includes("-19.919125"), false);
    assert.equal(conteudo.includes("-43.938602"), false);
  });
});

describe("formulário de endereço", () => {
  const formulario = (endereco?: EnderecoCliente) =>
    renderToStaticMarkup(
      createElement(FormularioEndereco, {
        ...(endereco ? { endereco } : {}),
        enviando: false,
        aoSalvar: () => {},
        aoCancelar: () => {},
      }),
    );

  it("pede os campos do endereço textual, com apelido e referência", () => {
    const html = formulario();
    for (const campo of [
      "apelido",
      "cep",
      "logradouro",
      "numero",
      "complemento",
      "bairro",
      "cidade",
      "uf",
      "pontoReferencia",
    ]) {
      assert.ok(html.includes(`name="${campo}"`), campo);
    }
    // Nada de latitude/longitude digitadas: o ponto vem do mapa.
    assert.equal(html.includes('name="latitude"'), false);
    assert.equal(html.includes('name="longitude"'), false);
  });

  it("ao editar, traz exatamente o que o cliente cadastrou (o mapa não corrige o número)", () => {
    const html = formulario(confirmado);
    assert.ok(html.includes('value="150"'));
    assert.ok(html.includes('value="Rua das Flores"'));
    assert.ok(html.includes('value="30123-000"'));
    // Sem alteração ainda, nenhum aviso de perda da confirmação.
    assert.equal(html.includes("data-aviso-confirmacao"), false);
  });
});

describe("sugestão no mapa de entrega", () => {
  it("usa a coordenada recebida da API como ponto inicial confirmável", () => {
    const sugestao = { latitude: -20.004977, longitude: -44.01567 };
    const html = renderToStaticMarkup(
      createElement(ConfirmarPontoEntrega, {
        chaveMapa: "novo",
        empresaIdentidadeId: "cccccccc-0000-4000-8000-000000000000",
        endereco: {
          ...semPonto,
          cep: "30626497",
          logradouro: "Rua Sílvio Giuseppe Rosso",
          numero: "24",
          bairro: "Novo Santa Cecília (Barreiro)",
        },
        sugestao,
        enviando: false,
        erro: null,
        aoConfirmar: () => {},
        aoCancelar: () => {},
      }),
    );

    assert.ok(html.includes('data-ponto-selecionado="-20.004977,-44.01567"'));
    assert.equal(html.includes("data-ponto-pendente"), false);
    assert.equal(html.includes("data-confirmar-ponto"), true);
    assert.equal(html.includes('disabled=""'), true);
    assert.ok(texto(html).includes("Salvar endereço"));
  });
});

describe("entrega no pedido", () => {
  const destino: DestinoPedido = {
    enderecoId: confirmado.id,
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
    localizacaoConfirmadaEm: "2026-09-16T12:00:00.000Z",
  };

  it("exibe o snapshot do endereço e o selo de ponto confirmado", () => {
    const html = renderToStaticMarkup(
      createElement(EnderecoDoPedido, { destino }),
    );
    const conteudo = texto(html);
    for (const esperado of [
      "Entregar em",
      "Rua das Flores, 150 — Apto 302",
      "Centro, Belo Horizonte/MG",
      "CEP 30123-000",
      "Referência: Portão azul",
      "📍 Ponto de entrega confirmado",
    ]) {
      assert.ok(conteudo.includes(esperado), esperado);
    }
    assert.equal(
      conteudo.includes("-19.919125"),
      false,
      "coordenada crua não é para humano",
    );
  });

  it("oferece 'Ver ponto no mapa' apenas quando quem exibe passa a ação", () => {
    assert.equal(
      renderToStaticMarkup(
        createElement(EnderecoDoPedido, { destino }),
      ).includes("data-ver-ponto-mapa"),
      false,
    );
    assert.ok(
      renderToStaticMarkup(
        createElement(EnderecoDoPedido, { destino, aoVerNoMapa: () => {} }),
      ).includes("data-ver-ponto-mapa"),
    );
  });

  it("pedido legado (sem destino) explica a ausência, sem inventar endereço", () => {
    const html = renderToStaticMarkup(
      createElement(EnderecoDoPedido, { destino: null }),
    );
    assert.ok(html.includes("data-sem-destino"));
    assert.ok(
      texto(html).includes(
        "Este pedido é anterior ao ponto de entrega confirmado.",
      ),
    );
  });

  /*
   * REGRESSÃO: o bloco de ações era `shrink-0`, então em coluna estreita (o painel "Seu pedido")
   * ele não cedia espaço e os botões vazavam para fora do card — alguns ficavam inalcançáveis.
   * Agora a faixa quebra sozinha e TODAS as ações continuam presentes e clicáveis.
   */
  it("as quatro ações do endereço continuam presentes e podem quebrar linha sem vazar", () => {
    // Com remoção habilitada: é o cenário com mais botões, o que mais apertava a coluna estreita.
    const html = renderToStaticMarkup(
      createElement(ListaEnderecos, {
        enderecos: [confirmado],
        selecionadoId: null,
        aoUsar: () => {},
        aoEditar: () => {},
        aoAjustarPonto: () => {},
        aoRemover: () => {},
      }),
    );
    const conteudo = texto(html);
    for (const acao of ["Usar este", "Ajustar ponto", "Editar", "Remover"]) {
      assert.ok(conteudo.includes(acao), acao);
    }

    const bloco = html.slice(html.indexOf("data-usar-endereco"));
    const faixa = html.slice(html.lastIndexOf("<span", html.indexOf("data-usar-endereco")), html.indexOf("data-usar-endereco"));
    assert.ok(faixa.includes("flex-wrap"), "a faixa de ações quebra linha quando não cabe");
    assert.ok(!faixa.includes("shrink-0"), "a faixa não é rígida: era isso que fazia os botões vazarem");
    // Alvo de toque adequado em todos os botões da faixa.
    assert.equal((bloco.match(/min-h-9/g) ?? []).length >= 3, true, "botões com alvo de toque");
  });

  it("o texto do endereço tem prioridade e pode encolher; as ações nunca o empurram para fora", () => {
    const html = lista([confirmado]);
    // `basis-56` dá ao texto um tamanho de partida; `min-w-0` deixa ele encolher em vez de estourar.
    const textoDoItem = html.slice(html.indexOf("<li"), html.indexOf("data-usar-endereco"));
    assert.ok(textoDoItem.includes("min-w-0"));
    assert.ok(textoDoItem.includes("basis-56"));
    assert.ok(textoDoItem.includes("[overflow-wrap:anywhere]"), "endereço longo quebra linha");
  });
});