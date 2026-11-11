ALTER TABLE "shelf_entries" ADD COLUMN "platform" text;--> statement-breakpoint
ALTER TABLE "shelf_entries" ADD COLUMN "rating" smallint;--> statement-breakpoint
ALTER TABLE "shelf_entries" ADD COLUMN "review" text;--> statement-breakpoint
ALTER TABLE "shelf_entries" ADD COLUMN "review_spoiler" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shelf_entries" ADD COLUMN "started_month" smallint;--> statement-breakpoint
ALTER TABLE "shelf_entries" ADD COLUMN "started_year" smallint;--> statement-breakpoint
ALTER TABLE "shelf_entries" ADD COLUMN "ended_month" smallint;--> statement-breakpoint
ALTER TABLE "shelf_entries" ADD COLUMN "ended_year" smallint;--> statement-breakpoint
ALTER TABLE "shelf_entries" ADD COLUMN "play_minutes" integer;