import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { IdentidadePublica } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ApresentacaoIdentidade } from "../../perfil/components/apresentacao-identidade.tsx";
import { PaginaDoVisitante } from "./pagina-do-visitante.tsx";

const fonte = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const texto = (marcacao: string) => marcacao.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const pizzaria: IdentidadePublica = {
  identidadeId: "aaaaaaaa-0000-4000-8000-000000000001",
  tipo: "empresarial",
  nomeExibicao: "Pizzaria Oasis",
  nomeUsuario: "pizzaria_oasis",
  fotoUrl: null,
  fraseStatus: null,
  sobre: "Pizza de forno a lenha.",
  temCardapio: true,
};
const pessoa: IdentidadePublica = { ...pizzaria, tipo: "pessoal", nomeExibicao: "Ana Souza", nomeUsuario: "ana", sobre: null, temCardapio: false };
const ENTRADA = createElement("section", { "data-entrada-jaa": true }, "FORMULARIO");
const pagina = (identidade: IdentidadePublica) => renderToStaticMarkup(createElement(PaginaDoVisitante, { identidade, entrada: ENTRADA, aoPedirEntrada: () => {} }));

describe("página do visitante (/@usuario sem sessão)", () => {
  it("a entrada já está na página: nenhum botão intermediário para chegar ao login", () => {
    for (const identidade of [pizzaria, pessoa]) {
      const marcacao = pagina(identidade);
      assert.ok(marcacao.includes("data-entrada-jaa") && marcacao.includes("FORMULARIO"));
      assert.ok(!texto(marcacao).includes("Entrar para conversar"), "o botão de passagem saiu");
      assert.ok(!marcacao.includes("data-entrar-para-continuar"));
    }
  });

  it("identifica com quem a pessoa vai falar, antes da entrada", () => {
    const marcacao = pagina(pizzaria);
    assert.ok(texto(marcacao).includes("Pizzaria Oasis") && texto(marcacao).includes("@pizzaria_oasis") && texto(marcacao).includes("Pizza de forno a lenha."));
    assert.ok(marcacao.indexOf("Pizzaria Oasis") < marcacao.indexOf("data-entrada-jaa"));
  });

  it("com cardápio: o cardápio continua na página (depois da entrada na coluna única), com atalho até ele", () => {
    const marcacao = pagina(pizzaria);
    assert.ok(marcacao.includes('id="cardapio"') && marcacao.includes('href="#cardapio"'));
    assert.ok(marcacao.indexOf("data-entrada-jaa") < marcacao.indexOf('id="cardapio"'));
  });

  it("sem cardápio: só identidade + entrada, em coluna estreita", () => {
    const marcacao = pagina(pessoa);
    assert.ok(!marcacao.includes('id="cardapio"') && !marcacao.includes('href="#cardapio"'));
    assert.ok(marcacao.includes("max-w-md"));
  });

  it("tentar adicionar produto leva à entrada (ação protegida), sem carrinho de visitante", () => {
    const componente = fonte("./pagina-do-visitante.tsx");
    assert.ok(componente.includes("aoAdicionarAoCarrinho={aoPedirEntrada}"));
    assert.ok(!/useCarrinho|deposito-carrinho/.test(componente));
  });

  it("responsivo pela causa: nada fixo na tela e nenhuma altura fixa — a página inteira rola", () => {
    const marcacao = pagina(pizzaria);
    assert.ok(!/class="[^"]*\bfixed\b/.test(marcacao), "sem barra fixa que possa ser cortada");
    assert.ok(!/class="[^"]*(?<![\w-])h-(dvh|screen)\b/.test(marcacao), "sem altura presa à tela");
    assert.ok(/class="[^"]*\bmin-h-dvh\b/.test(marcacao));
    // Coluna única por padrão; duas colunas só a partir de `lg`.
    assert.ok(marcacao.includes("lg:grid") && marcacao.includes("flex-col"));
    assert.ok(marcacao.includes("safe-area-inset-bottom"));
  });
});

