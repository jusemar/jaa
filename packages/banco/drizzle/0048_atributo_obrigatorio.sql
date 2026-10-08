ALTER TABLE "atributos_servico" ADD COLUMN "obrigatorio" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Dado de produto (catálogo semeado na 0035): o Entregador precisa dizer com que veículo entrega.
-- Perfis que já existiam sem veículo NÃO são alterados: a regra vale ao adicionar/salvar a atividade.
UPDATE "atributos_servico" SET "obrigatorio" = true WHERE "id" = '0199b000-0000-7000-8000-000000000021';
