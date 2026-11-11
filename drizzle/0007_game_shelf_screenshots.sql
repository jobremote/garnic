CREATE TABLE "screenshot_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid,
	"screenshot_ref" text NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shelf_entries" ADD COLUMN "screenshot_ref" text;--> statement-breakpoint
ALTER TABLE "shelf_entries" ADD COLUMN "screenshot_spoiler" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "screenshot_reports" ADD CONSTRAINT "screenshot_reports_entry_id_shelf_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."shelf_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenshot_reports" ADD CONSTRAINT "screenshot_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "screenshot_reports_reporter_image_key" ON "screenshot_reports" USING btree ("reporter_id","screenshot_ref");--> statement-breakpoint
CREATE INDEX "screenshot_reports_entry_idx" ON "screenshot_reports" USING btree ("entry_id");