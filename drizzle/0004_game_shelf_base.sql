CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"igdb_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"cover_image_id" text,
	"released_at" timestamp with time zone,
	"platforms" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shelf_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"status" text NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shelf_entries" ADD CONSTRAINT "shelf_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_entries" ADD CONSTRAINT "shelf_entries_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "games_igdb_id_key" ON "games" USING btree ("igdb_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shelf_entries_user_game_key" ON "shelf_entries" USING btree ("user_id","game_id");--> statement-breakpoint
CREATE INDEX "shelf_entries_user_status_idx" ON "shelf_entries" USING btree ("user_id","status","status_changed_at");