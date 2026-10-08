import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { EnderecoCliente, EnderecoDoCep } from "@jaa/contratos";
import { MENSAGEM_CEP, criarConsultorCep, type RequisitarCep, type SituacaoCep } from "./consulta-cep.ts";
import { aoUsarEndereco, destinoDoVoltar, pontoSalvo, rotuloDoNovoEndereco, type EtapaDoEndereco } from "./etapa-endereco.ts";
import { ENDERECO_VAZIO, dadosDoEndereco, mascararCep, normalizarUf, validarEndereco } from "./formulario-endereco.ts";
import { CABECALHOS_DOS_BLOCOS, CENTRO_PADRAO, TAMANHO_DO_BLOCO, arredondarCoordenadas, blocosVisiveis, centroAposArrastar, coordenadasParaMundo, distanciaAproximadaKm, limitarZoom, mundoParaCoordenadas } from "./mapa-ponto.ts";

/*
 * Endereço dentro do pedido, no app: cadastrar, confirmar o ponto e seguir — sem sair do checkout.
 * Regras puras aqui; o que depende de tela é conferido pelo código-fonte (o app não roda no Node).
 */
const fonte = (arquivo: string) => readFileSync(new URL(arquivo, import.meta.url), "utf8");
const semComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
const ETAPA = semComentarios(fonte("../components/etapa-endereco-entrega.tsx"));
const FORMULARIO = semComentarios(fonte("../components/formulario-endereco.tsx"));
const MAPA = semComentarios(fonte("../components/confirmar-ponto-entrega.tsx"));
const CONVERSA = semComentarios(fonte("../../conversas/components/tela-conversa.tsx"));

const salvo = (extra: Partial<EnderecoCliente> = {}): EnderecoCliente => ({
  id: "11111111-1111-4111-8111-111111111111",
  apelido: "Casa",
  cep: "30123000",
  logradouro: "Rua das Flores",
  numero: "150",
  complemento: "Apto 302",
  bairro: "Centro",
  cidade: "Belo Horizonte",
  uf: "MG",
  pontoReferencia: null,
  latitude: -19.919125,
  longitude: -43.938602,
  localizacaoConfirmadaEm: "2026-10-01T12:00:00.000Z",
  criadoEm: "2026-10-01T12:00:00.000Z",
  atualizadoEm: "2026-10-01T12:00:00.000Z",
  ...extra,
});
const VALIDO = { ...ENDERECO_VAZIO, cep: "30123-000", logradouro: "Rua das Flores", numero: "150", bairro: "Centro", cidade: "Belo Horizonte" };

describe("usuário com endereço existente", () => {
  it("endereço com ponto confirmado segue direto (só a cobertura é conferida no servidor)", () => {
    assert.equal(aoUsarEndereco(salvo()), "conferir-cobertura");
    assert.deepEqual(pontoSalvo(salvo()), { latitude: -19.919125, longitude: -43.938602 });
    assert.ok(ETAPA.includes("validarCoberturaEntrega(empresaIdentidadeId") && ETAPA.includes("aoSelecionar(endereco);"));
  });

  it("endereço sem ponto confirmado passa primeiro pelo mapa, em vez de ficar sem ação", () => {
    const pendente = salvo({ latitude: null, longitude: null, localizacaoConfirmadaEm: null });
    assert.equal(aoUsarEndereco(pendente), "confirmar-no-mapa");
    assert.equal(pontoSalvo(pendente), null);
    assert.ok(ETAPA.includes('confirmado ? "Usar este" : "Confirmar no mapa"'));
  });

  it("a lista oferece claramente 'Adicionar novo endereço', além de editar, ajustar o ponto e remover", () => {
    assert.equal(rotuloDoNovoEndereco(2), "Adicionar novo endereço");
    for (const acao of ['rotulo="Ajustar ponto"', 'rotulo="Editar"', 'rotulo="Remover"', 'setEtapa({ modo: "novo" })']) assert.ok(ETAPA.includes(acao), acao);
    assert.ok(!ETAPA.includes("Jaaa Web"), "não manda mais a pessoa para a Web");
  });
});

describe("usuário sem endereço", () => {
  it("a lista vazia tem o próximo passo à mão: 'Cadastrar endereço' como ação principal", () => {
    assert.equal(rotuloDoNovoEndereco(0), "Cadastrar endereço");
    assert.ok(ETAPA.includes('aparencia={enderecos.length === 0 ? "principal" : "secundario"}'));
    assert.ok(ETAPA.includes("Cadastre um para continuar o pedido."));
  });
});