describe("perfil de outra identidade", () => {
  const apresentar = (extra: { fraseStatus: string | null; sobre: string | null }) =>
    renderToStaticMarkup(createElement(ApresentacaoIdentidade, { destaque: true, identidade: { identidadeId: pessoa.identidadeId, nomeExibicao: "Ana Souza", nomeUsuario: "ana", tipo: "pessoal", fotoUrl: "https://arquivos.exemplo/ana.webp" }, ...extra }));

  it("foto em destaque no alto; Recado e Sobre abaixo quando permitidos", () => {
    const marcacao = apresentar({ fraseStatus: "Respondo à noite", sobre: "Eletricista em BH." });
    assert.ok(/<img[^>]*class="[^"]*\bh-36 w-36\b/.test(marcacao), "foto grande");
    assert.ok(marcacao.indexOf("<img") < marcacao.indexOf("Recado"));
    assert.ok(marcacao.includes('data-perfil-bloco="frase"') && texto(marcacao).includes("Recado Respondo à noite"));
    assert.ok(marcacao.includes('data-perfil-bloco="sobre"') && texto(marcacao).includes("Sobre Eletricista em BH."));
  });

  it("Recado escondido pela privacidade (chega null) não aparece — nem título vazio; o Sobre continua", () => {
    const marcacao = apresentar({ fraseStatus: null, sobre: "Eletricista em BH." });
    assert.ok(!marcacao.includes('data-perfil-bloco="frase"') && !texto(marcacao).includes("Recado"));
    assert.ok(marcacao.includes('data-perfil-bloco="sobre"'));
  });

  it("perfil sem nada preenchido mostra só foto, nome e @usuario", () => {
    const marcacao = apresentar({ fraseStatus: null, sobre: null });
    assert.ok(!marcacao.includes("data-perfil-bloco"));
    assert.ok(texto(marcacao).includes("Ana Souza") && texto(marcacao).includes("@ana"));
  });

  it("abre numa FOLHA adaptativa desenhada no <body> — não num modal central preso à coluna da conversa", () => {
    const perfil = fonte("../../perfil/components/perfil-da-identidade.tsx");
    assert.ok(perfil.includes("<Folha") && !perfil.includes("place-items-center"));
    assert.ok(perfil.includes("<LinkDoJaa"), "o Link do Jaaa da identidade faz parte do perfil");
    const folha = fonte("../../../components/ui/folha.tsx");
    assert.ok(folha.includes("createPortal(") && folha.includes("document.body"));
    // Celular/tablet: sobe de baixo, largura toda, altura limitada com rolagem interna.
    assert.ok(folha.includes("items-end") && folha.includes("max-h-[92dvh]") && folha.includes("overflow-y-auto"));
    // Janela larga: painel lateral na altura inteira.
    assert.ok(folha.includes("md:justify-end") && folha.includes("md:h-dvh") && folha.includes("md:w-[26rem]"));
    assert.ok(folha.includes("safe-area-inset-bottom") && folha.includes('"Escape"'));
  });

  it("o Link do Jaaa é um link de verdade e tem Copiar", () => {
    const link = fonte("./link-do-jaa.tsx");
    assert.ok(link.includes("<a") && link.includes("href={link}") && link.includes("Copiar link") && link.includes("navigator.clipboard.writeText(link)"));
    assert.ok(link.includes("break-all"), "endereço longo quebra dentro da coluna");
  });
});

describe("Salvar perfil no Web", () => {
  it("usa a MESMA regra do app e não permite envio duplicado", () => {
    const tela = fonte("../../perfil/components/area-perfil.tsx");
    assert.ok(tela.includes("perfilFoiAlterado(perfil, campos)"));
    assert.ok(tela.includes("disabled={salvandoPerfil || !alterado || campos.nome.trim() === \"\"}"));
    // Enter no campo com o botão desabilitado também não envia.
    assert.ok(tela.includes("if (salvandoPerfil || !perfil || !campos || !perfilFoiAlterado(perfil, campos)) return;"));
    // Sucesso: o que a API devolveu vira o estado salvo; erro: os campos ficam.
    assert.ok(tela.includes("if (resposta.ok) setCampos(camposDe(resposta.dados));"));
  });
});
