import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { destruirMapa, liberarContainer, registrarMapa } from "./leaflet.ts";

/*
 * Estes testes cobrem a causa REAL de "o mapa aparece mas não deixa ajustar o ponto".
 *
 * O `Map.remove()` do Leaflet LANÇA quando o container já foi reaproveitado por outra instância —
 * o que acontece a cada montagem no StrictMode, porque o React monta, desmonta e monta de novo
 * enquanto a criação assíncrona do mapa ainda está no ar. Quando essa exceção escapava, a limpeza
 * parava no meio e sobrava um mapa visível e sem ouvintes na tela.
 */

// Elemento falso: o registro usa só a identidade do objeto, então não é preciso DOM aqui.
const criarElemento = () => ({}) as unknown as HTMLElement;

describe("destruição do mapa", () => {
  it("nunca lança, mesmo quando o Leaflet recusa remover um container reaproveitado", () => {
    const elemento = criarElemento();
    const mapa = {
      remove() {
        throw new Error("Map container is being reused by another instance");
      },
    };
    registrarMapa(elemento, mapa);
    assert.doesNotThrow(() => destruirMapa(elemento, mapa));
  });

  it("remove o mapa uma única vez: liberar o container depois não o destrói de novo", () => {
    const elemento = criarElemento();
    let remocoes = 0;
    const mapa = {
      remove() {
        remocoes += 1;
      },
    };
    registrarMapa(elemento, mapa);

    destruirMapa(elemento, mapa);
    liberarContainer(elemento);

    assert.equal(remocoes, 1, "a segunda passagem não pode chamar remove() de novo");
  });

  it("liberar o container destrói o mapa que estava nele (a remontagem não deixa instância órfã)", () => {
    const elemento = criarElemento();
    let removido = false;
    registrarMapa(elemento, {
      remove() {
        removido = true;
      },
    });

    liberarContainer(elemento);
    assert.equal(removido, true);
  });

  it("liberar um container sem mapa é inofensivo", () => {
    assert.doesNotThrow(() => liberarContainer(criarElemento()));
  });
});