describe("formulário: os campos e a validação do CONTRATO (os mesmos da Web)", () => {
  it("tem apelido, CEP, logradouro, número, complemento, bairro, cidade, UF e ponto de referência", () => {
    for (const rotulo of ["Apelido (opcional)", "CEP", "Logradouro", "Número", "Complemento", "Bairro", "Cidade", "UF", "Ponto de referência"]) assert.ok(FORMULARIO.includes(`rotulo="${rotulo}"`), rotulo);
    assert.deepEqual(Object.keys(ENDERECO_VAZIO).sort(), ["apelido", "bairro", "cep", "cidade", "complemento", "logradouro", "numero", "pontoReferencia", "uf"]);
  });

  it("obrigatórios vazios: um erro por campo, e os opcionais não reclamam", () => {
    const resultado = validarEndereco(ENDERECO_VAZIO);
    assert.ok(!resultado.ok);
    assert.deepEqual(Object.keys(resultado.erros).sort(), ["bairro", "cep", "cidade", "logradouro", "numero"]);
  });

  it("CEP inválido e UF inexistente são recusados; endereço completo passa", () => {
    const cep = validarEndereco({ ...VALIDO, cep: "3012" });
    assert.ok(!cep.ok && cep.erros.cep);
    const uf = validarEndereco({ ...VALIDO, uf: "XX" as never });
    assert.ok(!uf.ok && uf.erros.uf);
    assert.deepEqual(validarEndereco(VALIDO), { ok: true });
    assert.deepEqual(validarEndereco({ ...VALIDO, apelido: "Trabalho", complemento: "Sala 2", pontoReferencia: "Portão azul" }), { ok: true });
  });

  it("máscara do CEP e UF em maiúsculas enquanto se digita", () => {
    assert.deepEqual(["3", "30123", "301230", "30123000", "30.123-000x9"].map(mascararCep), ["3", "30123", "30123-0", "30123-000", "30123-000"]);
    assert.deepEqual(["mg", "s p", "rj1", "minas"].map(normalizarUf), ["MG", "SP", "RJ", "MI"]);
  });

  it("editar abre com os dados salvos (CEP formatado) e avisa quando a mudança derruba o ponto confirmado", () => {
    assert.deepEqual(dadosDoEndereco(salvo()), { apelido: "Casa", cep: "30123-000", logradouro: "Rua das Flores", numero: "150", complemento: "Apto 302", bairro: "Centro", cidade: "Belo Horizonte", uf: "MG", pontoReferencia: "" });
    assert.ok(FORMULARIO.includes("alteracaoInvalidaLocalizacao(endereco") && FORMULARIO.includes("confirmar de novo no mapa"));
  });

  it("erros aparecem junto do campo e somem quando a pessoa volta a mexer nele", () => {
    assert.ok(FORMULARIO.includes("erro={erros.cep}") && FORMULARIO.includes("erro={erros.logradouro}") && FORMULARIO.includes("erro={erros.numero}"));
    assert.ok(FORMULARIO.includes("setErros((atuais) => (atuais[campo] ? { ...atuais, [campo]: undefined } : atuais))"));
  });

  it("teclado adequado: numérico no CEP, maiúsculas na UF, 'próximo' entre os campos", () => {
    assert.ok(FORMULARIO.includes('keyboardType="number-pad"') && FORMULARIO.includes('autoComplete="postal-code"') && FORMULARIO.includes('autoCapitalize="characters"'));
    assert.ok(FORMULARIO.includes('returnKeyType="next"') && FORMULARIO.includes('returnKeyType="done"'));
  });
});

