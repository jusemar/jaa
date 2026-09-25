import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { empresas } from "../empresas/empresas.js";

/**
 * ZONA DE ENTREGA: polígono desenhado pela empresa no mapa, usado para AGRUPAR pedidos próximos numa
 * mesma saída. Não é bairro, CEP nem raio — e o cliente nunca a escolhe.
 *
 * Os vértices ficam em `jsonb` (lista de `{latitude, longitude}`, fechamento implícito): o Jaa não
 * depende de PostGIS, e a decisão "o ponto está dentro?" é a mesma função pura no servidor e na tela.
 */
export const zonasEntrega = pgTable(
  "zonas_entrega",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    nome: text().notNull(),
    freteCentavos: integer("frete_centavos").notNull().default(0),
    vertices: jsonb().notNull(),
    // Zona desativada continua no histórico das saídas, mas não classifica pedido novo.
    ativa: boolean().notNull().default(true),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    // Alvo das FKs compostas: zona e saída/compatibilidade sempre da MESMA empresa.
    uniqueIndex("zonas_entrega_id_empresa_id_unico").on(tabela.id, tabela.empresaId),
    // Dois nomes iguais na mesma empresa confundiriam a operação (comparação sem diferenciar caixa).
    uniqueIndex("zonas_entrega_nome_por_empresa_unico").on(tabela.empresaId, sql`lower(${tabela.nome})`),
    index("zonas_entrega_empresa_id_idx").on(tabela.empresaId, tabela.ativa),
    check("zonas_entrega_nome_valido", sql`length(btrim(${tabela.nome})) between 1 and 60`),
    check("zonas_entrega_frete_valido", sql`${tabela.freteCentavos} between 0 and 999999999`),
    // Polígono mínimo: uma lista com pelo menos 3 pontos. A geometria fina é validada no servidor.
    check(
      "zonas_entrega_poligono_minimo",
      sql`jsonb_typeof(${tabela.vertices}) = 'array' and jsonb_array_length(${tabela.vertices}) between 3 and 60`,
    ),
  ],
);

/**
 * COMPATIBILIDADE ENTRE ZONAS: "a empresa permite juntar pedidos destas duas zonas numa mesma saída
 * quando houver pouco volume". É decisão EXPLÍCITA do gestor, não inferência de rota — sem motor
 * rodoviário, o Jaa não tem como afirmar que duas zonas ficam "no caminho" uma da outra.
 *
 * O par é normalizado (menor id primeiro) para valer nos dois sentidos sem linha duplicada.
 */
export const compatibilidadesZona = pgTable(
  "compatibilidades_zona",
  {
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    zonaMenorId: uuid()
      .notNull()
      .references(() => zonasEntrega.id, { onDelete: "cascade" }),
    zonaMaiorId: uuid()
      .notNull()
      .references(() => zonasEntrega.id, { onDelete: "cascade" }),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    primaryKey({ name: "compatibilidades_zona_pk", columns: [tabela.zonaMenorId, tabela.zonaMaiorId] }),
    // Sempre normalizado: (A,B) e (B,A) são a mesma linha, e zona não combina consigo mesma.
    check("compatibilidades_zona_par_normalizado", sql`${tabela.zonaMenorId} < ${tabela.zonaMaiorId}`),
    foreignKey({
      name: "compatibilidades_zona_menor_da_empresa_fk",
      columns: [tabela.zonaMenorId, tabela.empresaId],
      foreignColumns: [zonasEntrega.id, zonasEntrega.empresaId],
    }).onDelete("cascade"),
    foreignKey({
      name: "compatibilidades_zona_maior_da_empresa_fk",
      columns: [tabela.zonaMaiorId, tabela.empresaId],
      foreignColumns: [zonasEntrega.id, zonasEntrega.empresaId],
    }).onDelete("cascade"),
    index("compatibilidades_zona_empresa_idx").on(tabela.empresaId),
  ],
);
