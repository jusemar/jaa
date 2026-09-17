ALTER TABLE "produtos" DROP CONSTRAINT "produtos_categoria_da_empresa_fk";
--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_categoria_da_empresa_fk" FOREIGN KEY ("empresa_id","categoria_id") REFERENCES "public"."categorias_produto"("empresa_id","id") ON DELETE no action ON UPDATE no action;