describe("CEP: preenche o texto pelo servidor, sem confirmar ponto", () => {
  const doCep: EnderecoDoCep = { cep: "30123000", logradouro: "Rua das Flores", bairro: "Centro", cidade: "Belo Horizonte", uf: "MG", codigoIbge: null } as EnderecoDoCep;
  const montar = (resposta: Awaited<ReturnType<RequisitarCep>>) => {
    const situacoes: SituacaoCep[] = [];
    const preenchidos: EnderecoDoCep[] = [];
    let chamadas = 0;
    const consultar = criarConsultorCep({ requisitar: async () => ((chamadas += 1), resposta), aoPreencher: (endereco) => preenchidos.push(endereco), aoMudarSituacao: (situacao) => situacoes.push(situacao) });
    return { consultar, situacoes, preenchidos, chamadas: () => chamadas };
  };

  it("só consulta com 8 dígitos, preenche e não repete a consulta do mesmo CEP", async () => {
    const t = montar({ ok: true, dados: doCep });
    await t.consultar("3012");
    assert.equal(t.chamadas(), 0);
    await t.consultar("30123-000");
    await t.consultar("30123000");
    assert.equal(t.chamadas(), 1);
    assert.deepEqual(t.situacoes, ["ocioso", "consultando", "preenchido"]);
    assert.equal(t.preenchidos[0]?.logradouro, "Rua das Flores");
  });

  it("CEP não encontrado e provedor fora do ar: mensagens próprias, e a falha não 'gasta' o CEP", async () => {
    const inexistente = montar({ ok: false, codigo: "CEP_NAO_ENCONTRADO" });
    await inexistente.consultar("99999-999");
    assert.equal(inexistente.situacoes.at(-1), "nao-encontrado");
    assert.match(MENSAGEM_CEP["nao-encontrado"] ?? "", /preencha o endereço manualmente/);

    const fora = montar({ ok: false, codigo: null });
    await fora.consultar("30123-000");
    await fora.consultar("30123-000");
    assert.equal(fora.situacoes.at(-1), "indisponivel");
    assert.equal(fora.chamadas(), 2, "sem conexão: tenta de novo na próxima vez");
  });
});

describe("mapa de ajuste do ponto (matemática dos blocos)", () => {
  it("coordenada → posição no mundo → coordenada volta ao mesmo lugar", () => {
    for (const zoom of [12, 17, 19]) {
      const volta = mundoParaCoordenadas(coordenadasParaMundo(CENTRO_PADRAO, zoom), zoom);
      assert.ok(Math.abs(volta.latitude - CENTRO_PADRAO.latitude) < 1e-9 && Math.abs(volta.longitude - CENTRO_PADRAO.longitude) < 1e-9, `zoom ${zoom}`);
    }
    assert.deepEqual(coordenadasParaMundo({ latitude: 0, longitude: 0 }, 0), { x: 128, y: 128 });
  });

  it("arrastar o mapa para a direita/baixo leva o centro para oeste/norte; arrastar de volta desfaz", () => {
    const movido = centroAposArrastar(CENTRO_PADRAO, 17, 120, 80);
    assert.ok(movido.longitude < CENTRO_PADRAO.longitude && movido.latitude > CENTRO_PADRAO.latitude);
    const devolvido = centroAposArrastar(movido, 17, -120, -80);
    assert.ok(distanciaAproximadaKm(devolvido, CENTRO_PADRAO) < 0.001, "volta ao mesmo ponto (menos de 1 m)");
    assert.deepEqual(centroAposArrastar(CENTRO_PADRAO, 17, 0, 0), arredondarCoordenadas(CENTRO_PADRAO));
  });

  it("no zoom 17, 100 px de arraste são poucas dezenas de metros: dá para acertar a porta", () => {
    const metros = distanciaAproximadaKm(CENTRO_PADRAO, centroAposArrastar(CENTRO_PADRAO, 17, 100, 0)) * 1000;
    assert.ok(metros > 80 && metros < 130, String(metros));
  });

  it("os blocos cobrem a área inteira, sem buraco, e o do centro contém o ponto", () => {
    for (const [largura, altura] of [[288, 280], [328, 280], [358, 280], [398, 280]] as const) {
      const blocos = blocosVisiveis(CENTRO_PADRAO, 17, largura, altura, "https://mapa.exemplo/{z}/{x}/{y}.png");
      assert.ok(Math.min(...blocos.map((b) => b.esquerda)) <= 0 && Math.max(...blocos.map((b) => b.esquerda)) + TAMANHO_DO_BLOCO >= largura, `largura ${largura}`);
      assert.ok(Math.min(...blocos.map((b) => b.topo)) <= 0 && Math.max(...blocos.map((b) => b.topo)) + TAMANHO_DO_BLOCO >= altura);
      assert.ok(blocos.some((b) => b.esquerda <= largura / 2 && b.esquerda + TAMANHO_DO_BLOCO > largura / 2 && b.topo <= altura / 2 && b.topo + TAMANHO_DO_BLOCO > altura / 2));
      assert.equal(new Set(blocos.map((b) => b.chave)).size, blocos.length);
      assert.ok(blocos.every((b) => /^https:\/\/mapa\.exemplo\/17\/\d+\/\d+\.png$/.test(b.url)));
    }
    assert.deepEqual(blocosVisiveis(CENTRO_PADRAO, 17, 0, 280), [], "antes de medir a tela não pede bloco nenhum");
  });

  it("zoom limitado; aproximar e afastar não mudam o ponto", () => {
    assert.deepEqual([5, 12, 17, 19, 25].map(limitarZoom), [12, 12, 17, 19, 19]);
    const codigo = semComentarios(fonte("../components/mapa-ponto.tsx"));
    assert.ok(codigo.includes("setZoom((valor) => limitarZoom(valor + 1))") && !/setZoom[^\n]*aoMover/.test(codigo));
  });

  it("coordenadas com 6 casas (≈ 0,11 m), como o banco guarda", () => {
    assert.deepEqual(arredondarCoordenadas({ latitude: -19.91912549, longitude: -43.93860251 }), { latitude: -19.919125, longitude: -43.938603 });
  });
});

