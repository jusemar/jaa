import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DestinoPedido, EnderecoCliente } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EnderecoDoPedido } from "@/features/pedidos/components/apresentacao-pedido.tsx";
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
  renderToStaticMarkup(createElement(ListaEnderecos, { enderecos, selecionadoId: null, aoUsar: () => {}, aoEditar: () => {}, aoAjustarPonto: () => {} }));

describe("lista de endereços do cliente", () => {
  it("mostra o endereço como o cliente cadastrou, com CEP formatado", () => {
    const conteudo = texto(lista([semPonto]));
    for (const esperado of ["Casa", "Rua das Flores, 150 — Apto 302", "Centro, Belo Horizonte/MG", "CEP 30123-000", "Usar este endereço"]) {
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
    assert.ok(conteudo.includes("Ajustar ponto no mapa"));
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
    renderToStaticMarkup(createElement(FormularioEndereco, { ...(endereco ? { endereco } : {}), enviando: false, aoSalvar: () => {}, aoCancelar: () => {} }));

  it("pede os campos do endereço textual, com apelido e referência", () => {
    const html = formulario();
    for (const campo of ["apelido", "cep", "logradouro", "numero", "complemento", "bairro", "cidade", "uf", "pontoReferencia"]) {
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
        endereco: { ...semPonto, cep: "30626497", logradouro: "Rua Sílvio Giuseppe Rosso", numero: "24", bairro: "Novo Santa Cecília (Barreiro)" },
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
    assert.equal(html.includes("disabled=\"\""), false);
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
    const html = renderToStaticMarkup(createElement(EnderecoDoPedido, { destino }));
    const conteudo = texto(html);
    for (const esperado of ["Entregar em", "Rua das Flores, 150 — Apto 302", "Centro, Belo Horizonte/MG", "CEP 30123-000", "Referência: Portão azul", "📍 Ponto de entrega confirmado"]) {
      assert.ok(conteudo.includes(esperado), esperado);
    }
    assert.equal(conteudo.includes("-19.919125"), false, "coordenada crua não é para humano");
  });

  it("oferece 'Ver ponto no mapa' apenas quando quem exibe passa a ação", () => {
    assert.equal(renderToStaticMarkup(createElement(EnderecoDoPedido, { destino })).includes("data-ver-ponto-mapa"), false);
    assert.ok(renderToStaticMarkup(createElement(EnderecoDoPedido, { destino, aoVerNoMapa: () => {} })).includes("data-ver-ponto-mapa"));
  });

  it("pedido legado (sem destino) explica a ausência, sem inventar endereço", () => {
    const html = renderToStaticMarkup(createElement(EnderecoDoPedido, { destino: null }));
    assert.ok(html.includes("data-sem-destino"));
    assert.ok(texto(html).includes("Este pedido é anterior ao ponto de entrega confirmado."));
  });
});
