import type { Banco } from "@jaa/banco";
import {
  enderecoTemLocalizacaoConfirmada,
  type FormaPagamentoEntrega,
} from "@jaa/contratos";
import { buscarEndereco } from "../../enderecos/repositorios/repositorio-enderecos.js";
import {
  buscarEmpresaPublicaPorIdentidade,
  type EmpresaPublicaRegistro,
} from "../../catalogo/repositorios/repositorio-empresas-publicas.js";
import { listarIdsParticipantesDaConversa } from "../../conversas/repositorios/repositorio-conversas.js";
import type { CanalEventosMensagens } from "../../mensagens/lib/eventos-mensagens.js";
import { buscarMensagemNaConversa } from "../../mensagens/repositorios/repositorio-mensagens.js";
import { listarProdutosDisponiveisPorIds } from "../../produtos/repositorios/repositorio-produtos.js";
import { listarGruposDisponiveisPorProdutos } from "../../produtos/repositorios/repositorio-personalizacao.js";
import { serializarGruposPublicos } from "../../produtos/lib/serializar-personalizacao.js";
import { calcularItens, resolverPagamento } from "../lib/calcular-pedido.js";
import { avaliarCoberturaDoPonto } from "../../entregas/casos-de-uso/gerir-zonas.js";
import {
  buscarPedido,
  buscarPedidoPorTentativa,
  ErroPedidoDuplicado,
  inserirPedidoComItens,
  type PedidoComItensRegistro,
} from "../repositorios/repositorio-pedidos.js";

type ResultadoCriarPedido =
  | {
      tipo: "criado" | "ja-existente";
      pedido: PedidoComItensRegistro;
      empresa: EmpresaPublicaRegistro;
    }
  | { tipo: "empresa-nao-encontrada" }
  | { tipo: "conversa-nao-encontrada" }
  | { tipo: "itens-invalidos" }
  | { tipo: "escolhas-invalidas"; mensagem: string }
  | { tipo: "endereco-nao-encontrado" }
  | { tipo: "localizacao-nao-confirmada" }
  | { tipo: "endereco-fora-area-entrega" }
  | { tipo: "pagamento-invalido" }
  | { tipo: "id-cliente-reutilizado" };

interface EntradaPedido {
  idCliente: string;
  empresaIdentidadeId: string;
  conversaId: string;
  enderecoId: string;
  itens: Array<{ produtoId: string; quantidade: number; opcaoIds?: readonly string[] | undefined; observacao?: string | null | undefined }>;
  pagamento: {
    forma: FormaPagamentoEntrega;
    trocoParaCentavos?: number | null | undefined;
  };
}

/**
 * Cria o PEDIDO JAA a partir do carrinho do cliente. O cliente manda produto e quantidade; TUDO o que
 * é dinheiro (preço unitário, subtotal, total) vem do banco aqui, nunca do navegador.
 * Sequência: empresa pública ativa → conversa com cliente E empresa → ENDEREÇO do próprio cliente com
 * ponto confirmado → produtos disponíveis DESTA empresa → cálculo → regra de pagamento na entrega →
 * transação (pedido + itens + destino, todos snapshot + histórico inicial + card) → evento.
 * Retry com o mesmo `idCliente` devolve o MESMO pedido; conteúdo diferente é conflito.
 */
