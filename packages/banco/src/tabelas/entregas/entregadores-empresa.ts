import { boolean, check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "../autenticacao/better-auth.js";
import { empresas } from "../empresas/empresas.js";

/*
 * Convidado → a pessoa ainda precisa aceitar; ativo → pode receber entregas; inativo → mantém o
 * histórico, mas não recebe novas atribuições. Recusar um convite também leva a "inativo".
 */
export const statusEntregador = pgEnum("status_entregador", ["convidado", "ativo", "inativo"]);

/**
 * VÍNCULO CONTA ↔ EMPRESA como ENTREGADOR. É um vínculo separado de `membros_empresa`: entregador
 * NÃO é administrador e não herda nenhuma permissão de operar a empresa.
 *
 * O vínculo é por empresa (a mesma pessoa pode entregar para várias) e usa a conta autenticável, como
 * o vínculo de membro — nada de "usuario.entregador = true" e nada de login paralelo: quem entrega é
 * uma pessoa comum do Jaa que também tem este vínculo.
 */
export const entregadoresEmpresa = pgTable(
  "entregadores_empresa",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    usuarioId: text()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: statusEntregador().notNull().default("convidado"),
    /*
     * DISPONIBILIDADE OPERACIONAL, decidida pelo PRÓPRIO entregador e por empresa: "estou aceitando
     * novas entregas desta empresa agora?". É diferente do STATUS do vínculo (que é profissional e
     * administrado pela empresa): ativo diz que ele trabalha aqui; disponível, que aceita agora.
     * Começa FALSE — ninguém passa a receber entrega sem escolher ficar disponível.
     */
    disponivel: boolean().notNull().default(false),
    disponibilidadeAtualizadaEm: timestamp({ withTimezone: true }),
    /*
     * PRESENÇA NA BASE, calculada pelo SERVIDOR a partir da localização enviada pelo aparelho + o
     * ponto confirmado da empresa + o raio. O cliente nunca declara "estou na base".
     * Nenhuma coordenada é guardada aqui: só o estado derivado e o suficiente para estabilizar o GPS.
     */
    naBase: boolean().notNull().default(false),
    presencaAtualizadaEm: timestamp({ withTimezone: true }),
    ultimaLeituraEm: timestamp({ withTimezone: true }),
    // Leituras consecutivas concordando com o estado oposto ao atual (histerese contra oscilação).
    leiturasConsecutivas: integer().notNull().default(0),
    // Entrada na FILA da base: a ordem é o momento (do servidor) em que ficou elegível.
    filaEntrouEm: timestamp({ withTimezone: true }),
    /*
     * APTO PARA NOVA SAÍDA: gancho operacional (pendência a resolver com a empresa) separado de
     * disponibilidade e de acerto financeiro. Hoje ninguém o desliga automaticamente.
     */
    aptoParaSaida: boolean().notNull().default(true),
    // Quem da empresa convidou (auditoria interna; nunca exposta ao cliente).
    convidadoPorUsuarioId: text().references(() => users.id, { onDelete: "set null" }),
    convidadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // Quando a pessoa aceitou ou recusou o convite.
    respondidoEm: timestamp({ withTimezone: true }),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    // Uma pessoa tem no máximo UM vínculo de entregador por empresa (reconvidar reusa a linha).
    uniqueIndex("entregadores_empresa_unico").on(tabela.empresaId, tabela.usuarioId),
    // Alvo da FK composta das atribuições: entregador e pedido sempre da MESMA empresa.
    uniqueIndex("entregadores_empresa_id_empresa_id_unico").on(tabela.id, tabela.empresaId),
    // "Quais empresas esta conta entrega?" (a busca da área do entregador).
    index("entregadores_empresa_usuario_id_idx").on(tabela.usuarioId, tabela.empresaId),
    // Só quem tem vínculo ATIVO pode estar disponível (desativar o vínculo derruba a disponibilidade).
    check("entregadores_empresa_disponivel_exige_ativo", sql`not ${tabela.disponivel} or ${tabela.status} = 'ativo'`),
    // Só entra na fila quem está aceitando entregas E presente na base.
    check("entregadores_empresa_fila_exige_presenca", sql`${tabela.filaEntrouEm} is null or (${tabela.disponivel} and ${tabela.naBase})`),
    // Fila da base ordenada pelo momento de entrada (o desempate é o id, estável).
    index("entregadores_empresa_fila_idx").on(tabela.empresaId, tabela.filaEntrouEm),
  ],
);