describe("confirmar o ponto: mesmas regras da Web", () => {
  it("só salva com ponto marcado E área atendida, conferida pelo servidor a cada mudança", () => {
    assert.ok(MAPA.includes('disabled={!ponto || cobertura !== "atendida"}') && MAPA.includes("validarCoberturaEntrega(empresaIdentidadeId, ponto)"));
    assert.ok(MAPA.includes("Esta empresa ainda não realiza entregas neste endereço."));
  });

  it("sem palpite de geocodificação não existe ponto até a pessoa mover o mapa", () => {
    assert.ok(MAPA.includes("useState<Coordenadas | null>(sugestao)") && MAPA.includes("Arraste o mapa para marcar o local exato da entrega e liberar a confirmação."));
  });

  it("a localização do aparelho é pedida só ao toque, explicada, e nunca enviada ao servidor", () => {
    assert.ok(MAPA.includes("requestForegroundPermissionsAsync") && MAPA.includes("Sua localização não é guardada"));
    assert.ok(!/useEffect\([^)]*getCurrentPositionAsync/.test(MAPA), "nada de localização ao abrir a tela");
  });

  it("o mapa não corrige o texto do endereço: nenhuma chamada altera os dados digitados", () => {
    assert.ok(!MAPA.includes("setDados") && !MAPA.includes("reverse") && MAPA.includes("O endereço digitado não muda"));
  });
});

