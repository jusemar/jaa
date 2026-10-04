/// <reference types="node" />
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CABECALHO_IDENTIDADE_ATUANTE, CAMPO_ARQUIVO_IMAGEM, MENSAGEM_TIPO_INVALIDO, ORDEM_CAMPOS_ENVIO_IMAGEM, PREVIA_IMAGEM, mensagemSchema, type Mensagem } from "@jaa/contratos";
import { enviarMultipart, type DependenciasEnvio, type FormularioArquivo } from "../../../lib/envio-arquivo.ts";
import { acoesDisponiveisDaMensagem, conteudoParaPrevia } from "./acoes-mensagem.ts";
import {
  ALTURA_MAXIMA_IMAGEM,
  LARGURA_MAXIMA_IMAGEM,
  MENSAGEM_PERMISSAO_CAMERA_CONVERSA,
  OPCOES_ANEXO,
  anexarImagem,
  arquivoDaImagem,
  camposDoEnvioDeImagem,
  destinoDaTentativa,
  espacoDaImagem,
  idsDeImagensVisiveis,
  mensagemDeFalhaImagem,
  reducaoDaImagem,
  tentativaJaChegou,
  type ImagemPreparada,
  type ObtencaoImagem,
  type TentativaImagem,
} from "./imagem-conversa.ts";
import { ocultarMensagem, receberAtualizacao, receberMensagens, conversaVazia } from "./estados-mensagens.ts";

const EU = "eeeeeeee-0000-4000-8000-000000000000";
const OUTRA = "ffffffff-0000-4000-8000-000000000000";
const CONVERSA = "aaaaaaaa-0000-4000-8000-000000000000";
const id = (n: number) => `01a0a394-${String(n).padStart(4, "0")}-7000-8000-000000000000`;
const ID_CLIENTE = "11111111-1111-4111-8111-111111111111";
const fonte = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const PREPARADA: ImagemPreparada = { uri: "file:///cache/ImageManipulator/a.jpg", largura: 1600, altura: 1067, tamanhoBytes: null };

function imagem(n: number, extra: Partial<Mensagem> = {}): Mensagem {
  return {
    id: id(n),
    conversaId: CONVERSA,
    remetenteIdentidadeId: EU,
    tipo: "imagem",
    conteudo: "",
    criadoEm: "2026-10-04T16:17:00.000Z",
    estado: "enviada",
    mensagemRespondida: null,
    editadaEm: null,
    excluidaEm: null,
    pedido: null,
    anexo: { id: id(n + 500), tipo: "imagem", largura: 1600, altura: 1067 },
    ...extra,
  };
}

