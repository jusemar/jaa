import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/*
 * Direção do menu "Agindo como". O menu só existe depois do clique, então a direção é conferida no
 * código-fonte aqui e, de verdade, no navegador (posição do menu em relação ao botão e à tela).
 */
const fonte = readFileSync(new URL("./seletor-identidade.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../../../components/navegacao/app-jaa.tsx", import.meta.url), "utf8");
const classes = fonte.slice(fonte.indexOf("data-menu-de-identidades"), fonte.indexOf('<Grupo titulo="Pessoa"'));

describe("seletor de identidade: direção do menu", () => {
  it("um componente só: a variante completa (topo, telas estreitas) abre PARA BAIXO", () => {
    assert.ok(/compacto \? "[^"]*" : "top-full mt-1 [^"]*w-full"/.test(classes), classes);
  });

  it("a variante compacta (rodapé da coluna de navegação, desktop) continua abrindo PARA CIMA", () => {
    assert.ok(/compacto \? "bottom-full mb-1 [^"]*"/.test(classes));
  });

  it("nos dois casos o menu cabe na tela: altura limitada à área visível, com rolagem própria", () => {
    assert.ok(classes.includes("overflow-y-auto") && classes.includes("max-h-[calc(100dvh-6rem)]") && classes.includes("env(safe-area-inset-top)"));
    assert.ok(!classes.includes("md:bottom-auto"), "a direção não depende mais de um breakpoint que a variante nunca alcança");
  });

  it("no celular o topo é só a identidade: sem ícone de marca, sem frase visível, e 'Sair da conta' dentro do menu", () => {
    const topo = app.slice(app.indexOf("Celular: a marca e a identidade atuante no topo"), app.indexOf("Carregando suas identidades"));
    assert.ok(!topo.includes("IconeConversa") && !topo.includes("{sair}") && topo.includes("data-sair-da-conta") && topo.includes("rodapeDoMenu="));
    assert.ok(/<p role="note" className="sr-only">/.test(fonte), "a frase 'Você responde como…' fica só para leitor de tela");
    assert.ok(fonte.includes("{rodapeDoMenu &&"));
  });

  it("a variante completa só existe abaixo de `md`; a compacta, a partir de `md`", () => {
    const completo = app.slice(app.indexOf("md:hidden"), app.indexOf("Carregando suas identidades"));
    assert.ok(completo.includes("<SeletorIdentidade") && !completo.includes("compacto"));
    assert.equal([...app.matchAll(/<SeletorIdentidade\s+compacto/g)].length, 1);
  });
});
