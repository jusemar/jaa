import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { PRESENCA_VALIDADE_MAXIMA_MS } from "@jaa/contratos";
import { INTERVALO_PRESENCA_SEGUNDO_PLANO_MS, LEITURAS_QUE_PODEM_FALHAR, aposResposta, leituraDaPosicao, lerVinculosGuardados, situacaoDaPresenca, vinculosAceitando } from "./presenca-base.ts";

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const comTudo = { permissaoSegundoPlano: true, binarioSuporta: true };

describe("presença na base: quando o aparelho confirma em segundo plano", () => {
  it("disponível, fora de entrega e com a permissão: a presença continua sendo renovada com a tela bloqueada", () => {
    assert.equal(situacaoDaPresenca({ vinculos: ["v1"], emEntrega: false, ...comTudo }), "ativa");
  });

  it("só confirma por vínculo ATIVO e ACEITANDO; indisponível em todas = nenhuma tarefa em segundo plano", () => {
    const situacoes = [
      { entregadorId: "v1", status: "ativo", disponivel: true },
      { entregadorId: "v2", status: "ativo", disponivel: false },
      { entregadorId: "v3", status: "inativo", disponivel: false },
    ] as const;
    assert.deepEqual(vinculosAceitando(situacoes), ["v1"]);
    assert.equal(situacaoDaPresenca({ vinculos: vinculosAceitando(situacoes.slice(1)), emEntrega: false, ...comTudo }), "parada");
  });

  it("entrega iniciada: a tarefa de presença para — a localização é do rastreamento da saída, nunca as duas", () => {
    assert.equal(situacaoDaPresenca({ vinculos: ["v1"], emEntrega: true, ...comTudo }), "parada");
  });

  it("sem 'permitir o tempo todo' (ou binário antigo): só com o app aberto — e a tela diz isso", () => {
    assert.equal(situacaoDaPresenca({ vinculos: ["v1"], emEntrega: false, permissaoSegundoPlano: false, binarioSuporta: true }), "somente_primeiro_plano");
    assert.equal(situacaoDaPresenca({ vinculos: ["v1"], emEntrega: false, permissaoSegundoPlano: true, binarioSuporta: false }), "somente_primeiro_plano");
  });
});

describe("frequência × validade de 3 minutos", () => {
  it("uma leitura por minuto: cabem duas leituras perdidas antes de a presença vencer — sem mexer na validade", () => {
    assert.equal(INTERVALO_PRESENCA_SEGUNDO_PLANO_MS, 60_000);
    assert.equal(PRESENCA_VALIDADE_MAXIMA_MS, 3 * 60_000);
    assert.equal(LEITURAS_QUE_PODEM_FALHAR, 2);
    assert.ok(INTERVALO_PRESENCA_SEGUNDO_PLANO_MS * (LEITURAS_QUE_PODEM_FALHAR + 1) <= PRESENCA_VALIDADE_MAXIMA_MS);
  });

  it("parado na base também gera leitura (distância mínima zero) e a precisão atende ao raio da base", () => {
    const tarefa = ler("./presenca-segundo-plano.ts");
    assert.ok(tarefa.includes("timeInterval: INTERVALO_PRESENCA_SEGUNDO_PLANO_MS") && tarefa.includes("distanceInterval: 0") && tarefa.includes("accuracy: Location.Accuracy.High"));
    assert.ok(tarefa.includes("foregroundService: {") && tarefa.includes('notificationTitle: "Presença na base"'));
  });
});

describe("a tarefa obedece ao servidor e se desliga sozinha", () => {
  const ok = (dados: { status: string; disponivel: boolean; estado: string }) => ({ ok: true as const, dados: dados as never });

  it("segue confirmando enquanto ele aceita entregas e está fora de entrega", () => {
    assert.deepEqual(aposResposta(["v1", "v2"], "v1", ok({ status: "ativo", disponivel: true, estado: "disponivel_na_base" })), { vinculos: ["v1", "v2"], emEntrega: false });
  });

  it("deixou de aceitar (em outro aparelho) ou vínculo desativado: aquele vínculo sai da lista", () => {
    assert.deepEqual(aposResposta(["v1", "v2"], "v1", ok({ status: "ativo", disponivel: false, estado: "indisponivel" })).vinculos, ["v2"]);
    assert.deepEqual(aposResposta(["v1"], "v1", ok({ status: "inativo", disponivel: false, estado: "indisponivel" })).vinculos, []);
    assert.deepEqual(aposResposta(["v1", "v2"], "v1", { ok: false, status: 404 }).vinculos, ["v2"]);
  });

  it("servidor diz 'em entrega': a tarefa de presença se desliga (o rastreamento assume)", () => {
    assert.equal(aposResposta(["v1"], "v1", ok({ status: "ativo", disponivel: true, estado: "em_entrega" })).emEntrega, true);
  });

  it("sessão encerrada: não há mais quem confirmar", () => {
    assert.deepEqual(aposResposta(["v1", "v2"], "v1", { ok: false, status: 401 }), { vinculos: [], emEntrega: false });
  });

  it("sem rede, leitura imprecisa ou erro do servidor: mantém e tenta na próxima — se não voltar, a presença VENCE no servidor", () => {
    for (const status of [0, 409, 500]) assert.deepEqual(aposResposta(["v1"], "v1", { ok: false, status }).vinculos, ["v1"]);
  });

  it("envia só o que o aparelho mediu, e a lista guardada tolera valor ausente ou corrompido", () => {
    assert.deepEqual(leituraDaPosicao({ coords: { latitude: -19.9301234, longitude: -43.9381234, accuracy: 12 }, timestamp: Date.UTC(2026, 9, 7, 12) }), { latitude: -19.930123, longitude: -43.938123, precisaoMetros: 12, medidaEm: "2026-10-07T12:00:00.000Z" });
    assert.deepEqual(lerVinculosGuardados('["v1","v2"]'), ["v1", "v2"]);
    assert.deepEqual([lerVinculosGuardados(null), lerVinculosGuardados("{"), lerVinculosGuardados('{"a":1}')], [[], [], []]);
  });
});

