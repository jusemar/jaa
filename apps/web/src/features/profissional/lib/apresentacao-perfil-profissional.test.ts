import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { AreaAtuacaoDoDono, AtividadeDoPerfil, CatalogoServicos } from "@jaa/contratos";
import {
  ETAPAS,
  alternarOpcao,
  atributosSemEscolha,
  estadoEtapa,
  etapaInicial,
  etapaVizinha,
  resumoEscolhas,
  resumoHorarios,
  aplicacaoArea,
  atividadesParaAdicionar,
  descricaoArea,
  enderecoDoFormularioMudou,
  erroDoDia,
  gradeDosPeriodos,
  gradeTemErro,
  kmParaMetros,
  periodosDaGrade,
  podeAtivarMaisAreas,
  proximaFaixa,
  textoPendencias,
} from "./apresentacao-perfil-profissional";

const id = (n: number) => `0199b000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const item = (n: number, nome: string) => ({ id: id(n), slug: nome.toLowerCase(), nome });

const catalogo: CatalogoServicos = {
  categorias: [
    {
      ...item(1, "Categoria"),
      servicos: [
        { ...item(11, "Entregador"), categoriaId: id(1), especialidades: [], atributos: [{ ...item(21, "Veiculo"), tipoSelecao: "multipla", obrigatorio: true, opcoes: [item(31, "Moto"), item(32, "Carro")] }] },
        { ...item(12, "Mototaxi"), categoriaId: id(1), especialidades: [], atributos: [] },
        { ...item(13, "Cabeleireiro"), categoriaId: id(1), especialidades: [item(41, "Corte")], atributos: [] },
        { ...item(14, "Quarta"), categoriaId: id(1), especialidades: [], atributos: [] },
      ],
    },
  ],
};

const atividade = (n: number, catalogoId: number, nome: string): AtividadeDoPerfil => ({
  id: id(n),
  atividadeId: id(catalogoId),
  nome,
  especialidadeIds: [],
  opcaoIds: [],
  periodos: [],
  permiteAgendamento: false,
});

describe("atividades", () => {
  it("oferece só o que ainda não está no perfil", () => {
    assert.deepEqual(
      atividadesParaAdicionar(catalogo, [atividade(101, 11, "Entregador")]).map((servico) => servico.nome),
      ["Mototaxi", "Cabeleireiro", "Quarta"],
    );
  });

  it("com 3 atividades não oferece a quarta", () => {
    const tres = [atividade(101, 11, "Entregador"), atividade(102, 12, "Mototaxi"), atividade(103, 13, "Cabeleireiro")];
    assert.deepEqual(atividadesParaAdicionar(catalogo, tres), []);
  });

  it("atributo MÚLTIPLO liga e desliga; ÚNICO troca a opção do mesmo atributo", () => {
    const multiplo = { tipoSelecao: "multipla" as const, opcoes: [{ id: "moto" }, { id: "carro" }] };
    assert.deepEqual(alternarOpcao(["moto"], "carro", multiplo), ["moto", "carro"]);
    assert.deepEqual(alternarOpcao(["moto", "carro"], "moto", multiplo), ["carro"]);
    const unico = { tipoSelecao: "unica" as const, opcoes: [{ id: "p" }, { id: "g" }] };
    assert.deepEqual(alternarOpcao(["p", "outra"], "g", unico), ["outra", "g"]);
  });
});

describe("item obrigatório da atividade (veículo do Entregador)", () => {
  const [entregador, mototaxi] = catalogo.categorias[0]!.servicos;

  it("sem nenhuma opção marcada, falta o item; com uma, não falta", () => {
    assert.deepEqual(atributosSemEscolha(entregador, []).map((atributo) => atributo.nome), ["Veiculo"]);
    assert.deepEqual(atributosSemEscolha(entregador, [id(31)]), []);
    assert.deepEqual(atributosSemEscolha(entregador, [id(31), id(32)]), []);
  });

  it("opção de outro item não conta; atividade sem item obrigatório e catálogo ausente não bloqueiam", () => {
    assert.equal(atributosSemEscolha(entregador, [id(99)]).length, 1);
    assert.deepEqual(atributosSemEscolha(mototaxi, []), []);
    assert.deepEqual(atributosSemEscolha(undefined, []), []);
    const opcional = { ...entregador!, atributos: entregador!.atributos.map((atributo) => ({ ...atributo, obrigatorio: false })) };
    assert.deepEqual(atributosSemEscolha(opcional, []), []);
  });

  it("na tela: escolhe antes de adicionar, Salvar bloqueado sem o item e aviso no perfil antigo", () => {
    const tela = readFileSync(new URL("../components/secao-atividades.tsx", import.meta.url), "utf8");
    assert.ok(tela.includes("adicionarAtividade(servico.id, opcaoIds)"));
    assert.ok(tela.includes("data-escolha-obrigatoria"));
    assert.ok(tela.includes("disabled={pendente !== null || faltando.length > 0}"));
    assert.ok(tela.includes("Falta escolher: {atributo.nome}"));
  });
});

describe("horários", () => {
  it("monta a grade por dia e volta aos períodos sem perder nada", () => {
    const periodos = [
      { diaSemana: 1, inicio: "14:00", fim: "18:00" },
      { diaSemana: 1, inicio: "08:00", fim: "12:00" },
      { diaSemana: 6, inicio: "08:00", fim: "16:00" },
    ];
    const grade = gradeDosPeriodos(periodos);
    assert.deepEqual(grade[1], [{ inicio: "08:00", fim: "12:00" }, { inicio: "14:00", fim: "18:00" }]);
    assert.deepEqual(grade[7], []);
    assert.equal(periodosDaGrade(grade).length, 3);
  });

  it("sobreposição e início depois do fim viram erro curto", () => {
    assert.equal(erroDoDia(1, [{ inicio: "08:00", fim: "12:00" }, { inicio: "11:00", fim: "15:00" }]), "Horários sobrepostos");
    assert.equal(erroDoDia(1, [{ inicio: "18:00", fim: "08:00" }]), "Início antes do fim");
    assert.equal(erroDoDia(1, [{ inicio: "08:00", fim: "12:00" }, { inicio: "12:00", fim: "18:00" }]), null);
    assert.equal(erroDoDia(1, [{ inicio: "00:00", fim: "24:00" }]), null);
    assert.equal(gradeTemErro(gradeDosPeriodos([])), false);
  });

  it("adicionar horário sugere a faixa seguinte sem passar da meia-noite", () => {
    assert.deepEqual(proximaFaixa([]), { inicio: "08:00", fim: "18:00" });
    assert.deepEqual(proximaFaixa([{ inicio: "08:00", fim: "12:00" }]), { inicio: "13:00", fim: "17:00" });
    assert.deepEqual(proximaFaixa([{ inicio: "18:00", fim: "23:30" }]), { inicio: "23:30", fim: "24:00" });
    assert.equal(proximaFaixa([{ inicio: "00:00", fim: "24:00" }]), null);
  });
});

describe("situação e áreas", () => {
  const area = (dados: Partial<AreaAtuacaoDoDono>): AreaAtuacaoDoDono => ({
    id: id(900),
    modalidade: "raio",
    nome: null,
    ativa: true,
    raioMetros: 10_000,
    poligonos: null,
    municipio: null,
    todasAtividades: true,
    atividadeIds: [],
    ...dados,
  });

  it("pendências em texto curto", () => {
    assert.equal(textoPendencias(["base", "area"]), "Falta: sua base no mapa, uma área de atuação.");
    assert.equal(textoPendencias([]), null);
  });

  it("descreve cada tipo de área e a quem ela se aplica", () => {
    assert.equal(descricaoArea(area({ raioMetros: 12_500 })), "Até 12,5 km da base");
    assert.equal(descricaoArea(area({ modalidade: "municipio", raioMetros: null, municipio: { codigoIbge: "3106200", nome: "Belo Horizonte", uf: "MG" } })), "Belo Horizonte – MG");
    const atividades = [atividade(101, 11, "Entregador"), atividade(103, 13, "Cabeleireiro")];
    assert.equal(aplicacaoArea(area({}), atividades), "Todas as atividades");
    assert.equal(aplicacaoArea(area({ todasAtividades: false, atividadeIds: [id(103)] }), atividades), "Cabeleireiro");
    assert.equal(kmParaMetros(12.5), 12_500);
  });

  it("5 áreas ATIVAS é o limite; desativadas não contam", () => {
    const cinco = Array.from({ length: 5 }, () => area({}));
    assert.equal(podeAtivarMaisAreas(cinco), false);
    assert.equal(podeAtivarMaisAreas([...cinco.slice(1), area({ ativa: false }), area({ ativa: false })]), true);
  });
});

describe("base: endereço do formulário × endereço salvo", () => {
  const salva = {
    cep: "30668275",
    logradouro: "Rua Pico do Rola Moca",
    numero: "150",
    complemento: null,
    bairro: "Distrito Industrial do Jatobá (Barreiro)",
    cidade: "Belo Horizonte",
    uf: "MG",
    pontoReferencia: null,
    codigoIbge: "3106200",
    coordenadas: { latitude: -20.002641, longitude: -44.027755 },
    atualizadoEm: "2026-09-27T12:00:00.000Z",
  };
  const formulario = { cep: "30668-275", logradouro: salva.logradouro, numero: "150", complemento: "", bairro: salva.bairro, cidade: salva.cidade, uf: "MG", pontoReferencia: "" };

  it("mesmo endereço (CEP só formatado diferente, vazio × null) não é mudança", () => {
    assert.equal(enderecoDoFormularioMudou(salva, formulario), false);
  });

  it("outro CEP, outro número ou outra rua é mudança: o ponto confirmado não vale mais", () => {
    assert.equal(enderecoDoFormularioMudou(salva, { ...formulario, cep: "30130-003" }), true);
    assert.equal(enderecoDoFormularioMudou(salva, { ...formulario, numero: "151" }), true);
    assert.equal(enderecoDoFormularioMudou(salva, { ...formulario, logradouro: "Avenida Afonso Pena" }), true);
  });

  it("ponto de referência não mexe no ponto; sem base salva não há o que comparar", () => {
    assert.equal(enderecoDoFormularioMudou(salva, { ...formulario, pontoReferencia: "Perto da praça" }), false);
    assert.equal(enderecoDoFormularioMudou(null, formulario), false);
  });
});

describe("etapas: Base primeiro, com progresso", () => {
  const perfil = (pendencias: Array<"base" | "atividade" | "area">, situacao: "ativo" | "incompleto" | "inativo" = "inativo") => ({ pendencias, situacao });

  it("a ordem é Base → Atividades → Área → Resumo", () => {
    assert.deepEqual(ETAPAS.map((etapa) => etapa.id), ["base", "atividades", "areas", "resumo"]);
    assert.equal(etapaVizinha("base", 1), "atividades");
    assert.equal(etapaVizinha("base", -1), null);
    assert.equal(etapaVizinha("resumo", 1), null);
  });

  it("abre na primeira etapa que falta; tudo pronto abre no Resumo", () => {
    assert.equal(etapaInicial(perfil(["base", "atividade", "area"])), "base");
    assert.equal(etapaInicial(perfil(["atividade", "area"])), "atividades");
    assert.equal(etapaInicial(perfil(["area"])), "areas");
    assert.equal(etapaInicial(perfil([], "ativo")), "resumo");
  });

  it("cada etapa diz se está concluída, é a atual ou está pendente", () => {
    const meio = perfil(["area"]);
    assert.deepEqual(
      ETAPAS.map((etapa) => estadoEtapa(meio, etapa.id, "areas")),
      ["concluida", "concluida", "atual", "pendente"],
    );
  });
});

describe("resumos compactos", () => {
  it("horário padrão vira duas linhas", () => {
    const padrao = [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, inicio: "08:00", fim: "18:00" }));
    assert.deepEqual(resumoHorarios(padrao), ["Seg–Sex · 08:00–18:00", "Sáb–Dom · Fechado"]);
  });

  it("almoço, sábado diferente e 24 horas continuam legíveis", () => {
    const periodos = [
      ...[1, 2, 3, 4, 5].flatMap((diaSemana) => [
        { diaSemana, inicio: "08:00", fim: "12:00" },
        { diaSemana, inicio: "14:00", fim: "18:00" },
      ]),
      { diaSemana: 6, inicio: "08:00", fim: "16:00" },
      { diaSemana: 7, inicio: "00:00", fim: "24:00" },
    ];
    assert.deepEqual(resumoHorarios(periodos), ["Seg–Sex · 08:00–12:00, 14:00–18:00", "Sáb · 08:00–16:00", "Dom · 24 horas"]);
    assert.deepEqual(resumoHorarios([]), ["Seg–Dom · Fechado"]);
  });

  it("escolhas da atividade saem pelo nome, na ordem do catálogo", () => {
    const entregador = catalogo.categorias[0]?.servicos[0];
    assert.deepEqual(resumoEscolhas({ especialidadeIds: [], opcaoIds: [id(32), id(31)] }, entregador), ["Moto", "Carro"]);
    assert.deepEqual(resumoEscolhas({ especialidadeIds: [], opcaoIds: [] }, undefined), []);
  });
});