describe("salvar, selecionar e continuar o pedido", () => {
  it("o endereço é gravado pela MESMA rota da Web, com texto e ponto juntos, só ao confirmar no mapa", () => {
    assert.ok(ETAPA.includes("criarEnderecoParaEmpresa(empresaIdentidadeId, etapa.dados, coordenadas)") && ETAPA.includes("atualizarEnderecoParaEmpresa(etapa.enderecoOriginal.id, empresaIdentidadeId, etapa.dados, coordenadas)"));
    const salvarDoFormulario = ETAPA.slice(ETAPA.indexOf("const salvar ="), ETAPA.indexOf("const confirmarPonto ="));
    assert.ok(!salvarDoFormulario.includes("criarEndereco") && salvarDoFormulario.includes('setEtapa({ modo: "mapa"'), "o formulário só abre o mapa");
  });

  it("depois de salvar: a lista é relida e o endereço que o SERVIDOR devolveu entra selecionado no pedido", () => {
    const confirmar = ETAPA.slice(ETAPA.indexOf("const confirmarPonto ="), ETAPA.indexOf("function remover"));
    assert.ok(confirmar.indexOf("await recarregar();") < confirmar.indexOf("aoSelecionar(resultado.dados);") && confirmar.indexOf("await recarregar();") > 0);
    // Na conversa, selecionar grava o endereço do pedido, pergunta a taxa e volta ao carrinho.
    assert.ok(/aoSelecionar=\{\(endereco\) => \{\s*setEnderecoEntrega\(endereco\);\s*void consultarFreteEntrega\(endereco\);\s*setEscolhendoEndereco\(false\);/.test(CONVERSA));
    assert.ok(CONVERSA.includes("enderecoId: enderecoEntrega.id"), "o pedido leva só o id do endereço salvo");
  });

  it("erro de API não perde o formulário nem o mapa: mostra a mensagem e continua na mesma etapa", () => {
    const confirmar = ETAPA.slice(ETAPA.indexOf("const confirmarPonto ="), ETAPA.indexOf("function remover"));
    const falha = confirmar.slice(confirmar.indexOf("if (!resultado.ok) {"), confirmar.indexOf("await recarregar();"));
    assert.ok(falha.includes("setErro(resultado.mensagem);") && falha.includes("return;") && !falha.includes("setEtapa"));
    assert.ok(MAPA.includes('{erro && <Aviso tom="erro">{erro}</Aviso>}'));
  });

  it("evita envio duplicado: uma operação por vez, e os botões ficam em 'carregando'", () => {
    assert.ok(ETAPA.includes("if (ocupado.current) return;") && ETAPA.includes("ocupado.current = true;") && ETAPA.includes("ocupado.current = false;"));
    assert.ok(FORMULARIO.includes("carregando={enviando}") && FORMULARIO.includes("if (enviando) return;") && MAPA.includes("carregando={enviando}"));
  });

  it("o carrinho não é tocado: a etapa não conhece carrinho, e ele continua montado por baixo", () => {
    for (const codigo of [ETAPA, FORMULARIO, MAPA]) assert.ok(!/carrinho|limpar\(/i.test(codigo.replace(/Voltar ao carrinho|"carrinho"/g, "")));
    assert.ok(CONVERSA.includes("escolhendoEndereco ? estilos.oculto : estilos.flex"));
  });
});

describe("voltar e cancelar", () => {
  it("do formulário e do mapa volta-se para a lista; da lista, para o carrinho", () => {
    const etapas: EtapaDoEndereco[] = [{ modo: "lista" }, { modo: "novo" }, { modo: "editar", endereco: salvo() }, { modo: "mapa", dados: VALIDO, enderecoOriginal: null, sugestao: null }];
    assert.deepEqual(etapas.map(destinoDoVoltar), ["carrinho", "lista", "lista", "lista"]);
    assert.ok(ETAPA.includes("aoCancelar={voltar}") && ETAPA.includes("if (enviando) return;"));
  });

  it("o botão físico Voltar do Android fecha só a etapa de endereço, sem sair do pedido", () => {
    assert.ok(CONVERSA.includes("if (escolhendoEndereco) setEscolhendoEndereco(false);"));
  });
});

describe("teclado e tela pequena (estrutura)", () => {
  it("a etapa rola com o teclado aberto e o toque no botão vale na primeira vez", () => {
    assert.ok(/<ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets[^>]*>\s*<EtapaEnderecoEntrega/.test(CONVERSA));
    assert.ok(CONVERSA.includes('<KeyboardAvoidingView behavior="padding"'));
  });

  it("campos em coluna única, com pares curtos lado a lado; ações em largura total e alvos de pelo menos 40–44 px", () => {
    assert.ok(FORMULARIO.includes('uf: { width: 72 }') && FORMULARIO.includes("larguraTotal"));
    assert.ok(ETAPA.includes("minHeight: 40") && ETAPA.includes('flexWrap: "wrap"'));
    assert.ok(fonte("../components/mapa-ponto.tsx").includes("height: 44") && fonte("../../../components/ui/campo-texto.tsx").includes("minHeight: ALTURA_TOQUE"));
  });

  it("o mapa segura o gesto: a lista em volta não rola enquanto o ponto é ajustado", () => {
    const codigo = semComentarios(fonte("../components/mapa-ponto.tsx"));
    assert.ok(codigo.includes("onMoveShouldSetPanResponderCapture: () => true") && codigo.includes("onPanResponderTerminationRequest: () => false"));
  });
});

describe("blocos do mapa no Android", () => {
  it("os cabeçalhos do pedido são só ASCII: com acento o Android (OkHttp) recusa e nenhum bloco aparece", () => {
    for (const [nome, valor] of Object.entries(CABECALHOS_DOS_BLOCOS)) {
      assert.match(nome, /^[\x21-\x7e]+$/);
      assert.match(valor, /^[\x20-\x7e]+$/, `"${valor}" tem caractere fora do ASCII`);
    }
  });

  it("o mapa usa esses cabeçalhos e os blocos são https", () => {
    const tela = readFileSync(new URL("../components/mapa-ponto.tsx", import.meta.url), "utf8");
    assert.ok(tela.includes("headers: CABECALHOS_DOS_BLOCOS") && !/"User-Agent"/.test(tela));
    assert.ok(blocosVisiveis(CENTRO_PADRAO, 17, 360, 280).every((bloco) => /^https:\/\/tile\.openstreetmap\.org\/17\/\d+\/\d+\.png$/.test(bloco.url)));
  });
});
