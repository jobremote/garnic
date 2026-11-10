CREATE TABLE "profile_name_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_key" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cover_key" text;--> statement-breakpoint
ALTER TABLE "profile_name_changes" ADD CONSTRAINT "profile_name_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_name_changes_user_field_idx" ON "profile_name_changes" USING btree ("user_id","field","changed_at");
--> statement-breakpoint
-- Contas que já existiam ganham a linha inicial do histórico (nome e @usuário de hoje, na data do cadastro).
INSERT INTO "profile_name_changes" ("user_id", "field", "old_value", "new_value", "changed_at")
SELECT "id", 'name', NULL, "name", "created_at" FROM "users";--> statement-breakpoint
INSERT INTO "profile_name_changes" ("user_id", "field", "old_value", "new_value", "changed_at")
SELECT "id", 'username', NULL, "username", "created_at" FROM "users";
