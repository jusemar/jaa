import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MENSAGEM_ARQUIVO_GRANDE, MENSAGEM_TIPO_INVALIDO, ORDEM_CAMPOS_ENVIO_IMAGEM, PREVIA_IMAGEM, type Mensagem } from "@jaa/contratos";
import { conversaVazia, ocultarMensagem, receberAtualizacao, receberMensagens } from "./estados-mensagens.ts";
import {
  ALTURA_MAXIMA_IMAGEM,
  LARGURA_MAXIMA_IMAGEM,
  camposDoEnvioDeImagem,
  conteudoParaPrevia,
  destinoDaTentativa,
  espacoDaImagem,
  idsDeImagensVisiveis,
  mensagemDeFalhaImagem,
  tentativaJaChegou,
  validarArquivoImagem,
} from "./imagem-conversa.ts";

const EU = "eeeeeeee-0000-4000-8000-000000000000";
const OUTRA = "ffffffff-0000-4000-8000-000000000000";
const idMensagem = (n: number) => `01a0a394-${String(n).padStart(4, "0")}-7000-8000-000000000000`;

function mensagem(n: number, extra: Partial<Mensagem> = {}): Mensagem {
  return {
    id: idMensagem(n),
    conversaId: "aaaaaaaa-0000-4000-8000-000000000000",
    remetenteIdentidadeId: OUTRA,
    tipo: "texto",
    conteudo: `m${n}`,
    criadoEm: "2026-10-03T12:00:00.000Z",
    estado: "enviada",
    mensagemRespondida: null,
    editadaEm: null,
    excluidaEm: null,
    pedido: null,
    anexo: null,
    ...extra,
  };
}
const imagem = (n: number, extra: Partial<Mensagem> = {}) =>
  mensagem(n, { tipo: "imagem", conteudo: "", anexo: { id: idMensagem(n + 5000), tipo: "imagem", largura: 1600, altura: 1067 }, ...extra });

describe("conferência prévia do arquivo", () => {
  it("JPEG, PNG e WebP até 8 MB são aceitos", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) assert.equal(validarArquivoImagem({ type, size: 8 * 1024 * 1024 }), null);
  });

  it("outro tipo (GIF, HEIC, PDF, vazio) é recusado com a mensagem do contrato", () => {
    for (const type of ["image/gif", "image/heic", "application/pdf", ""]) assert.equal(validarArquivoImagem({ type, size: 1000 }), MENSAGEM_TIPO_INVALIDO);
  });

  it("acima de 8 MB é recusado; arquivo vazio também", () => {
    assert.equal(validarArquivoImagem({ type: "image/jpeg", size: 8 * 1024 * 1024 + 1 }), MENSAGEM_ARQUIVO_GRANDE);
    assert.equal(validarArquivoImagem({ type: "image/jpeg", size: 0 }), MENSAGEM_TIPO_INVALIDO);
  });
});

describe("campos do multipart", () => {
  const idCliente = "11111111-1111-4111-8111-111111111111";

  it("na ordem do contrato, só os campos que existem (o arquivo é acrescentado depois, por último)", () => {
    assert.deepEqual(camposDoEnvioDeImagem({ idCliente, legenda: "" }), [["idCliente", idCliente]]);
    assert.deepEqual(camposDoEnvioDeImagem({ idCliente, legenda: "Pizza" }), [["idCliente", idCliente], ["legenda", "Pizza"]]);
    const completos = camposDoEnvioDeImagem({ idCliente, legenda: "Pizza", mensagemRespondidaId: idMensagem(1) });
    assert.deepEqual(completos.map(([nome]) => nome), ORDEM_CAMPOS_ENVIO_IMAGEM.slice(0, 3));
    assert.deepEqual(camposDoEnvioDeImagem({ idCliente, legenda: "", mensagemRespondidaId: idMensagem(1) }).map(([nome]) => nome), ["idCliente", "mensagemRespondidaId"]);
  });
});

describe("falha do envio", () => {
  it("rede, 5xx e limite de envios mantêm a tentativa para reenviar com o MESMO idCliente", () => {
    for (const status of [0, 500, 503, 429]) assert.equal(destinoDaTentativa({ status, codigo: null, mensagem: "" }), "manter");
  });

  it("recusa definitiva descarta; resposta inexistente devolve a foto ao compositor", () => {
    assert.equal(destinoDaTentativa({ status: 400, codigo: "ARQUIVO_INVALIDO", mensagem: "" }), "descartar");
    assert.equal(destinoDaTentativa({ status: 403, codigo: "COMUNICACAO_BLOQUEADA", mensagem: "" }), "descartar");
    assert.equal(destinoDaTentativa({ status: 404, codigo: "MENSAGEM_RESPONDIDA_NAO_ENCONTRADA", mensagem: "" }), "sem-resposta");
  });

  it("mensagens claras: rede, sessão, tamanho e as que vêm da API (limite, bloqueio, armazenamento)", () => {
    assert.match(mensagemDeFalhaImagem({ status: 0, codigo: null, mensagem: "x" }), /Sem conexão/);
    assert.match(mensagemDeFalhaImagem({ status: 401, codigo: "NAO_AUTENTICADO", mensagem: "x" }), /sessão expirou/);
    assert.equal(mensagemDeFalhaImagem({ status: 413, codigo: "ARQUIVO_INVALIDO", mensagem: "x" }), MENSAGEM_ARQUIVO_GRANDE);
    for (const [status, codigo, texto] of [
      [429, "LIMITE_DE_ENVIOS_ATINGIDO", "Muitos envios de imagem seguidos. Tente de novo em 7 min."],
      [403, "COMUNICACAO_BLOQUEADA", "Mensagens bloqueadas entre vocês."],
      [503, "ARMAZENAMENTO_INDISPONIVEL", "O envio de imagens ainda não está configurado neste ambiente."],
    ] as const) {
      assert.equal(mensagemDeFalhaImagem({ status, codigo, mensagem: texto }), texto);
    }
    assert.match(mensagemDeFalhaImagem({ status: 500, codigo: null, mensagem: "x" }), /Reenviar/);
  });
});