describe("anexo: Galeria ou Câmera", () => {
  const preparar = async (escolhida: { uri: string; largura: number; altura: number }): Promise<ImagemPreparada> => ({ uri: `${escolhida.uri}.jpg`, largura: 1600, altura: 1200, tamanhoBytes: null });
  const obterCom = (resultado: ObtencaoImagem, pedidas: string[] = []) => async (origem: "galeria" | "camera") => {
    pedidas.push(origem);
    return resultado;
  };

  it("o menu oferece Galeria e Câmera, com ícone", () => {
    assert.deepEqual(OPCOES_ANEXO.map((opcao) => [opcao.origem, opcao.rotulo, opcao.icone]), [["galeria", "Galeria", "imagem"], ["camera", "Câmera", "camera"]]);
    const tela = fonte("../components/tela-conversa.tsx");
    assert.ok(tela.includes('accessibilityLabel="Anexar foto"') && tela.includes("onPress={() => setMenuAnexoAberto(true)}"), "tocar no clipe abre o menu");
    assert.ok(tela.includes("OPCOES_ANEXO.map(") && !tela.includes("em breve"));
  });

  it("galeria e câmera devolvem a imagem PREPARADA para a prévia", async () => {
    for (const origem of ["galeria", "camera"] as const) {
      const pedidas: string[] = [];
      const resultado = await anexarImagem(origem, { obter: obterCom({ tipo: "imagem", imagem: { uri: "content://foto", largura: 4000, altura: 3000 } }, pedidas), preparar });
      assert.deepEqual(pedidas, [origem]);
      assert.deepEqual(resultado, { tipo: "imagem", imagem: { uri: "content://foto.jpg", largura: 1600, altura: 1200, tamanhoBytes: null } });
    }
  });

  it("cancelar (galeria ou câmera) não é erro e não prepara nada", async () => {
    let preparou = false;
    const resultado = await anexarImagem("camera", { obter: obterCom({ tipo: "cancelado" }), preparar: async (i) => ((preparou = true), preparar(i)) });
    assert.deepEqual(resultado, { tipo: "cancelado" });
    assert.equal(preparou, false);
  });

  it("permissão da câmera negada: mensagem clara, sem travar", async () => {
    assert.deepEqual(await anexarImagem("camera", { obter: obterCom({ tipo: "permissao-negada" }), preparar }), { tipo: "falha", mensagem: MENSAGEM_PERMISSAO_CAMERA_CONVERSA });
  });

  it("imagem que o aparelho não consegue ler ou formato inválido: mensagem do contrato", async () => {
    const falhou = await anexarImagem("galeria", { obter: obterCom({ tipo: "imagem", imagem: { uri: "x", largura: 1, altura: 1 } }), preparar: async () => Promise.reject(new Error("decode")) });
    assert.deepEqual(falhou, { tipo: "falha", mensagem: MENSAGEM_TIPO_INVALIDO });
    assert.deepEqual(await anexarImagem("galeria", { obter: obterCom({ tipo: "formato-invalido" }), preparar }), { tipo: "falha", mensagem: MENSAGEM_TIPO_INVALIDO });
  });

  it("normalização: só reduz (até 1600 px), sempre JPEG; permissão da câmera só ao escolher Câmera", () => {
    assert.equal(reducaoDaImagem(1600, 1200), null);
    assert.deepEqual(reducaoDaImagem(4000, 3000), { width: 1600 });
    assert.deepEqual(reducaoDaImagem(3000, 4000), { height: 1600 });
    assert.deepEqual(arquivoDaImagem(PREPARADA), { uri: PREPARADA.uri, nome: "foto.jpg", tipo: "image/jpeg" });
    const seletor = fonte("./seletor-imagem.ts");
    assert.ok(seletor.includes("SaveFormat.JPEG") && seletor.includes("allowsMultipleSelection: false") && seletor.includes("allowsEditing: false"));
    assert.ok(seletor.indexOf('origem === "camera"') < seletor.indexOf("requestCameraPermissionsAsync"));
    assert.ok(!seletor.includes("requestMediaLibraryPermissionsAsync"), "a galeria usa o seletor do sistema, sem permissão de armazenamento");
  });
});

class FormularioFalso implements FormularioArquivo {
  campos: [string, unknown][] = [];
  append(campo: string, valor: unknown) {
    this.campos.push([campo, valor]);
  }
}

function servidor(respostas: { status: number; corpo: unknown }[] | "sem-rede") {
  const chamadas: { url: string; init: RequestInit }[] = [];
  const deps: DependenciasEnvio = {
    urlApi: "http://10.0.2.2:3333",
    buscar: (async (url: string, init: RequestInit) => {
      chamadas.push({ url, init });
      if (respostas === "sem-rede") throw new TypeError("Network request failed");
      const resposta = respostas[Math.min(chamadas.length - 1, respostas.length - 1)]!;
      return new Response(JSON.stringify(resposta.corpo), { status: resposta.status });
    }) as typeof fetch,
    cabecalhos: async () => ({ Cookie: "jaa.session_token=sessao-de-teste", [CABECALHO_IDENTIDADE_ATUANTE]: "empresa-1" }),
    criarFormulario: () => new FormularioFalso(),
  };
  const enviar = (tentativa: TentativaImagem) =>
    enviarMultipart(deps, `/conversas/${CONVERSA}/mensagens/imagem`, mensagemSchema, { campos: camposDoEnvioDeImagem(tentativa), arquivo: arquivoDaImagem(tentativa.imagem), campoArquivo: CAMPO_ARQUIVO_IMAGEM });
  const partes = (indice: number) => (chamadas[indice]!.init.body as unknown as FormularioFalso).campos;
  return { chamadas, enviar, partes };
}

