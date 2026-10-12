import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EntregadorOperacional, PainelOperacional } from "./base-e-fila.ts";
import type { EntregadorDaEmpresa } from "./entregador.ts";
import { ABA_INICIAL_DO_QUADRO_DE_ENTREGADORES, GRUPOS_DO_QUADRO_DE_ENTREGADORES, classificarQuadroDeEntregadores } from "./quadro-entregadores.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ACEITOU = "2026-10-12T12:00:00.000Z";

function entregador(n: number, extra: Partial<EntregadorDaEmpresa> = {}): EntregadorDaEmpresa {
  return { id: id(n), pessoa: { identidadeId: id(100 + n), tipo: "pessoal", nomeExibicao: `Entregador ${n}`, nomeUsuario: `entregador${n}` }, status: "ativo", disponivel: true, disponibilidadeAtualizadaEm: null, convidadoEm: "2026-10-01T12:00:00.000Z", respondidoEm: ACEITOU, ...extra } as EntregadorDaEmpresa;
}
function operacional(de: EntregadorDaEmpresa, extra: Partial<EntregadorOperacional>): EntregadorOperacional {
  return { id: de.id, pessoa: de.pessoa, status: de.status, disponivel: de.disponivel, naBase: false, aptoParaSaida: true, estado: "indisponivel", posicaoFila: null, filaEntrouEm: null, ...extra } as EntregadorOperacional;
}

// Um de cada situação real: 1 e 2 na fila, 3 fora da base, 4 em entrega, 5 com rota reservada,
// 6 não aceitando, 7 desativado (já aceitou), 8 desativado sem nunca aceitar, 9 convite pendente.
const naFila1 = entregador(1);
const naFila2 = entregador(2);
const fora = entregador(3);
const emEntrega = entregador(4);
const rotaReservada = entregador(5);
const naoAceitando = entregador(6, { disponivel: false });
const desativado = entregador(7, { status: "inativo", disponivel: false });
const semAceite = entregador(8, { status: "inativo", disponivel: false, respondidoEm: null });
const pendente = entregador(9, { status: "convidado", disponivel: false, respondidoEm: null });
const todos = [pendente, semAceite, desativado, naoAceitando, rotaReservada, emEntrega, fora, naFila2, naFila1];

const painel: PainelOperacional = {
  baseConfigurada: true,
  // A ordem da fila é a do servidor: o 2 chegou antes do 1.
  fila: [operacional(naFila2, { naBase: true, estado: "disponivel_na_base", posicaoFila: 1, filaEntrouEm: ACEITOU }), operacional(naFila1, { naBase: true, estado: "disponivel_na_base", posicaoFila: 2, filaEntrouEm: ACEITOU })],
  foraDaBase: [operacional(fora, { estado: "disponivel_fora_base" })],
  indisponiveis: [operacional(emEntrega, { estado: "em_entrega" }), operacional(rotaReservada, { naBase: true, estado: "disponivel_na_base" }), operacional(naoAceitando, { estado: "indisponivel" }), operacional(desativado, { estado: "indisponivel" }), operacional(semAceite, { estado: "indisponivel" })],
};

const nomes = (linhas: { entregador: EntregadorDaEmpresa }[]) => linhas.map((linha) => linha.entregador.pessoa.nomeExibicao);

