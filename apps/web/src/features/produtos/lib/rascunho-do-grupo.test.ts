import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GrupoOpcoesProduto } from "@jaa/contratos";
import { gruposDoClienteNoDia } from "./previa-do-cliente.ts";
import { comOpcaoGravada, grupoAlterado, interpretarAcrescimo, planejarGravacao, planoVazio, rascunhoInicial, semAOpcao } from "./rascunho-do-grupo.ts";
import { regraEmPalavras } from "./regra-do-grupo.ts";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const grupo = (extra: Partial<GrupoOpcoesProduto> = {}): GrupoOpcoesProduto => ({
  id: ID(100),
  nome: "Acompanhamentos",
  instrucao: null,
  minimoEscolhas: 0,
  maximoEscolhas: 5,
  posicao: 0,
  programacaoSemanal: false,
  opcoes: [
    { id: ID(1), nome: "Arroz", precoAdicionalCentavos: 0, disponibilidade: "disponivel", posicao: 0 },
    { id: ID(2), nome: "Feijão", precoAdicionalCentavos: 250, disponibilidade: "disponivel", posicao: 1 },
    { id: ID(3), nome: "Macarrão", precoAdicionalCentavos: 0, disponibilidade: "indisponivel", posicao: 2 },
  ],
  ...extra,
});
const plano = (g: GrupoOpcoesProduto | null, rascunho: ReturnType<typeof rascunhoInicial>) => {
  const resultado = planejarGravacao(g, rascunho);
  assert.ok(resultado.ok, resultado.ok ? "" : resultado.erro);
  return resultado.plano;
};

describe("regra do grupo em palavras", () => {
  it("vem só do mínimo e do máximo", () => {
    assert.equal(regraEmPalavras({ minimoEscolhas: 1, maximoEscolhas: 1 }), "Escolha única · Obrigatório");
    assert.equal(regraEmPalavras({ minimoEscolhas: 0, maximoEscolhas: 1 }), "Escolha única · Opcional");
    assert.equal(regraEmPalavras({ minimoEscolhas: 0, maximoEscolhas: 5 }), "Até 5 escolhas · Opcional");
    assert.equal(regraEmPalavras({ minimoEscolhas: 2, maximoEscolhas: 2 }), "Exatamente 2 escolhas · Obrigatório");
    assert.equal(regraEmPalavras({ minimoEscolhas: 1, maximoEscolhas: 3 }), "De 1 a 3 escolhas · Obrigatório");
  });
});

