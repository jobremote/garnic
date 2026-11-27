ALTER TABLE "games" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "summary_pt" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "genres" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "developers" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "publishers" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "backdrop_image_id" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "time_hastily" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "time_normally" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "time_completely" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "details_fetched_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "games_slug_idx" ON "games" USING btree ("slug");