describe("quadro de entregadores por situação", () => {
  const quadro = classificarQuadroDeEntregadores(todos, painel);

  it("cada grupo mostra SOMENTE a sua categoria", () => {
    assert.deepEqual(nomes(quadro.grupos.na_rota), ["Entregador 5", "Entregador 4"]);
    assert.deepEqual(nomes(quadro.grupos.disponiveis), ["Entregador 2", "Entregador 1"]);
    assert.deepEqual(nomes(quadro.grupos.fora_da_base), ["Entregador 3"]);
    assert.deepEqual(nomes(quadro.grupos.indisponiveis), ["Entregador 6"]);
    assert.deepEqual(nomes(quadro.grupos.desativados), ["Entregador 8", "Entregador 7"]);
  });

  it("ninguém aparece em dois grupos, e ninguém some: grupos + convites pendentes = todos", () => {
    const classificados = [...Object.values(quadro.grupos).flatMap((linhas) => linhas.map((linha) => linha.entregador.id)), ...quadro.pendentes.map((item) => item.id)];
    assert.equal(new Set(classificados).size, classificados.length);
    assert.deepEqual([...classificados].sort(), todos.map((item) => item.id).sort());
  });

  it("Na rota usa o estado operacional do servidor: na rua é 'Em entrega', reservada é 'Rota atribuída'", () => {
    assert.deepEqual(quadro.grupos.na_rota.map((linha) => linha.situacao), ["Rota atribuída", "Em entrega"]);
    // Quem tem rota reservada continua "disponível na base" para o servidor, mas NÃO é listado como disponível.
    assert.equal(nomes(quadro.grupos.disponiveis).includes("Entregador 5"), false);
  });

  it("Disponíveis é a fila da base, na ordem do servidor e com a posição", () => {
    assert.deepEqual(quadro.grupos.disponiveis.map((linha) => linha.situacao), ["1º da fila da base", "2º da fila da base"]);
  });

  it("Fora da base é quem aceita entregas sem presença confirmada na base — não quem está desligado", () => {
    assert.deepEqual(quadro.grupos.fora_da_base.map((linha) => linha.situacao), ["Disponível fora da base"]);
    assert.deepEqual(quadro.grupos.indisponiveis.map((linha) => linha.situacao), ["Não aceitando entregas"]);
  });

  it("ativos podem ser desativados; desativado só é reativado se já aceitou um convite", () => {
    for (const grupo of ["na_rota", "disponiveis", "fora_da_base", "indisponiveis"] as const) for (const linha of quadro.grupos[grupo]) assert.deepEqual(linha.acao, { rotulo: "Desativar", status: "inativo" });
    const [nuncaAceitou, jaAceitou] = quadro.grupos.desativados;
    assert.deepEqual(jaAceitou?.acao, { rotulo: "Ativar", status: "ativo" });
    assert.equal(nuncaAceitou?.acao, null);
    assert.ok(nuncaAceitou?.situacao.includes("novo convite"));
  });

  it("convite pendente não é entregador ativo, disponível nem desativado", () => {
    assert.deepEqual(quadro.pendentes.map((item) => item.pessoa.nomeExibicao), ["Entregador 9"]);
    for (const linhas of Object.values(quadro.grupos)) assert.equal(nomes(linhas).includes("Entregador 9"), false);
  });

  it("classificar não altera os dados recebidos (trocar de aba é só olhar outro grupo)", () => {
    const antes = JSON.stringify({ todos, painel });
    classificarQuadroDeEntregadores(todos, painel);
    classificarQuadroDeEntregadores(todos, painel);
    assert.equal(JSON.stringify({ todos, painel }), antes);
  });

  it("ativo que ainda não chegou ao painel vale pelo próprio vínculo; as opções e a aba inicial são fixas", () => {
    const vazio: PainelOperacional = { baseConfigurada: false, fila: [], foraDaBase: [], indisponiveis: [] };
    const semPainel = classificarQuadroDeEntregadores([fora, naoAceitando], vazio);
    assert.deepEqual([nomes(semPainel.grupos.fora_da_base), nomes(semPainel.grupos.indisponiveis)], [["Entregador 3"], ["Entregador 6"]]);
    assert.deepEqual(GRUPOS_DO_QUADRO_DE_ENTREGADORES.map((grupo) => grupo.rotulo), ["Na rota", "Disponíveis", "Fora da base", "Indisponíveis", "Desativados"]);
    assert.equal(ABA_INICIAL_DO_QUADRO_DE_ENTREGADORES, "disponiveis");
  });
});
