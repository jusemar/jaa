-- Número do pedido DENTRO da empresa. Entra nulo, recebe o histórico numerado por empresa
-- (na ordem de criação) e só então vira NOT NULL: pedidos antigos não podem ficar sem número.
ALTER TABLE "pedidos" ADD COLUMN "numero" integer;--> statement-breakpoint
UPDATE "pedidos" AS p
SET "numero" = n."posicao"
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "empresa_id" ORDER BY "criado_em", "id") AS "posicao"
  FROM "pedidos"
) AS n
WHERE p."id" = n."id";--> statement-breakpoint
ALTER TABLE "pedidos" ALTER COLUMN "numero" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_numero_por_empresa_unico" ON "pedidos" USING btree ("empresa_id","numero");--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_numero_valido" CHECK ("pedidos"."numero" > 0);