describe("tentativa pendente × mensagem que chega em tempo real", () => {
  const antes = new Set([idMensagem(1), idMensagem(2)]);

  it("minha imagem nova, com a mesma legenda e referência, é a da tentativa: o balão pendente não duplica", () => {
    const chegou = imagem(3, { remetenteIdentidadeId: EU, conteudo: "Pizza" });
    assert.equal(tentativaJaChegou({ legenda: "Pizza" }, [mensagem(1), mensagem(2), chegou], antes, EU), true);
  });

  it("imagem antiga, de outra pessoa, com outra legenda ou outra referência não é a tentativa", () => {
    const tentativa = { legenda: "Pizza" };
    assert.equal(tentativaJaChegou(tentativa, [imagem(2, { remetenteIdentidadeId: EU, conteudo: "Pizza" })], antes, EU), false, "já existia");
    assert.equal(tentativaJaChegou(tentativa, [imagem(3, { conteudo: "Pizza" })], antes, EU), false, "de outra identidade");
    assert.equal(tentativaJaChegou(tentativa, [imagem(3, { remetenteIdentidadeId: EU, conteudo: "Outra" })], antes, EU), false);
    assert.equal(tentativaJaChegou({ legenda: "Pizza", mensagemRespondidaId: idMensagem(1) }, [imagem(3, { remetenteIdentidadeId: EU, conteudo: "Pizza" })], antes, EU), false);
    assert.equal(tentativaJaChegou(tentativa, [mensagem(3, { remetenteIdentidadeId: EU, conteudo: "Pizza" })], antes, EU), false, "texto não é imagem");
  });

  it("resposta do envio (201 ou 200 do retry) e evento com a MESMA mensagem não duplicam na conversa", () => {
    const oficial = imagem(3, { remetenteIdentidadeId: EU });
    let conversa = receberMensagens(conversaVazia, [mensagem(1)]);
    conversa = receberMensagens(conversa, [oficial]); // evento mensagem:nova
    conversa = receberMensagens(conversa, [oficial]); // resposta HTTP 201
    conversa = receberMensagens(conversa, [{ ...oficial, estado: "entregue" }]); // 200 do retry, estado mais novo
    assert.deepEqual(conversa.mensagens.map((item) => item.id), [idMensagem(1), idMensagem(3)]);
    assert.equal(conversa.mensagens[1]?.estado, "entregue");
  });
});

describe("quais imagens pedem URL", () => {
  it("só imagem visível com anexo; texto, pedido e tombstone ficam de fora", () => {
    const tombstone = imagem(4, { anexo: null, excluidaEm: "2026-10-03T12:05:00.000Z" });
    assert.deepEqual(idsDeImagensVisiveis([mensagem(1), imagem(2), imagem(3), tombstone]), [idMensagem(2), idMensagem(3)]);
  });

  it("excluir para mim tira a imagem da conversa; excluir para todos a transforma em tombstone sem anexo", () => {
    let conversa = receberMensagens(conversaVazia, [imagem(1), imagem(2)]);
    conversa = ocultarMensagem(conversa, idMensagem(1));
    assert.deepEqual(idsDeImagensVisiveis(conversa.mensagens), [idMensagem(2)]);
    conversa = receberAtualizacao(conversa, imagem(2, { anexo: null, excluidaEm: "2026-10-03T12:05:00.000Z" }));
    assert.deepEqual(idsDeImagensVisiveis(conversa.mensagens), []);
  });
});

describe("prévia e espaço no balão", () => {
  it("imagem sem legenda é citada como Foto; com legenda, a legenda; texto fica como está", () => {
    assert.equal(conteudoParaPrevia(imagem(1)), PREVIA_IMAGEM);
    assert.equal(conteudoParaPrevia(imagem(1, { conteudo: "Pizza" })), "Pizza");
    assert.equal(conteudoParaPrevia(mensagem(1)), "m1");
  });

  it("espaço reservado mantém a proporção, cabe nos limites e nunca amplia", () => {
    assert.deepEqual(espacoDaImagem(1600, 1067), { largura: 320, altura: 213 });
    const retrato = espacoDaImagem(1067, 1600);
    assert.equal(retrato.altura, ALTURA_MAXIMA_IMAGEM);
    assert.ok(Math.abs(retrato.largura / retrato.altura - 1067 / 1600) < 0.01);
    assert.deepEqual(espacoDaImagem(200, 100), { largura: 200, altura: 100 }, "imagem pequena não é ampliada");
    assert.deepEqual(espacoDaImagem(0, 0), { largura: LARGURA_MAXIMA_IMAGEM, altura: LARGURA_MAXIMA_IMAGEM });
  });
});
