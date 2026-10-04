CREATE TYPE "public"."tipo_anexo" AS ENUM('imagem');--> statement-breakpoint
ALTER TYPE "public"."tipo_mensagem" ADD VALUE 'imagem';--> statement-breakpoint
CREATE TABLE "anexos_mensagem" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"conversa_id" uuid NOT NULL,
	"mensagem_id" uuid NOT NULL,
	"tipo" "tipo_anexo" NOT NULL,
	"chave" text NOT NULL,
	"tipo_conteudo" text NOT NULL,
	"tamanho_bytes" bigint NOT NULL,
	"largura" integer NOT NULL,
	"altura" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"removido_em" timestamp with time zone,
	CONSTRAINT "anexos_mensagem_chave_valida" CHECK (char_length("anexos_mensagem"."chave") between 1 and 300),
	CONSTRAINT "anexos_mensagem_tipo_conteudo_valido" CHECK (char_length("anexos_mensagem"."tipo_conteudo") between 1 and 100),
	CONSTRAINT "anexos_mensagem_imagem_em_webp" CHECK ("anexos_mensagem"."tipo"::text <> 'imagem' or "anexos_mensagem"."tipo_conteudo" = 'image/webp'),
	CONSTRAINT "anexos_mensagem_tamanho_positivo" CHECK ("anexos_mensagem"."tamanho_bytes" > 0),
	CONSTRAINT "anexos_mensagem_dimensoes_positivas" CHECK ("anexos_mensagem"."largura" > 0 and "anexos_mensagem"."altura" > 0),
	CONSTRAINT "anexos_mensagem_removido_apos_criacao" CHECK ("anexos_mensagem"."removido_em" is null or "anexos_mensagem"."removido_em" >= "anexos_mensagem"."criado_em")
);
--> statement-breakpoint
ALTER TABLE "mensagens" DROP CONSTRAINT "mensagens_conteudo_texto_valido";--> statement-breakpoint
ALTER TABLE "anexos_mensagem" ADD CONSTRAINT "anexos_mensagem_mensagem_fk" FOREIGN KEY ("conversa_id","mensagem_id") REFERENCES "public"."mensagens"("conversa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "anexos_mensagem_chave_unica" ON "anexos_mensagem" USING btree ("chave");--> statement-breakpoint
CREATE UNIQUE INDEX "anexos_mensagem_um_por_mensagem" ON "anexos_mensagem" USING btree ("mensagem_id");--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_conteudo_texto_valido" CHECK (("mensagens"."excluida_para_todos_em" is not null and "mensagens"."conteudo" = '') or ("mensagens"."excluida_para_todos_em" is null and "mensagens"."tipo"::text = 'texto' and char_length("mensagens"."conteudo") between 1 and 4000 and "mensagens"."conteudo" ~ '[^[:space:]]') or ("mensagens"."excluida_para_todos_em" is null and "mensagens"."tipo"::text = 'pedido' and "mensagens"."conteudo" = '') or ("mensagens"."excluida_para_todos_em" is null and "mensagens"."tipo"::text = 'imagem' and ("mensagens"."conteudo" = '' or (char_length("mensagens"."conteudo") between 1 and 4000 and "mensagens"."conteudo" ~ '[^[:space:]]'))));--> statement-breakpoint
-- COERÊNCIA MENSAGEM ↔ ANEXO, conferida no COMMIT (mensagem e anexo nascem na mesma transação, em
-- qualquer ordem). Envolve duas tabelas, então não cabe em CHECK/FK: mesmo padrão de trigger de
-- constraint diferido da fundação da empresa (0007), com ERRCODE 23514 e nome de constraint.
--   - mensagens_imagem_exige_anexo: mensagem "imagem" tem exatamente um anexo "imagem";
--   - anexos_mensagem_tipo_coerente: anexo só existe em mensagem do mesmo tipo;
--   - mensagens_anexo_ativo_enquanto_visivel: enquanto a mensagem não foi excluída para todos, o anexo
--     dela não pode estar removido (removido_em é o par do tombstone da mensagem).
-- Comparações como texto: o valor 'imagem' de tipo_mensagem é criado nesta mesma migration.
CREATE FUNCTION "public"."mensagens_verificar_anexo"("p_mensagem_id" uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_tipo_mensagem text;
  v_excluida_em timestamptz;
  v_tem_anexo boolean;
  v_tipo_anexo text;
  v_removido_em timestamptz;
BEGIN
  SELECT "tipo"::text, "excluida_para_todos_em" INTO v_tipo_mensagem, v_excluida_em
    FROM "public"."mensagens" WHERE "id" = p_mensagem_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT "tipo"::text, "removido_em" INTO v_tipo_anexo, v_removido_em
    FROM "public"."anexos_mensagem" WHERE "mensagem_id" = p_mensagem_id;
  v_tem_anexo := FOUND;

  IF v_tipo_mensagem = 'imagem' THEN
    IF NOT v_tem_anexo OR v_tipo_anexo <> 'imagem' THEN
      RAISE EXCEPTION 'mensagem % do tipo imagem sem anexo de imagem', p_mensagem_id
        USING ERRCODE = '23514', CONSTRAINT = 'mensagens_imagem_exige_anexo';
    END IF;
    IF v_excluida_em IS NULL AND v_removido_em IS NOT NULL THEN
      RAISE EXCEPTION 'mensagem % visível com anexo removido', p_mensagem_id
        USING ERRCODE = '23514', CONSTRAINT = 'mensagens_anexo_ativo_enquanto_visivel';
    END IF;
  ELSIF v_tem_anexo THEN
    RAISE EXCEPTION 'anexo em mensagem % do tipo %', p_mensagem_id, v_tipo_mensagem
      USING ERRCODE = '23514', CONSTRAINT = 'anexos_mensagem_tipo_coerente';
  END IF;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "public"."mensagens_verificar_anexo_gatilho"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'mensagens' THEN
    PERFORM "public"."mensagens_verificar_anexo"(NEW."id");
  ELSE
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      PERFORM "public"."mensagens_verificar_anexo"(OLD."mensagem_id");
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      PERFORM "public"."mensagens_verificar_anexo"(NEW."mensagem_id");
    END IF;
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
-- Só mensagens "imagem" disparam pelo lado da mensagem (texto e pedido não pagam nada a mais):
-- anexo indevido em mensagem de outro tipo é pego pelo trigger do anexo.
CREATE CONSTRAINT TRIGGER "mensagens_coerencia_anexo"
  AFTER INSERT ON "public"."mensagens"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW."tipo"::text = 'imagem')
  EXECUTE FUNCTION "public"."mensagens_verificar_anexo_gatilho"();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "anexos_mensagem_coerencia_mensagem"
  AFTER INSERT OR UPDATE OR DELETE ON "public"."anexos_mensagem"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "public"."mensagens_verificar_anexo_gatilho"();
