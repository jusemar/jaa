import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { IDENTIDADE_SONORA, criarMemoriaDeEventos, type NomeDoSom } from "./identidade-sonora.ts";

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const arquivoDoSom = (nome: string) => new URL(`../../../assets/sons/${nome}`, import.meta.url);

function lerWav(nome: string) {
  const bytes = readFileSync(arquivoDoSom(nome));
  const taxa = bytes.readUInt32LE(24);
  let quadros = 0;
  for (let i = 44; i + 1 < bytes.length; i += 2) quadros += 1;
  return { riff: bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE", segundos: quadros / taxa };
}

describe("identidade sonora do Jaaa: os sete sons e o que cada um significa", () => {
  it("mapeamento exato dos sete arquivos fornecidos", () => {
    const esperado: Record<NomeDoSom, string> = {
      mensagemRecebida: "01_jaaa_mensagem.wav",
      novoPedido: "02_jaaa_novo_pedido.wav",
      novaRota: "03_jaaa_nova_rota_entregador.wav",
      sucesso: "04_jaaa_sucesso_confirmacao.wav",
      atencao: "05_jaaa_alerta_atencao.wav",
      chamada: "06_jaaa_chamada.wav",
      mensagemEnviada: "07_jaaa_mensagem_enviada.wav",
    };
    assert.deepEqual(Object.fromEntries(Object.entries(IDENTIDADE_SONORA).map(([nome, som]) => [nome, som.arquivo])), esperado);
  });

  it("os sete arquivos existem, são WAV válidos e estão referenciados no player (entram no bundle)", () => {
    const player = ler("./tocar-som.ts");
    for (const som of Object.values(IDENTIDADE_SONORA)) {
      assert.ok(existsSync(arquivoDoSom(som.arquivo)), som.arquivo);
      assert.ok(lerWav(som.arquivo).riff, som.arquivo);
      assert.ok(player.includes(`require("../../../assets/sons/${som.arquivo}")`), som.arquivo);
    }
    // Os sons antigos não são mais referenciados por nenhum código.
    assert.ok(!/mensagem-recebida\.wav|nova-rota\.wav/.test(player + ler("../../features/conversas/lib/som-nativo.ts") + ler("../../features/entregas/lib/som-nova-rota.ts")));
  });

  it("ativos e reservados: chamada e atenção só ficam preparados; volume é o do PLAYER (0 a 1)", () => {
    const ativos = Object.entries(IDENTIDADE_SONORA).filter(([, som]) => som.ativo).map(([nome]) => nome);
    assert.deepEqual(ativos.sort(), ["mensagemEnviada", "mensagemRecebida", "novaRota", "novoPedido", "sucesso"]);
    assert.ok(!IDENTIDADE_SONORA.chamada.ativo && !IDENTIDADE_SONORA.atencao.ativo);
    for (const som of Object.values(IDENTIDADE_SONORA)) assert.ok(som.volume > 0 && som.volume <= 1);
    // Prioridade: rota e pedido no máximo; mensagem enviada é a mais discreta.
    assert.ok(IDENTIDADE_SONORA.novaRota.volume === 1 && IDENTIDADE_SONORA.novoPedido.volume === 1);
    assert.ok(IDENTIDADE_SONORA.mensagemEnviada.volume < IDENTIDADE_SONORA.mensagemRecebida.volume);
    const player = ler("./tocar-som.ts");
    assert.ok(player.includes("if (!IDENTIDADE_SONORA[nome].ativo || gravacaoEmCurso()) return;"), "reservado não toca; microfone aberto silencia");
    assert.ok(!/loop|setStreamVolume|VolumeManager|SystemVolume/.test(player), "sem laço e sem mexer no volume do aparelho");
  });

  it("a nova rota é o alerta mais longo entre os sons ativos; a mensagem enviada, o mais curto", () => {
    const duracao = (nome: NomeDoSom) => lerWav(IDENTIDADE_SONORA[nome].arquivo).segundos;
    const ativos = (Object.keys(IDENTIDADE_SONORA) as NomeDoSom[]).filter((nome) => IDENTIDADE_SONORA[nome].ativo);
    assert.equal(ativos.reduce((a, b) => (duracao(a) >= duracao(b) ? a : b)), "novaRota");
    assert.equal(ativos.reduce((a, b) => (duracao(a) <= duracao(b) ? a : b)), "mensagemEnviada");
    assert.ok(duracao("novaRota") > 2);
  });
});

describe("deduplicação: um acontecimento, um som", () => {
  it("a memória registra cada identificador uma única vez e tem tamanho limitado", () => {
    const memoria = criarMemoriaDeEventos(3);
    assert.deepEqual([memoria.registrar("a"), memoria.registrar("a"), memoria.registrar("b")], [true, false, true]);
    memoria.registrar("c");
    memoria.registrar("d");
    assert.ok(!memoria.conhece("a") && memoria.conhece("d"));
  });

  it("novo pedido da empresa: um som por PEDIDO, pelo evento próprio — nunca pelo som de mensagem", () => {
    // `avisarUmaVez("novoPedido", id)` usa esta memória: evento repetido ou reconexão não repetem.
    const memoria = criarMemoriaDeEventos();
    assert.deepEqual([memoria.registrar("pedido-novo:p1"), memoria.registrar("pedido-novo:p1"), memoria.registrar("pedido-novo:p2")], [true, false, true]);
    const sonsDeMensagem = ler("../../features/conversas/hooks/use-som-mensagens.ts");
    // Pedido não é mensagem para a empresa: o gatilho é `pedido:novo`, não o card na conversa.
    assert.ok(sonsDeMensagem.includes("socket.on(EVENTO_PEDIDO_NOVO, aoChegarPedido)"));
    assert.equal(sonsDeMensagem.includes("EVENTO_MENSAGEM_NOVA"), false);
  });

  it("gatilhos por EVENTO, nunca por clique: onde cada som é ligado", () => {
    const sonsDeMensagem = ler("../../features/conversas/hooks/use-som-mensagens.ts");
    assert.ok(sonsDeMensagem.includes("if (!agindoComoEmpresa) return;"));
    assert.ok(sonsDeMensagem.includes('avisarUmaVez("novoPedido", `pedido-novo:${lido.data.pedidoId}`)'));
    assert.ok(ler("../../app/(abas)/_layout.tsx").includes("useSomMensagens(ativa?.identidadeId ?? null, ehEmpresa)"));
    assert.ok(ler("../../features/conversas/lib/som-nativo.ts").includes('tocarSom("mensagemRecebida")'));
    const conversa = ler("../../features/conversas/components/tela-conversa.tsx");
    assert.equal((conversa.match(/avisarEnvio\(resultado\.dados\.id\)/g) ?? []).length, 3, "texto, imagem e áudio — só depois do aceite do servidor");
    assert.ok(conversa.includes('if (aparelhoLivreParaSom()) avisarUmaVez("mensagemEnviada", mensagemId);'));
    assert.ok(conversa.includes('avisarUmaVez("sucesso", `pedido:${resultado.dados.id}`)'));
    assert.ok(ler("../../features/entregas/components/tela-entrega.tsx").includes('avisarUmaVez("sucesso", `entrega:${parada.pedidoId}`)'));
    // Reservados não têm gatilho em lugar nenhum.
    for (const arquivo of ["../../features/conversas/components/tela-conversa.tsx", "../../features/entregas/components/tela-entrega.tsx", "../../features/conversas/hooks/use-som-mensagens.ts"]) assert.ok(!/(tocarSom|avisarUmaVez)\("(atencao|chamada)"/.test(ler(arquivo)));
  });
});
