ALTER TABLE "shelf_entries" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Ordem inicial dos jogos que já existem: a mesma de antes (o que mudou de coluna por último vem primeiro).
UPDATE "shelf_entries" AS e SET "sort_order" = r.pos
FROM (
  SELECT "id", (row_number() OVER (PARTITION BY "user_id", "status" ORDER BY "status_changed_at" DESC, "created_at" DESC) - 1) * 1024 AS pos
  FROM "shelf_entries"
) AS r
WHERE e."id" = r."id";