describe("envio da imagem (multipart)", () => {
  const tentativa: TentativaImagem = { idCliente: ID_CLIENTE, imagem: PREPARADA, legenda: "Pizza", mensagemRespondidaId: id(1) };

  it("campos na ordem do contrato e o arquivo POR ÚLTIMO; sem Content-Type manual; sessão e identidade", async () => {
    const { chamadas, enviar, partes } = servidor([{ status: 201, corpo: imagem(9, { conteudo: "Pizza" }) }]);
    const resposta = await enviar(tentativa);
    assert.equal(resposta.ok && resposta.status, 201);
    assert.deepEqual(partes(0), [["idCliente", ID_CLIENTE], ["legenda", "Pizza"], ["mensagemRespondidaId", id(1)], ["arquivo", { uri: PREPARADA.uri, name: "foto.jpg", type: "image/jpeg" }]]);
    assert.deepEqual(partes(0).map(([nome]) => nome), [...ORDEM_CAMPOS_ENVIO_IMAGEM]);
    const cabecalhos = chamadas[0]!.init.headers as Record<string, string>;
    assert.ok(!Object.keys(cabecalhos).some((nome) => nome.toLowerCase() === "content-type"), "o runtime escreve o boundary");
    assert.equal(cabecalhos.Cookie, "jaa.session_token=sessao-de-teste");
    assert.equal(cabecalhos[CABECALHO_IDENTIDADE_ATUANTE], "empresa-1");
    assert.ok(chamadas[0]!.url.endsWith(`/conversas/${CONVERSA}/mensagens/imagem`));
  });

  it("sem legenda e sem resposta: só idCliente e o arquivo", async () => {
    const { enviar, partes } = servidor([{ status: 201, corpo: imagem(9) }]);
    await enviar({ idCliente: ID_CLIENTE, imagem: PREPARADA, legenda: "" });
    assert.deepEqual(partes(0).map(([nome]) => nome), ["idCliente", "arquivo"]);
  });

  it("retry: a MESMA tentativa reenvia idCliente, legenda, resposta e arquivo; 200 idempotente é sucesso", async () => {
    const { enviar, partes } = servidor([{ status: 500, corpo: null }, { status: 200, corpo: imagem(9, { conteudo: "Pizza" }) }]);
    const primeira = await enviar(tentativa);
    assert.equal(primeira.ok, false);
    assert.equal(destinoDaTentativa(primeira as never), "manter");
    const retry = await enviar(tentativa);
    assert.deepEqual(partes(0), partes(1));
    assert.equal(retry.ok && retry.status, 200);
    assert.equal(retry.ok && retry.dados.id, id(9));
  });

  it("sem rede vira status 0 (tentativa mantida para reenviar)", async () => {
    const { enviar } = servidor("sem-rede");
    const resposta = await enviar(tentativa);
    assert.deepEqual([resposta.ok, resposta.status], [false, 0]);
    assert.ok(mensagemDeFalhaImagem(resposta as never).includes("Reenviar"));
  });

  it("destino da tentativa: rede/5xx/429 mantêm; recusa definitiva descarta; resposta inválida volta ao compositor", () => {
    for (const status of [0, 500, 503, 429]) assert.equal(destinoDaTentativa({ status, codigo: null, mensagem: "" }), "manter");
    assert.equal(destinoDaTentativa({ status: 400, codigo: "ARQUIVO_INVALIDO", mensagem: "" }), "descartar");
    assert.equal(destinoDaTentativa({ status: 403, codigo: "COMUNICACAO_BLOQUEADA", mensagem: "" }), "descartar");
    assert.equal(destinoDaTentativa({ status: 404, codigo: "MENSAGEM_RESPONDIDA_NAO_ENCONTRADA", mensagem: "" }), "sem-resposta");
  });

  it("a tela gera o idCliente UMA vez por foto e o Reenviar repassa a mesma tentativa", () => {
    const tela = fonte("../components/tela-conversa.tsx");
    const envio = tela.slice(tela.indexOf("if (imagemSelecionada && !editando) {"), tela.indexOf("if (!conteudo || ocupado || bloqueada) return;"));
    assert.equal(envio.match(/gerarIdCliente\(\)/g)?.length, 1);
    assert.ok(tela.includes("aoReenviar={() => void enviarImagem(imagemPendente.tentativa, imagemPendente.idsAntesDoEnvio)}"));
    assert.ok(!envio.includes("enviarMensagem("), "uma mensagem de imagem, nunca texto + imagem");
  });
});