export async function criarPedido(
  {
    banco,
    eventosMensagens,
  }: { banco: Banco; eventosMensagens: CanalEventosMensagens },
  clienteIdentidadeId: string,
  operadorUsuarioId: string,
  entrada: EntradaPedido,
): Promise<ResultadoCriarPedido> {
  const empresa = await buscarEmpresaPublicaPorIdentidade(
    banco,
    entrada.empresaIdentidadeId,
  );
  if (!empresa) return { tipo: "empresa-nao-encontrada" };

  // A conversa precisa ser destes dois: o cliente e a empresa do pedido (não uma conversa qualquer).
  const participantes = await listarIdsParticipantesDaConversa(
    banco,
    entrada.conversaId,
  );
  if (
    !participantes.includes(clienteIdentidadeId) ||
    !participantes.includes(empresa.identidadeId)
  ) {
    return { tipo: "conversa-nao-encontrada" };
  }

  /*
   * Destino: o cliente só informa QUAL endereço salvo escolheu. O servidor confere que é dele
   * (endereço alheio é indistinguível de inexistente), que o ponto foi confirmado no mapa e copia o
   * snapshot do banco — o navegador nunca envia endereço nem coordenadas.
   */
  const endereco = await buscarEndereco(
    banco,
    clienteIdentidadeId,
    entrada.enderecoId,
  );
  if (!endereco) return { tipo: "endereco-nao-encontrado" };
  if (
    !enderecoTemLocalizacaoConfirmada({
      latitude: endereco.latitude,
      longitude: endereco.longitude,
      localizacaoConfirmadaEm:
        endereco.localizacaoConfirmadaEm?.toISOString() ?? null,
    })
  ) {
    return { tipo: "localizacao-nao-confirmada" };
  }

  const cobertura = await avaliarCoberturaDoPonto(banco, empresa.empresaId, {
    latitude: endereco.latitude as number,
    longitude: endereco.longitude as number,
  });
  if (!cobertura.atendida) return { tipo: "endereco-fora-area-entrega" };

  const produtoIds = entrada.itens.map((item) => item.produtoId);
  const produtos = await listarProdutosDisponiveisPorIds(banco, empresa.empresaId, produtoIds);
  /*
   * Grupos lidos do BANCO (só opções disponíveis) e passados pela MESMA serialização da consulta de
   * cliente: a regra de mínimo/máximo e o acréscimo de cada opção valem exatamente como a pessoa viu.
   */
  const gruposPorProduto = new Map(
    [...(await listarGruposDisponiveisPorProdutos(banco, empresa.empresaId, produtoIds))].map(([produtoId, grupos]) => [
      produtoId,
      serializarGruposPublicos(grupos),
    ]),
  );

  const calculo = calcularItens(entrada.itens, produtos, gruposPorProduto);
  if (calculo.tipo === "escolhas-invalidas") return { tipo: "escolhas-invalidas", mensagem: mensagemEscolhasInvalidas(calculo) };
  if (calculo.tipo !== "itens") return { tipo: "itens-invalidos" };

  const pagamento = resolverPagamento(entrada.pagamento, calculo.totalCentavos);
  if (pagamento.tipo !== "pagamento") return { tipo: "pagamento-invalido" };

  try {
    const { pedidoId, mensagemId } = await inserirPedidoComItens(banco, {
      empresaId: empresa.empresaId,
      clienteIdentidadeId,
      conversaId: entrada.conversaId,
      formaPagamentoNaEntrega: entrada.pagamento.forma,
      trocoParaCentavos: pagamento.trocoParaCentavos,
      totalCentavos: calculo.totalCentavos,
      idCliente: entrada.idCliente,
      itens: calculo.itens,
      destino: {
        enderecoId: endereco.id,
        cep: endereco.cep,
        logradouro: endereco.logradouro,
        numero: endereco.numero,
        complemento: endereco.complemento,
        bairro: endereco.bairro,
        cidade: endereco.cidade,
        uf: endereco.uf,
        pontoReferencia: endereco.pontoReferencia,
        latitude: endereco.latitude as number,
        longitude: endereco.longitude as number,
        localizacaoConfirmadaEm: endereco.localizacaoConfirmadaEm as Date,
      },
      operadorUsuarioId,
    });

    const pedido = await buscarPedido(banco, pedidoId);
    if (!pedido) throw new Error("Pedido criado não encontrado.");

    // Depois do commit: o card entra na conversa como mensagem normal (realtime, não lidas, notificação).
    const card = await buscarMensagemNaConversa(
      banco,
      entrada.conversaId,
      mensagemId,
    );
    if (card)
      eventosMensagens.publicar({
        tipo: "mensagem-criada",
        mensagem: card,
        destinatariosIdentidadeIds: participantes,
      });

    return { tipo: "criado", pedido, empresa };
  } catch (erro) {
    if (!(erro instanceof ErroPedidoDuplicado)) throw erro;

    const existente = await buscarPedidoPorTentativa(
      banco,
      clienteIdentidadeId,
      entrada.idCliente,
    );
    if (!existente) return { tipo: "id-cliente-reutilizado" };

    /*
     * Retry legítimo = mesma empresa, mesma conversa, mesmo pagamento e mesmos itens/total. A
     * comparação inclui a MONTAGEM: dois itens do mesmo produto podem existir com escolhas
     * diferentes, então a assinatura leva produto, quantidade, subtotal e as escolhas gravadas.
     */
    const mesmosItens = mesmaColecao(existente.itens.map(assinaturaItem), calculo.itens.map(assinaturaItem));
    const mesmaTentativa =
      existente.pedido.empresaId === empresa.empresaId &&
      existente.pedido.conversaId === entrada.conversaId &&
      existente.pedido.formaPagamentoNaEntrega === entrada.pagamento.forma &&
      existente.pedido.trocoParaCentavos === pagamento.trocoParaCentavos &&
      existente.pedido.totalCentavos === calculo.totalCentavos &&
      mesmosItens;

    return mesmaTentativa
      ? { tipo: "ja-existente", pedido: existente, empresa }
      : { tipo: "id-cliente-reutilizado" };
  }
}

function mensagemEscolhasInvalidas(recusa: { motivo: "opcao-desconhecida" | "faltam-escolhas" | "escolhas-demais"; grupoNome?: string | undefined }): string {
  const grupo = recusa.grupoNome ? `“${recusa.grupoNome}”` : "de opções";
  if (recusa.motivo === "faltam-escolhas") return `Faltam escolhas no grupo ${grupo}.`;
  if (recusa.motivo === "escolhas-demais") return `Você escolheu opções além do limite no grupo ${grupo}.`;
  return "Alguma opção escolhida não está mais disponível. Monte o item de novo.";
}

const assinaturaEscolhas = (escolhas: ReadonlyArray<{ grupoNome: string; opcaoNome: string; precoAdicionalCentavos: number }>) =>
  [...escolhas].map((escolha) => `${escolha.grupoNome}=${escolha.opcaoNome}@${escolha.precoAdicionalCentavos}`).sort().join("+");

type ItemComparavel = {
  produtoId: string | null;
  quantidade: number;
  subtotalCentavos: number;
  escolhas: ReadonlyArray<{ grupoNome: string; opcaoNome: string; precoAdicionalCentavos: number }>;
  observacao: string | null;
};

const assinaturaItem = (item: ItemComparavel) =>
  `${item.produtoId}|${item.quantidade}|${item.subtotalCentavos}|${assinaturaEscolhas(item.escolhas)}|${item.observacao ?? ""}`;

// Mesmas assinaturas, mesma quantidade de cada uma (a ordem dos itens não importa).
function mesmaColecao(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const contagem = new Map<string, number>();
  for (const chave of a) contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  for (const chave of b) {
    const restante = contagem.get(chave);
    if (!restante) return false;
    contagem.set(chave, restante - 1);
  }
  return true;
}
