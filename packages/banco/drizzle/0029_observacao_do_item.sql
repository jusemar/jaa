ALTER TABLE "itens_pedido" ADD COLUMN "observacao" text;--> statement-breakpoint
ALTER TABLE "itens_pedido" ADD CONSTRAINT "itens_pedido_observacao_valida" CHECK ("itens_pedido"."observacao" is null or char_length("itens_pedido"."observacao") between 1 and 200);