describe("tempo real e balão pendente", () => {
  const tentativa = { legenda: "Pizza", mensagemRespondidaId: undefined };

  it("mensagem:nova da própria foto antes da resposta HTTP: o balão pendente some (sem duas fotos)", () => {
    const antes = new Set([id(1)]);
    assert.equal(tentativaJaChegou(tentativa, [imagem(1, { conteudo: "Pizza" })], antes, EU), false, "foto antiga igual não conta");
    assert.equal(tentativaJaChegou(tentativa, [imagem(1), imagem(2, { conteudo: "Pizza" })], antes, EU), true);
    assert.equal(tentativaJaChegou(tentativa, [imagem(2, { conteudo: "Pizza", remetenteIdentidadeId: OUTRA })], antes, EU), false, "foto de outra pessoa não conta");
    assert.equal(tentativaJaChegou(tentativa, [imagem(2, { conteudo: "Outra legenda" })], antes, EU), false);
  });

  it("evento e resposta HTTP com a mesma mensagem não duplicam na conversa", () => {
    const mensagem = imagem(2, { conteudo: "Pizza" });
    const estado = receberMensagens(receberMensagens(conversaVazia, [mensagem]), [mensagem]);
    assert.equal(estado.mensagens.length, 1);
  });

  it("URL só é pedida para imagem visível: excluída para mim some, tombstone (anexo null) também", () => {
    let estado = receberMensagens(conversaVazia, [imagem(1), imagem(2), imagem(3, { tipo: "texto", conteudo: "oi", anexo: null })]);
    assert.deepEqual(idsDeImagensVisiveis(estado.mensagens), [id(1), id(2)]);
    estado = ocultarMensagem(estado, id(1));
    assert.deepEqual(idsDeImagensVisiveis(estado.mensagens), [id(2)]);
    estado = receberAtualizacao(estado, imagem(2, { anexo: null, excluidaEm: "2026-10-04T16:20:00.000Z" }));
    assert.deepEqual(idsDeImagensVisiveis(estado.mensagens), []);
  });

  it("o hook pede as URLs pelo lote e esquece as que saíram; nada novo no Socket.IO", () => {
    const hook = fonte("../hooks/use-urls-privadas.ts");
    assert.ok(hook.includes("cache.garantir(ids)") && hook.includes("cache.esquecer(id)"));
    const tela = fonte("../components/tela-conversa.tsx");
    assert.equal(tela.match(/socket\.on\(EVENTO_MENSAGEM_NOVA/g)?.length, 1);
    assert.ok(tela.includes("useUrlsImagens(conversa.id, mensagens)"));
  });
});

describe("balão da foto", () => {
  it("espaço reservado na proporção real, sem ampliar imagem pequena e sem passar da largura do balão", () => {
    assert.deepEqual(espacoDaImagem(1600, 1067), { largura: LARGURA_MAXIMA_IMAGEM, altura: 173 });
    assert.deepEqual(espacoDaImagem(120, 80), { largura: 120, altura: 80 });
    const retrato = espacoDaImagem(1067, 1600);
    assert.equal(retrato.altura, ALTURA_MAXIMA_IMAGEM);
    assert.ok(Math.abs(retrato.largura / retrato.altura - 1067 / 1600) < 0.01);
    assert.deepEqual(espacoDaImagem(1600, 1067, 200), { largura: 200, altura: 133 });
    assert.deepEqual(espacoDaImagem(0, 0, 200), { largura: 200, altura: 200 });
  });

  const balao = fonte("../components/balao-mensagem.tsx");
  const imagemNoBalao = fonte("../components/imagem-mensagem.tsx");

  it("imagem real no balão; legenda abaixo só quando existe; tombstone não mostra imagem", () => {
    assert.ok(balao.includes('const anexo = mensagem.tipo === "imagem" && !excluida && mensagem.anexo?.tipo === "imagem" ? mensagem.anexo : null;'));
    assert.ok(balao.indexOf("<ImagemMensagem") < balao.indexOf('{mensagem.conteudo !== "" && ('));
    assert.ok(balao.indexOf("Mensagem excluída") < balao.indexOf("<ImagemMensagem"), "excluída vem antes de qualquer imagem");
    assert.ok(!balao.includes("<Texto cor=\"conteudoSuave\">{PREVIA_IMAGEM}</Texto>"), "\"Foto\" não é mais conteúdo do balão");
  });

  it("carregando, indisponível e pronta; nada técnico na tela; imagem privada só em memória", () => {
    assert.ok(imagemNoBalao.includes('"Imagem indisponível"') && imagemNoBalao.includes('"Carregando imagem"'));
    assert.ok(imagemNoBalao.includes('cachePolicy="memory"') && imagemNoBalao.includes("onError={aoFalhar}") && imagemNoBalao.includes("onLoad={aoCarregar}"));
    assert.ok(imagemNoBalao.includes("onLongPress={aoPedirAcoes}"), "toque longo na foto abre o mesmo menu");
    for (const arquivo of ["../components/imagem-mensagem.tsx", "../components/visualizador-imagem.tsx", "../hooks/use-urls-imagens.ts", "../hooks/use-urls-privadas.ts", "./urls-imagens.ts"]) {
      const semComentarios = fonte(arquivo).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      assert.ok(!/AsyncStorage|SecureStore|FileSystem|cachePolicy="disk"|cachePolicy="memory-disk"/.test(semComentarios), arquivo);
    }
  });

  it("rodapé preservado: horário neutro e ✓✓ azul só quando lida", () => {
    assert.ok(balao.includes('cor={mensagem.estado === "lida" ? "leitura" : "conteudoSuave"}'));
  });
});

describe("visualização ampliada", () => {
  const visualizador = fonte("../components/visualizador-imagem.tsx");
  const tela = fonte("../components/tela-conversa.tsx");

  it("Modal com fundo escuro, imagem inteira (contain), X e o Voltar do Android fechando", () => {
    assert.ok(visualizador.includes("<Modal") && visualizador.includes("onRequestClose={aoFechar}"));
    assert.ok(visualizador.includes('contentFit="contain"') && visualizador.includes('accessibilityLabel="Fechar imagem"'));
    assert.ok(/backgroundColor: "rgba\(0,0,0,0\.9\d?\)"/.test(visualizador));
  });

  it("tocar na foto abre; fechar limpa o estado", () => {
    assert.ok(tela.includes("aoAbrirImagem={(aberta, url) => setImagemAberta({ url, descricao: aberta.conteudo || \"Foto\" })}"));
    assert.ok(tela.includes("aoFechar={() => setImagemAberta(null)}"));
  });
});

describe("menu, resposta e lista", () => {
  it("foto: Responder sim, Editar não, apagar conforme a autoria", () => {
    assert.deepEqual(acoesDisponiveisDaMensagem(imagem(1), EU), ["responder", "apagar-para-mim", "apagar-para-todos"]);
    assert.deepEqual(acoesDisponiveisDaMensagem(imagem(1, { remetenteIdentidadeId: OUTRA }), EU), ["responder", "apagar-para-mim"]);
  });

  it("responder a uma foto: legenda, ou \"Foto\" sem legenda; a resposta com foto leva mensagemRespondidaId", () => {
    assert.equal(conteudoParaPrevia(imagem(1)), PREVIA_IMAGEM);
    assert.equal(conteudoParaPrevia(imagem(1, { conteudo: "Pizza" })), "Pizza");
    assert.deepEqual(camposDoEnvioDeImagem({ idCliente: ID_CLIENTE, legenda: "", mensagemRespondidaId: id(1) }), [["idCliente", ID_CLIENTE], ["mensagemRespondidaId", id(1)]]);
  });

  it("lista de conversas: \"Foto\" do contrato, sem URL, arquivo ou legenda", () => {
    const lista = fonte("../components/lista-conversas.tsx");
    assert.ok(lista.includes('ultimaMensagem.tipo === "imagem"') && lista.includes("`${autor}${PREVIA_IMAGEM}`"));
  });

  it("prévia no compositor: miniatura, remover e o campo como legenda", () => {
    const tela = fonte("../components/tela-conversa.tsx");
    assert.ok(tela.includes("<PreviaImagemCompositor") && tela.includes('"Legenda (opcional)…"'));
    assert.ok(fonte("../components/previa-imagem-compositor.tsx").includes('accessibilityLabel="Remover foto"'));
  });
});