describe("rascunho do grupo (Opções e regras)", () => {
  it("o rascunho inicial espelha o grupo; sem mexer, nada está alterado e o plano é vazio", () => {
    const rascunho = rascunhoInicial(grupo());
    assert.deepEqual(rascunho.opcoes.map((opcao) => [opcao.nome, opcao.acrescimo, opcao.ativa]), [["Arroz", "", true], ["Feijão", "2,50", true], ["Macarrão", "", false]]);
    assert.equal(grupoAlterado(grupo(), rascunho), false);
    assert.ok(planoVazio(plano(grupo(), rascunho)));
  });

  it("o plano leva SÓ o que mudou: campos do grupo, opções alteradas e opções novas", () => {
    const rascunho = rascunhoInicial(grupo());
    rascunho.nome = "Guarnição do dia ";
    rascunho.maximo = "4";
    rascunho.opcoes[0] = { ...rascunho.opcoes[0]!, nome: "Arroz branco" };
    rascunho.opcoes[1] = { ...rascunho.opcoes[1]!, acrescimo: "3" };
    rascunho.opcoes[2] = { ...rascunho.opcoes[2]!, ativa: true };
    rascunho.opcoes.push({ chave: "nova-1", id: null, nome: " Farofa ", acrescimo: "1,5", ativa: false });
    assert.equal(grupoAlterado(grupo(), rascunho), true);
    assert.deepEqual(plano(grupo(), rascunho), {
      criar: null,
      grupo: { nome: "Guarnição do dia", minimoEscolhas: 0, maximoEscolhas: 4 },
      alteradas: [
        { id: ID(1), entrada: { nome: "Arroz branco" } },
        { id: ID(2), entrada: { precoAdicionalCentavos: 300 } },
        { id: ID(3), entrada: { disponibilidade: "disponivel" } },
      ],
      novas: [{ chave: "nova-1", entrada: { nome: "Farofa", precoAdicionalCentavos: 150, disponibilidade: "indisponivel" } }],
    });
  });

  it("instrução vazia vira null; grupo novo é criado antes das opções", () => {
    const comInstrucao = grupo({ instrucao: "Escolha" });
    const limpando = { ...rascunhoInicial(comInstrucao), instrucao: "  " };
    assert.deepEqual(plano(comInstrucao, limpando).grupo, { instrucao: null });

    const novo = { ...rascunhoInicial(null), nome: "Bebida", opcoes: [{ chave: "nova-1", id: null, nome: "Suco", acrescimo: "6", ativa: true }] };
    assert.deepEqual(plano(null, novo), { criar: { nome: "Bebida", instrucao: null, minimoEscolhas: 0, maximoEscolhas: 1 }, grupo: null, alteradas: [], novas: [{ chave: "nova-1", entrada: { nome: "Suco", precoAdicionalCentavos: 600, disponibilidade: "disponivel" } }] });
    assert.equal(grupoAlterado(null, rascunhoInicial(null)), false, "editor de grupo novo, intocado, fecha sem perguntar");
    assert.equal(grupoAlterado(null, novo), true);
  });

  it("recusa antes de gravar: nome vazio, opção sem nome, faixa incoerente e acréscimo inválido", () => {
    const erro = (mudanca: (rascunho: ReturnType<typeof rascunhoInicial>) => void) => {
      const rascunho = rascunhoInicial(grupo());
      mudanca(rascunho);
      const resultado = planejarGravacao(grupo(), rascunho);
      return resultado.ok ? null : resultado.erro;
    };
    assert.equal(erro((r) => (r.nome = " ")), "Preencha o nome do grupo e de todas as opções.");
    assert.equal(erro((r) => r.opcoes.push({ chave: "n", id: null, nome: "", acrescimo: "", ativa: true })), "Preencha o nome do grupo e de todas as opções.");
    for (const [minimo, maximo] of [["3", "2"], ["0", "0"], ["-1", "2"], ["1,5", "2"], ["", "2"]]) {
      assert.equal(erro((r) => Object.assign(r, { minimo, maximo })), "O máximo deve ser pelo menos 1 e não pode ser menor que o mínimo.", `${minimo}/${maximo}`);
    }
    assert.match(erro((r) => (r.opcoes[0] = { ...r.opcoes[0]!, acrescimo: "abc" })) ?? "", /Informe o acréscimo como 5,00/);
    assert.equal(grupoAlterado(grupo(), { ...rascunhoInicial(grupo()), minimo: "9" }), true, "rascunho inválido conta como alterado");
  });

  it("acréscimo: vazio e zero valem 0; o resto é convertido por texto para centavos", () => {
    assert.deepEqual(["", " ", "0", "0,00", "0.0"].map(interpretarAcrescimo), [0, 0, 0, 0, 0]);
    assert.deepEqual(["2,5", "12", "R$ 1,99"].map(interpretarAcrescimo), [250, 1200, 199]);
    assert.equal(interpretarAcrescimo("1,999"), null);
  });

  it("opção apagada sai do rascunho sem perder o resto; opção gravada ganha o id (salvar de novo não duplica)", () => {
    const rascunho = rascunhoInicial(grupo());
    rascunho.opcoes.push({ chave: "nova-1", id: null, nome: "Farofa", acrescimo: "", ativa: true });
    const semArroz = semAOpcao(rascunho, ID(1));
    assert.deepEqual(semArroz.opcoes.map((opcao) => opcao.nome), ["Feijão", "Macarrão", "Farofa"]);

    const gravada = comOpcaoGravada(rascunho, "nova-1", ID(9));
    const servidor = grupo({ opcoes: [...grupo().opcoes, { id: ID(9), nome: "Farofa", precoAdicionalCentavos: 0, disponibilidade: "disponivel", posicao: 3 }] });
    assert.ok(planoVazio(plano(servidor, gravada)), "com o id, a linha já corresponde à opção do servidor");
    assert.equal(plano(servidor, rascunho).novas.length, 1, "sem o id, seria criada de novo");
  });
});

describe("prévia do cliente: o que aparece em cada dia", () => {
  const semanal = grupo({ programacaoSemanal: true });
  const programacoes = { [ID(100)]: { grupoId: ID(100), programacaoSemanal: true, dias: ([1, 2, 3, 4, 5, 6, 7] as const).map((diaSemana) => ({ diaSemana, opcaoIds: diaSemana === 1 ? [ID(1), ID(2), ID(3)] : diaSemana === 2 ? [ID(1)] : [] })) } };

  it("só opção disponível e, em grupo semanal, só o que o dia oferece", () => {
    assert.deepEqual(gruposDoClienteNoDia([semanal], programacoes, 1)[0]?.opcoes.map((opcao) => opcao.nome), ["Arroz", "Feijão"]);
    assert.deepEqual(gruposDoClienteNoDia([semanal], programacoes, 2)[0]?.opcoes.map((opcao) => opcao.nome), ["Arroz"]);
    assert.deepEqual(gruposDoClienteNoDia([grupo()], {}, 3)[0]?.opcoes.map((opcao) => opcao.nome), ["Arroz", "Feijão"], "sem programação: todo dia igual");
  });

  it("grupo sem opção no dia, ou que não cumpre o próprio mínimo, não aparece", () => {
    assert.deepEqual(gruposDoClienteNoDia([semanal], programacoes, 3), []);
    assert.deepEqual(gruposDoClienteNoDia([{ ...semanal, minimoEscolhas: 2 }], programacoes, 2), []);
    assert.equal(gruposDoClienteNoDia([{ ...semanal, minimoEscolhas: 2 }], programacoes, 1).length, 1);
  });

  it("não vaza dado administrativo: só id, nome e acréscimo de cada opção", () => {
    assert.deepEqual(Object.keys(gruposDoClienteNoDia([grupo()], {}, 1)[0]?.opcoes[0] ?? {}), ["id", "nome", "precoAdicionalCentavos"]);
  });
});
