import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { EntregaAtribuida, ParadaSaida, SaidaEntrega } from "@jaa/contratos";
import { criarAvisoDeNovaRota } from "./aviso-nova-rota.ts";
import { desenhoDaRota, linhaDoPercurso } from "./mapa-rota.ts";
import { aplicarEntrega, aplicarSaida, entregasForaDasSaidas, estadoEmUmaLinha, moverNoRascunho, ordemMudou, ordenarSaidas, podeConcluirParada, podeReordenar, podeSairParaEntrega, quantidadeDeEntregas, resumoDoPercurso, tituloDaRota, totalDeItens, trajetoCurto, urlDeNavegacao } from "./minhas-entregas.ts";

const id = (n: number) => `018f0000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const eu = { identidadeId: id(900), tipo: "pessoal" as const, nomeExibicao: "Entregador2", nomeUsuario: "entregador2" };
const empresa = { identidadeId: id(800), nome: "pizzaria isaque", nomeUsuario: "pizzariaisaque", slug: "pizzaria-isaque" };
const destino = { cep: "30123000", logradouro: "Rua das Flores", numero: "150", complemento: null, bairro: "Centro", cidade: "Belo Horizonte", uf: "MG", pontoReferencia: null, latitude: -19.92, longitude: -43.94 };

const parada = (n: number, encerrada = false): ParadaSaida =>
  ({ id: id(100 + n), pedidoId: id(n), numeroPedido: n, posicao: n, statusPedido: encerrada ? "entregue" : "pronto", destino, cliente: { identidadeId: id(700 + n), tipo: "pessoal", nomeExibicao: `Cliente ${n}`, nomeUsuario: `cliente${n}` }, totalCentavos: 3390, encerradaEm: encerrada ? "2026-10-05T23:00:00.000Z" : null, motivoEncerramento: null }) as unknown as ParadaSaida;

const saida = (n: number, status: SaidaEntrega["status"], paradas: ParadaSaida[], extra: Partial<SaidaEntrega> = {}): SaidaEntrega =>
  ({ id: id(500 + n), empresa, entregador: eu, status, versaoSequencia: 1, paradas, rota: null, zonaPrincipal: { id: id(600), nome: "zona C" }, zonasCombinadas: [], automatica: true, exigeRetornoBase: false, ...extra }) as unknown as SaidaEntrega;

const entrega = (n: number, status: EntregaAtribuida["status"] = "pronto"): EntregaAtribuida =>
  ({ pedidoId: id(n), numeroPedido: n, empresa, status, destino, cliente: { identidadeId: id(700 + n), tipo: "pessoal", nomeExibicao: `Cliente ${n}`, nomeUsuario: `cliente${n}` }, itens: [{ nomeProduto: "Pizza", quantidade: 1 }, { nomeProduto: "Suco", quantidade: 2 }], totalCentavos: 3390, formaPagamentoNaEntrega: "cartao", trocoParaCentavos: null, atribuidoEm: "2026-10-05T22:00:00.000Z" }) as unknown as EntregaAtribuida;

describe("estado de Minhas entregas: o mesmo da Web, reconciliado com os eventos", () => {
  it("saída nova entra, saída conhecida é substituída, saída sem entregador (recusada/transferida) sai", () => {
    const liberada = saida(1, "liberada_retirada", [parada(16)]);
    assert.deepEqual(aplicarSaida([], liberada), [liberada]);
    const naRua = { ...liberada, status: "em_andamento" } as SaidaEntrega;
    assert.deepEqual(aplicarSaida([liberada], naRua), [naRua]);
    assert.deepEqual(aplicarSaida([liberada], { ...liberada, entregador: null } as SaidaEntrega), []);
  });

  it("entrega: `null` ou status terminal a tira da lista; ativa entra/atualiza", () => {
    assert.deepEqual(aplicarEntrega([entrega(16)], id(16), null), []);
    assert.deepEqual(aplicarEntrega([entrega(16)], id(16), entrega(16, "entregue")), []);
    assert.equal(aplicarEntrega([entrega(16)], id(16), entrega(16, "saiu_para_entrega"))[0]?.status, "saiu_para_entrega");
    assert.deepEqual(entregasForaDasSaidas([entrega(16), entrega(17)], [saida(1, "liberada_retirada", [parada(16)])]).map((item) => item.numeroPedido), [17]);
  });

  it("a rota na rua vem primeiro, depois a liberada, depois a preparada", () => {
    const ordem = ordenarSaidas([saida(1, "preparada", []), saida(2, "liberada_retirada", []), saida(3, "em_andamento", [])]).map((item) => item.status);
    assert.deepEqual(ordem, ["em_andamento", "liberada_retirada", "preparada"]);
  });
});

describe("apresentação da rota", () => {
  it("título, quantidade de entregas (só as ativas) e total de itens", () => {
    const rota = saida(1, "liberada_retirada", [parada(16), parada(15, true)]);
    assert.equal(tituloDaRota(rota), "Rota zona C");
    assert.equal(tituloDaRota({ ...rota, zonaPrincipal: null } as SaidaEntrega), "Rota manual");
    assert.equal(quantidadeDeEntregas(rota), "1 entrega");
    assert.equal(quantidadeDeEntregas(saida(2, "em_andamento", [parada(1), parada(2)])), "2 entregas");
    assert.equal(totalDeItens(entrega(16)), "3 itens");
  });

  it("distância e tempo só com percurso REAL da ordem atual; sem isso, o texto honesto (nenhum número inventado)", () => {
    const semRota = resumoDoPercurso(saida(1, "liberada_retirada", [parada(16)]));
    assert.deepEqual(semRota, { texto: "Sequência sugerida pelo Jaaa", ehTrajeto: false });
    const rota = { estado: "percurso_real", motivoFallback: null, provedor: "mapbox", origem: { latitude: -19.9, longitude: -43.9 }, inicio: { latitude: -19.9, longitude: -43.9 }, comRetorno: false, sequenciaDoProvedor: true, geometria: [{ latitude: -19.9, longitude: -43.9 }, { latitude: -19.92, longitude: -43.94 }], distanciaMetros: 4200, duracaoSegundos: 720, calculadaEm: "2026-10-05T22:00:00.000Z", versaoSequencia: 1 };
    const real = resumoDoPercurso(saida(1, "liberada_retirada", [parada(16)], { rota } as Partial<SaidaEntrega>));
    assert.deepEqual(real, { texto: "4,2 km · aprox. 12 min de trajeto", ehTrajeto: true });
    const envelhecida = resumoDoPercurso(saida(1, "liberada_retirada", [parada(16)], { rota, versaoSequencia: 2 } as Partial<SaidaEntrega>));
    assert.equal(envelhecida.ehTrajeto, false);
    assert.match(envelhecida.texto, /percurso será recalculado/);
  });

  it("ações seguem o estado real: sair/recusar só liberada; concluir só a 1ª parada com a rota na rua", () => {
    const liberada = saida(1, "liberada_retirada", [parada(1), parada(2)]);
    const naRua = saida(2, "em_andamento", [parada(1), parada(2)]);
    assert.ok(podeSairParaEntrega(liberada) && !podeSairParaEntrega(naRua) && !podeSairParaEntrega(saida(3, "preparada", [])));
    assert.ok(podeConcluirParada(naRua, 0) && !podeConcluirParada(naRua, 1) && !podeConcluirParada(liberada, 0));
    assert.ok(podeReordenar(naRua) && !podeReordenar(saida(4, "em_andamento", [parada(1)])));
  });

  it("reordenar é um rascunho: mover dentro dos limites e saber se mudou", () => {
    assert.deepEqual(moverNoRascunho(["a", "b", "c"], "b", -1), ["b", "a", "c"]);
    assert.deepEqual(moverNoRascunho(["a", "b", "c"], "a", -1), ["a", "b", "c"]);
    assert.deepEqual(moverNoRascunho(["a", "b", "c"], "c", 1), ["a", "b", "c"]);
    assert.ok(ordemMudou(["b", "a"], ["a", "b"]) && !ordemMudou(["a", "b"], ["a", "b"]));
  });

  it("navegar usa a coordenada SNAPSHOT do pedido, sem outra fonte", () => {
    assert.equal(urlDeNavegacao(destino, "Pedido 16"), "geo:-19.92,-43.94?q=-19.92,-43.94(Pedido%2016)");
  });
});

describe("alerta sonoro de nova rota: UMA vez por rota atribuída", () => {
  function preparar() {
    let toques = 0;
    return { aviso: criarAvisoDeNovaRota({ tocar: () => (toques += 1) }), toques: () => toques };
  }

  it("a primeira leitura só forma a memória: o que já estava lá ao abrir o app não toca", () => {
    const { aviso, toques } = preparar();
    assert.deepEqual(aviso.sincronizar(["r1"]), []);
    assert.equal(toques(), 0);
  });

  it("rota nova por evento toca uma vez; o mesmo estado, mudança de status, recarga e reconexão não repetem", () => {
    const { aviso, toques } = preparar();
    aviso.sincronizar([]);
    assert.equal(aviso.observar("r1", true), true);
    assert.equal(toques(), 1);
    assert.equal(aviso.observar("r1", true), false, "evento repetido / status mudou");
    assert.deepEqual(aviso.sincronizar(["r1"]), [], "recarga, navegar entre telas, reconectar");
    aviso.sincronizar(["r1"]);
    assert.equal(toques(), 1);
  });

  it("rota que chegou com o app parado toca ao voltar (a lista relida a traz como nova) — uma vez", () => {
    const { aviso, toques } = preparar();
    aviso.sincronizar([]);
    assert.deepEqual(aviso.sincronizar(["r1", "r2"]), ["r1", "r2"]);
    assert.equal(toques(), 1, "duas rotas novas na mesma leitura = um toque");
    assert.equal(aviso.observar("r2", true), false);
  });

  it("rota recusada/transferida é esquecida: se voltar a ser atribuída, é atribuição nova e avisa", () => {
    const { aviso, toques } = preparar();
    aviso.sincronizar([]);
    aviso.observar("r1", true);
    assert.equal(aviso.observar("r1", false), false);
    assert.equal(aviso.observar("r1", true), true);
    assert.equal(toques(), 2);
  });

  it("evento antes da primeira leitura não toca (a leitura inicial decide); trocar de conta zera a memória", () => {
    const { aviso, toques } = preparar();
    assert.equal(aviso.observar("r1", true), false);
    aviso.sincronizar(["r1"]);
    aviso.esquecer();
    assert.deepEqual(aviso.sincronizar(["r9"]), []);
    assert.equal(toques(), 0);
  });

  it("áudio que falha não derruba a operação", () => {
    const aviso = criarAvisoDeNovaRota({
      tocar: () => {
        throw new Error("sem áudio");
      },
    });
    aviso.sincronizar([]);
    assert.equal(aviso.observar("r1", true), true);
  });
});

describe("paridade com a Web: mesmas rotas, mesmos eventos, sem regra própria do Android", () => {
  const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");

  it("a API do app chama exatamente as rotas da área do entregador da Web", () => {
    const app = ler("./api-entregas.ts");
    const web = ler("../../../../../web/src/features/entregas/lib/api-entregas.ts");
    for (const [sufixo, metodo] of [["/iniciar", "POST"], ["/recusar", "POST"], ["/concluir", "POST"], ["/sequencia", "PATCH"], ["/recalcular-rota", "POST"], ["/localizacao", "POST"]] as const) {
      assert.ok(app.includes(sufixo) && web.includes(sufixo), sufixo);
      assert.ok(app.split("\n").some((linha) => linha.includes(sufixo) && linha.includes(`method: "${metodo}"`)), `${sufixo} ${metodo}`);
    }
    for (const rota of ['"/entregas/saidas"', '"/entregas"', '"/entregas/vinculos"', '"/entregas/convites"', '"/entregas/situacao"']) assert.ok(app.includes(rota) && web.includes(rota), rota);
  });

  it("a tela escuta os mesmos quatro eventos da Web e relê ao reconectar/voltar — sem consulta periódica", () => {
    const hook = ler("../hooks/use-minhas-entregas.ts");
    for (const evento of ["EVENTO_SAIDA_ATUALIZADA", "EVENTO_ENTREGA_ATUALIZADA", "EVENTO_SITUACAO_OPERACIONAL", "EVENTO_VINCULO_ENTREGADOR"]) assert.ok(hook.includes(`socket.on(${evento}`) && hook.includes(`socket.off(${evento}`), evento);
    assert.ok(hook.includes('socket.on("connect", reler)') && hook.includes('AppState.addEventListener("change"'));
    assert.ok(!hook.includes("setInterval"));
  });

  it("a tela não manda mais ninguém para a Web e confirma antes de sair, recusar e concluir", () => {
    const tela = ler("../components/tela-entrega.tsx");
    const cartao = ler("../components/cartao-saida.tsx");
    assert.ok(!/Jaaa Web/.test(tela + cartao));
    for (const acao of ["iniciarMinhaSaida(saida.id)", "recusarMinhaSaida(saida.id)", "concluirMinhaProximaParada(saida.id, parada.pedidoId)"]) assert.ok(tela.includes(acao), acao);
    assert.equal((tela.match(/confirmar\(/g) ?? []).length, 3);
    for (const texto of ["SAIR PARA ENTREGA", "Recusar rota", "Marcar como entregue", "Abrir o mapa da rota", "Ver itens", "Próxima parada", "Recalcular melhor rota", "Alterar a ordem das entregas", "Navegar", "Conversar"]) assert.ok(cartao.includes(texto), texto);
    assert.ok(cartao.includes("aoConversar(saida.empresa.nomeUsuario)") && cartao.includes("aoConversar(parada.cliente.nomeUsuario)"));
  });

  it("o som de nova rota fica no layout das abas (qualquer área) e só agindo como pessoa", () => {
    const layout = ler("../../../app/(abas)/_layout.tsx");
    assert.ok(layout.includes("useAvisoNovaRota(ativa && !ehEmpresa ? ativa.identidadeId : null)"));
    const som = ler("./som-nova-rota.ts");
    assert.ok(som.includes('tocarSom("novaRota")') && !/loop\s*=\s*true/.test(som));
  });
});

const ROTA_REAL = { estado: "percurso_real", motivoFallback: null, provedor: "mapbox", origem: { latitude: -19.9, longitude: -43.9 }, inicio: { latitude: -19.9, longitude: -43.9 }, comRetorno: false, sequenciaDoProvedor: true, geometria: [{ latitude: -19.9, longitude: -43.9 }, { latitude: -19.91, longitude: -43.95 }, { latitude: -19.92, longitude: -43.94 }], distanciaMetros: 1800, duracaoSegundos: 240, calculadaEm: "2026-10-05T22:00:00.000Z", versaoSequencia: 1 };

describe("mapa da rota (Mapbox): desenha o que a API guardou, sem outra fonte", () => {
  it("traçado REAL do Mapbox na ordem lng/lat, base, paradas numeradas e a caixa que enquadra tudo", () => {
    const desenho = desenhoDaRota(saida(1, "liberada_retirada", [parada(16), parada(17)], { rota: ROTA_REAL } as Partial<SaidaEntrega>));
    assert.deepEqual(desenho.tracado, [[-43.9, -19.9], [-43.95, -19.91], [-43.94, -19.92]]);
    assert.deepEqual(desenho.base, [-43.9, -19.9]);
    assert.deepEqual(desenho.paradas.map((item) => [item.rotulo, item.proxima]), [["1", true], ["2", false]]);
    assert.deepEqual(desenho.limites, { nordeste: [-43.9, -19.9], sudoeste: [-43.95, -19.92] });
    assert.deepEqual(linhaDoPercurso(desenho.tracado ?? []).geometry, { type: "LineString", coordinates: desenho.tracado });
  });

  it("sem percurso real, de outro provedor ou de ordem antiga: NENHUMA linha (nada de reta inventada)", () => {
    const semRota = desenhoDaRota(saida(1, "liberada_retirada", [parada(16)]));
    assert.ok(semRota.tracado === null && semRota.base === null && semRota.limites !== null);
    assert.equal(desenhoDaRota(saida(1, "liberada_retirada", [parada(16)], { rota: { ...ROTA_REAL, estado: "aproximacao_local", geometria: null, provedor: null } } as Partial<SaidaEntrega>)).tracado, null);
    assert.equal(desenhoDaRota(saida(1, "liberada_retirada", [parada(16)], { rota: { ...ROTA_REAL, provedor: "outro" } } as Partial<SaidaEntrega>)).tracado, null);
    assert.equal(desenhoDaRota(saida(1, "liberada_retirada", [parada(16)], { rota: ROTA_REAL, versaoSequencia: 2 } as Partial<SaidaEntrega>)).tracado, null);
    assert.equal(desenhoDaRota(saida(1, "em_andamento", [parada(16, true)])).limites, null, "sem parada ativa não há mapa");
  });

  it("o app não calcula rota nem usa tiles manuais na rota; o SDK é carregado sob proteção e o token é só o público", () => {
    const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
    const tela = ler("../components/tela-mapa-da-rota.tsx");
    const nativo = ler("./mapbox-nativo.ts");
    assert.ok(tela.includes("ShapeSource") && tela.includes("LineLayer") && tela.includes("MarkerView") && tela.includes("LocationPuck"));
    assert.ok(!/blocosVisiveis|tile\.openstreetmap|directions|optimized-trips/i.test(tela + nativo + ler("./mapa-rota.ts")));
    assert.ok(nativo.includes("RNMBXModule == null") && nativo.includes('require("@rnmapbox/maps")') && !/^import .*@rnmapbox\/maps/m.test(nativo.replace(/typeof import\("@rnmapbox\/maps"\)/, "")));
    assert.ok(ler("./mapa-rota.ts").includes("process.env.EXPO_PUBLIC_MAPBOX_TOKEN") && !/MAPBOX_TOKEN\b(?<!EXPO_PUBLIC_MAPBOX_TOKEN)/.test(nativo));
    // O mapa de ENDEREÇO do cliente não foi migrado: continua com os blocos e o cabeçalho ASCII.
    assert.ok(ler("../../enderecos/components/mapa-ponto.tsx").includes("blocosVisiveis") && !ler("../../enderecos/components/mapa-ponto.tsx").includes("rnmapbox"));
  });
});

describe("estado do entregador em UMA linha e trajeto curto", () => {
  const vinculo = { status: "ativo", disponivel: true } as const;
  const sit = (estado: string, extra: object = {}) => ({ estado, posicaoFila: null, ...extra }) as never;

  it("um texto só para aceitar/base/fila — sem repetir 'Disponível' três vezes", () => {
    assert.deepEqual(estadoEmUmaLinha(vinculo, sit("disponivel_na_base", { posicaoFila: 1 })), { texto: "Disponível · Na base · 1º da fila", tom: "ativo" });
    assert.deepEqual(estadoEmUmaLinha(vinculo, sit("disponivel_na_base")), { texto: "Disponível · Na base", tom: "ativo" });
    assert.deepEqual(estadoEmUmaLinha(vinculo, sit("disponivel_fora_base")), { texto: "Disponível · Fora da base", tom: "atencao" });
    assert.deepEqual(estadoEmUmaLinha(vinculo, sit("em_entrega")), { texto: "Em entrega", tom: "ativo" });
    assert.deepEqual(estadoEmUmaLinha({ status: "ativo", disponivel: false }, sit("indisponivel")), { texto: "Indisponível", tom: "neutro" });
    assert.equal(estadoEmUmaLinha({ status: "inativo", disponivel: false }, undefined).texto, "Vínculo inativo");
    assert.equal(estadoEmUmaLinha(vinculo, undefined).texto, "Disponível");
  });

  it("trajeto curto só com percurso real da ordem atual", () => {
    assert.equal(trajetoCurto(saida(1, "liberada_retirada", [parada(16)], { rota: ROTA_REAL } as Partial<SaidaEntrega>)), "1,8 km · ~4 min");
    assert.equal(trajetoCurto(saida(1, "liberada_retirada", [parada(16)])), null);
    assert.equal(trajetoCurto(saida(1, "liberada_retirada", [parada(16)], { rota: ROTA_REAL, versaoSequencia: 2 } as Partial<SaidaEntrega>)), null);
  });
});

describe("localização no Android: a causa do fechamento e a proteção", () => {
  const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");

  it("o manifesto declara RECEIVE_BOOT_COMPLETED (job persistente do agendador) e POST_NOTIFICATIONS", () => {
    const config = ler("../../../../app.config.ts");
    const permissoes = config.slice(config.indexOf("permissions: ["), config.indexOf("blockedPermissions"));
    for (const permissao of ["RECEIVE_BOOT_COMPLETED", "POST_NOTIFICATIONS", "ACCESS_BACKGROUND_LOCATION", "FOREGROUND_SERVICE_LOCATION"]) assert.ok(permissoes.includes(`"android.permission.${permissao}"`), permissao);
    assert.ok(config.includes('"@rnmapbox/maps"'));
  });

  it("binário sem a permissão não inicia a tarefa em segundo plano: fica só com o app aberto, sem fechar", () => {
    const rastreamento = ler("./rastreamento.ts");
    assert.ok(rastreamento.includes('PermissionsAndroid.check("android.permission.RECEIVE_BOOT_COMPLETED"'));
    assert.match(rastreamento, /if \(!BACKGROUND_DISPONIVEL \|\| !\(await binarioSuportaSegundoPlano\(\)\)\) return \{ situacao: "somente_primeiro_plano", background: false \};/);
  });
});

describe("token público do Mapbox com restrição por URL", () => {
  it("o app confere o token uma vez por sessão e explica a recusa em vez de mostrar um mapa em branco", () => {
    const nativo = readFileSync(new URL("./mapbox-nativo.ts", import.meta.url), "utf8");
    const tela = readFileSync(new URL("../components/tela-mapa-da-rota.tsx", import.meta.url), "utf8");
    assert.ok(nativo.includes("conferencia ??= fetch(") && nativo.includes("resposta.status === 401 || resposta.status === 403"));
    assert.ok(tela.includes("conferirTokenDoMapa()") && tela.includes("{MENSAGEM_TOKEN_RECUSADO}") && tela.indexOf("tokenRecusado ? (") < tela.indexOf("<MapaMapbox"));
  });
});
