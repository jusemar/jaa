import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IdentidadeOperavel, IdentidadeVisivel, ItemListaConversas } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CabecalhoConversa } from "../features/conversas/components/cabecalho-conversa.tsx";
import { ListaConversas } from "../features/conversas/components/lista-conversas.tsx";
import { SeletorIdentidade } from "../features/identidades/components/seletor-identidade.tsx";
import { AvatarIdentidade } from "./avatar-identidade.tsx";

/*
 * O avatar mostra a FOTO quando a identidade chega com `fotoUrl` (decidida pela privacidade no servidor)
 * e as INICIAIS quando chega null. Quem exibe a identidade não precisa repassar a foto à mão.
 */

const FOTO = "https://pub-exemplo.r2.dev/avatar/aaaaaaaa-0000-4000-8000-000000000001/foto.webp";
const ANA: IdentidadeVisivel = { identidadeId: "aaaaaaaa-0000-4000-8000-000000000001", tipo: "pessoal", nomeExibicao: "Ana Souza", nomeUsuario: "ana", fotoUrl: FOTO };
const SEM_FOTO: IdentidadeVisivel = { ...ANA, fotoUrl: null };

const temFoto = (html: string) => html.includes(`<img src="${FOTO}"`);
const temIniciais = (html: string) => html.includes(">AS</span>");

describe("AvatarIdentidade", () => {
  it("com fotoUrl na identidade: renderiza a imagem, sem iniciais", () => {
    const html = renderToStaticMarkup(createElement(AvatarIdentidade, { identidade: ANA }));
    assert.ok(temFoto(html), html);
    assert.ok(!temIniciais(html));
  });

  it("com fotoUrl null (sem foto ou privacidade): iniciais", () => {
    const html = renderToStaticMarkup(createElement(AvatarIdentidade, { identidade: SEM_FOTO }));
    assert.ok(temIniciais(html), html);
    assert.ok(!html.includes("<img"));
  });

  it("a prop fotoUrl, quando informada, prevalece (inclusive null)", () => {
    assert.ok(temFoto(renderToStaticMarkup(createElement(AvatarIdentidade, { identidade: SEM_FOTO, fotoUrl: FOTO }))));
    assert.ok(temIniciais(renderToStaticMarkup(createElement(AvatarIdentidade, { identidade: ANA, fotoUrl: null }))));
  });
});

describe("telas que exibem identidade usam a foto que veio do servidor", () => {
  const item = (outraIdentidade: IdentidadeVisivel): ItemListaConversas => ({
    id: "cccccccc-0000-4000-8000-000000000001",
    tipo: "direta",
    outraIdentidade,
    ultimaMensagem: null,
    atividadeId: "019a0000-0000-7000-8000-000000000001",
    naoLidas: 0,
    comunicacaoBloqueada: false,
  });
  const lista = (outra: IdentidadeVisivel) =>
    renderToStaticMarkup(
      createElement(ListaConversas, {
        identidadeId: "eeeeeeee-0000-4000-8000-000000000000",
        itens: [item(outra)],
        carregando: false,
        erro: null,
        temMais: false,
        carregandoMais: false,
        conversaAbertaId: null,
        aoAbrir: () => {},
        aoCarregarMais: () => {},
      }),
    );

  it("lista de conversas: foto do interlocutor; sem foto, iniciais", () => {
    assert.ok(temFoto(lista(ANA)));
    assert.ok(temIniciais(lista(SEM_FOTO)) && !temFoto(lista(SEM_FOTO)));
  });

  it("cabeçalho da conversa: foto do interlocutor; sem foto, iniciais", () => {
    const cabecalho = (outra: IdentidadeVisivel) => renderToStaticMarkup(createElement(CabecalhoConversa, { outraIdentidade: outra, presenca: null, digitando: false }));
    assert.ok(temFoto(cabecalho(ANA)));
    assert.ok(temIniciais(cabecalho(SEM_FOTO)));
  });

  it("Agindo como: avatar da identidade ativa com a foto dela", () => {
    const ativa: IdentidadeOperavel = { tipo: "pessoal", identidadeId: ANA.identidadeId, nomeExibicao: ANA.nomeExibicao, nomeUsuario: ANA.nomeUsuario, fotoUrl: FOTO };
    const seletor = (identidade: IdentidadeOperavel) =>
      renderToStaticMarkup(createElement(SeletorIdentidade, { operaveis: [identidade], ativa: identidade, erro: null, aoSelecionar: () => {} }));
    assert.ok(temFoto(seletor(ativa)));
    assert.ok(temIniciais(seletor({ ...ativa, fotoUrl: null })));
  });
});
