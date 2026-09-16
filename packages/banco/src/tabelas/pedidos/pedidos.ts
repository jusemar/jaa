import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { conversas } from "../conversas/conversas.js";
import { participantesConversa } from "../conversas/participantes-conversa.js";
import { empresas } from "../empresas/empresas.js";
import { identidades } from "../identidades/identidades.js";

// Fluxo operacional aprovado; nesta fase só "recebido" é usado (transições virão na etapa de acompanhamento).
export const statusPedido = pgEnum("status_pedido", [
  "recebido",
  "confirmado",
  "em_preparacao",
  "pronto",
  "saiu_para_entrega",
  "em_rota",
  "entregue",
]);

// Canal de origem do MESMO domínio Pedido (loja pública e app entram como novos valores).
export const origemPedido = pgEnum("origem_pedido", ["conversa"]);

// O Jaa NÃO processa pagamento: o cliente informa como pretende pagar NA ENTREGA.
export const formaPagamentoEntrega = pgEnum("forma_pagamento_entrega", ["dinheiro", "cartao"]);

/**
 * PEDIDO JAA: domínio único, independentemente de onde nasce (hoje, a conversa com a empresa).
 * Valores em CENTAVOS inteiros; `total_centavos` é sempre calculado pelo SERVIDOR a partir dos preços
 * do banco (o cliente nunca envia preço ou total). Nenhum dado de cartão existe aqui: o pagamento é
 * presencial, com os meios da própria empresa/entregador.
 */
export const pedidos = pgTable(
  "pedidos",
  {
    // UUIDv7: identidade global e ordem cronológica (PostgreSQL 18+), como em mensagens.
    id: uuid().primaryKey().default(sql`uuidv7()`),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    // Identidade do CLIENTE (derivada da sessão; nunca enviada pelo cliente).
    clienteIdentidadeId: uuid()
      .notNull()
      .references(() => identidades.id, { onDelete: "restrict" }),
    origem: origemPedido().notNull(),
    // Conversa em que o pedido nasceu (null quando vier de outro canal no futuro).
    conversaId: uuid().references(() => conversas.id, { onDelete: "restrict" }),
    status: statusPedido().notNull().default("recebido"),
    formaPagamentoNaEntrega: formaPagamentoEntrega().notNull(),
    // "Troco para quanto?": valor que o cliente pretende entregar. Só no dinheiro e só quando precisa
    // de troco (por isso > total; igual ao total é normalizado para null).
    trocoParaCentavos: integer(),
    totalCentavos: integer().notNull(),
    // Chave de idempotência da TENTATIVA do cliente: tocar "Confirmar" duas vezes não cria dois pedidos.
    idCliente: uuid().notNull(),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    uniqueIndex("pedidos_id_cliente_por_identidade_unico").on(tabela.clienteIdentidadeId, tabela.idCliente),
    // Alvo da FK composta dos itens: garante item e pedido na MESMA empresa.
    uniqueIndex("pedidos_id_empresa_id_unico").on(tabela.id, tabela.empresaId),
    // "Pedidos desta empresa" e "pedidos deste cliente", do mais recente para o mais antigo.
    index("pedidos_empresa_id_id_idx").on(tabela.empresaId, tabela.id),
    index("pedidos_cliente_identidade_id_id_idx").on(tabela.clienteIdentidadeId, tabela.id),
    // O cliente participa da conversa de origem: garantido pelo banco (ignorado quando não há conversa).
    foreignKey({
      name: "pedidos_cliente_participante_fk",
      columns: [tabela.conversaId, tabela.clienteIdentidadeId],
      foreignColumns: [participantesConversa.conversaId, participantesConversa.identidadeId],
    }).onDelete("restrict"),
    check("pedidos_total_valido", sql`${tabela.totalCentavos} between 1 and 999999999`),
    // Cartão nunca tem troco; dinheiro com troco exige valor MAIOR que o total (igual = sem troco).
    check(
      "pedidos_troco_por_forma",
      sql`(${tabela.formaPagamentoNaEntrega} = 'cartao' and ${tabela.trocoParaCentavos} is null) or (${tabela.formaPagamentoNaEntrega} = 'dinheiro' and (${tabela.trocoParaCentavos} is null or ${tabela.trocoParaCentavos} > ${tabela.totalCentavos}))`,
    ),
    check("pedidos_conversa_por_origem", sql`${tabela.origem}::text <> 'conversa' or ${tabela.conversaId} is not null`),
  ],
);
