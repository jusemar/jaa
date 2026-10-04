ALTER TYPE "public"."tipo_mensagem" ADD VALUE 'audio';--> statement-breakpoint
ALTER TYPE "public"."tipo_anexo" ADD VALUE 'audio';--> statement-breakpoint
ALTER TABLE "mensagens" DROP CONSTRAINT "mensagens_conteudo_texto_valido";--> statement-breakpoint
ALTER TABLE "anexos_mensagem" DROP CONSTRAINT "anexos_mensagem_dimensoes_positivas";--> statement-breakpoint
ALTER TABLE "anexos_mensagem" ALTER COLUMN "largura" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "anexos_mensagem" ALTER COLUMN "altura" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "anexos_mensagem" ADD COLUMN "duracao_ms" integer;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_conteudo_texto_valido" CHECK (("mensagens"."excluida_para_todos_em" is not null and "mensagens"."conteudo" = '') or ("mensagens"."excluida_para_todos_em" is null and "mensagens"."tipo"::text = 'texto' and char_length("mensagens"."conteudo") between 1 and 4000 and "mensagens"."conteudo" ~ '[^[:space:]]') or ("mensagens"."excluida_para_todos_em" is null and "mensagens"."tipo"::text = 'pedido' and "mensagens"."conteudo" = '') or ("mensagens"."excluida_para_todos_em" is null and "mensagens"."tipo"::text = 'imagem' and ("mensagens"."conteudo" = '' or (char_length("mensagens"."conteudo") between 1 and 4000 and "mensagens"."conteudo" ~ '[^[:space:]]'))) or ("mensagens"."excluida_para_todos_em" is null and "mensagens"."tipo"::text = 'audio' and "mensagens"."conteudo" = ''));--> statement-breakpoint
ALTER TABLE "anexos_mensagem" ADD CONSTRAINT "anexos_mensagem_audio_formato" CHECK ("anexos_mensagem"."tipo"::text <> 'audio' or "anexos_mensagem"."tipo_conteudo" in ('audio/webm', 'audio/mp4'));--> statement-breakpoint
ALTER TABLE "anexos_mensagem" ADD CONSTRAINT "anexos_mensagem_metadados_por_tipo" CHECK (("anexos_mensagem"."tipo"::text = 'imagem' and "anexos_mensagem"."largura" is not null and "anexos_mensagem"."altura" is not null and "anexos_mensagem"."largura" > 0 and "anexos_mensagem"."altura" > 0 and "anexos_mensagem"."duracao_ms" is null) or ("anexos_mensagem"."tipo"::text = 'audio' and "anexos_mensagem"."largura" is null and "anexos_mensagem"."altura" is null and "anexos_mensagem"."duracao_ms" is not null and "anexos_mensagem"."duracao_ms" > 0));--> statement-breakpoint
-- COERÊNCIA MENSAGEM ↔ ANEXO, agora para IMAGEM e ÁUDIO (mesmos triggers diferidos da 0043):
--   - mensagens_imagem_exige_anexo / mensagens_audio_exige_anexo: mensagem "imagem" ou "audio" tem
--     exatamente um anexo DO MESMO tipo (imagem não aceita áudio, áudio não aceita imagem);
--   - anexos_mensagem_tipo_coerente: texto e pedido não têm anexo;
--   - mensagens_anexo_ativo_enquanto_visivel: anexo não fica removido enquanto a mensagem é visível.
-- Comparações como texto: o valor 'audio' dos enums é criado nesta mesma migration.
CREATE OR REPLACE FUNCTION "public"."mensagens_verificar_anexo"("p_mensagem_id" uuid) RETURNS void LANGUAGE plpgsql AS $$
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

  IF v_tipo_mensagem IN ('imagem', 'audio') THEN
    IF NOT v_tem_anexo OR v_tipo_anexo <> v_tipo_mensagem THEN
      RAISE EXCEPTION 'mensagem % do tipo % sem anexo do mesmo tipo', p_mensagem_id, v_tipo_mensagem
        USING ERRCODE = '23514', CONSTRAINT = 'mensagens_' || v_tipo_mensagem || '_exige_anexo';
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
-- O gatilho do lado da mensagem só disparava para "imagem": passa a disparar também para "audio"
-- (texto e pedido continuam sem pagar nada a mais).
DROP TRIGGER "mensagens_coerencia_anexo" ON "public"."mensagens";--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "mensagens_coerencia_anexo"
  AFTER INSERT ON "public"."mensagens"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW."tipo"::text IN ('imagem', 'audio'))
  EXECUTE FUNCTION "public"."mensagens_verificar_anexo_gatilho"();
