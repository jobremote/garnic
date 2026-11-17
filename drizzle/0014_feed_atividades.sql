CREATE TABLE "shelf_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_id" uuid,
	"game_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"platform" text,
	"rating" smallint,
	"play_minutes" integer,
	"review" text,
	"screenshot_ref" text,
	"spoiler" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "activity_id" uuid;--> statement-breakpoint
ALTER TABLE "shelf_activities" ADD CONSTRAINT "shelf_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_activities" ADD CONSTRAINT "shelf_activities_entry_id_shelf_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."shelf_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_activities" ADD CONSTRAINT "shelf_activities_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shelf_activities_entry_idx" ON "shelf_activities" USING btree ("entry_id","created_at");--> statement-breakpoint
CREATE INDEX "shelf_activities_user_idx" ON "shelf_activities" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_activity_id_shelf_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."shelf_activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "posts_activity_key" ON "posts" USING btree ("activity_id");