describe("uma infraestrutura, duas tarefas que nunca rodam juntas", () => {
  const tarefa = ler("./presenca-segundo-plano.ts");
  const rastreamento = ler("./rastreamento.ts");

  it("reutiliza expo-location + expo-task-manager + as permissões já declaradas; nada novo no manifesto", () => {
    assert.ok(tarefa.includes('from "expo-location"') && tarefa.includes('from "expo-task-manager"') && tarefa.includes("TaskManager.defineTask(TAREFA_PRESENCA"));
    const config = ler("../../../../app.config.ts");
    for (const permissao of ["ACCESS_BACKGROUND_LOCATION", "FOREGROUND_SERVICE_LOCATION", "RECEIVE_BOOT_COMPLETED", "POST_NOTIFICATIONS"]) assert.ok(config.includes(`"android.permission.${permissao}"`), permissao);
    assert.ok(tarefa.includes('"android.permission.RECEIVE_BOOT_COMPLETED"'), "binário antigo não inicia a tarefa (evita o fechamento)");
  });

  it("a entrega começa → a presença é pausada ANTES; a entrega termina → a presença é retomada", () => {
    const iniciar = rastreamento.slice(rastreamento.indexOf("export async function iniciarRastreamento"), rastreamento.indexOf("export async function pararRastreamento"));
    assert.ok(iniciar.indexOf("await pausarPresenca();") > 0 && iniciar.indexOf("await pausarPresenca();") < iniciar.indexOf("Location.startLocationUpdatesAsync(TAREFA_RASTREAMENTO"));
    const parar = rastreamento.slice(rastreamento.indexOf("export async function pararRastreamento"), rastreamento.indexOf("export async function rastreamentoEstaAtivo"));
    assert.ok(parar.includes("await retomarPresenca();"));
    // A própria tarefa também se desliga quando o servidor responde "em entrega" ou não há mais vínculos.
    assert.ok(tarefa.includes("if (vinculos.length === 0 || emEntrega) await desligarTarefa();"));
  });

  it("a tarefa é definida na partida do app; sair da conta e ficar indisponível a desligam", () => {
    assert.ok(ler("../../../app/_layout.tsx").includes('import "@/features/entregas/lib/presenca-segundo-plano";'));
    const sair = ler("../../conta/hooks/use-sair-da-conta.ts");
    assert.ok(sair.indexOf("await encerrarPresenca();") > 0 && sair.indexOf("await encerrarPresenca();") < sair.indexOf("await pararRastreamento();"));
    const hook = ler("../hooks/use-presenca-na-base.ts");
    assert.ok(hook.includes("sincronizarPresencaSegundoPlano({ vinculos: idsAceitando") && hook.includes("[idsAceitando, emEntrega, visivel]"), "reconfere ao mudar a disponibilidade, a entrega e ao voltar ao primeiro plano");
    assert.ok(ler("../components/tela-entrega.tsx").includes("usePresencaNaBase(situacoes, minhas.adotarSituacao, naRuaId !== null)"));
  });

  it("a permissão 'o tempo todo' só é pedida por um toque da pessoa", () => {
    const hook = ler("../hooks/use-presenca-na-base.ts");
    const permitir = hook.slice(hook.indexOf("const permitir = useCallback"), hook.indexOf("return { permissao"));
    assert.ok(permitir.includes("await pedirPermissaoSegundoPlano();"));
    assert.equal((hook.match(/pedirPermissaoSegundoPlano\(\)/g) ?? []).length, 1);
    assert.ok(!tarefa.slice(tarefa.indexOf("export async function sincronizarPresencaSegundoPlano")).split("export async function pausarPresenca")[0]!.includes("requestBackgroundPermissionsAsync"));
  });
});
