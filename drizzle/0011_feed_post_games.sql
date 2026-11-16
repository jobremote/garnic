CREATE TABLE "post_games" (
	"post_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "post_games_post_id_game_id_pk" PRIMARY KEY("post_id","game_id")
);
--> statement-breakpoint
-- Posts que já existem seguem com o jogo que têm (posição 0), antes de a coluna antiga sair.
INSERT INTO "post_games" ("post_id", "game_id", "position") SELECT "id", "game_id", 0 FROM "posts" WHERE "game_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "posts" DROP CONSTRAINT "posts_game_id_games_id_fk";
--> statement-breakpoint
DROP INDEX "posts_game_idx";--> statement-breakpoint
ALTER TABLE "post_games" ADD CONSTRAINT "post_games_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_games" ADD CONSTRAINT "post_games_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_games_game_idx" ON "post_games" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "post_games_post_position_idx" ON "post_games" USING btree ("post_id","position");--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN "game_id";