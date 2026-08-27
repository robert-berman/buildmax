CREATE TABLE "build_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"champion" text NOT NULL,
	"role" text NOT NULL,
	"patch" text NOT NULL,
	"rank" text NOT NULL,
	"region" text DEFAULT 'world' NOT NULL,
	"items" integer[] NOT NULL,
	"boots" integer,
	"games" integer NOT NULL,
	"wins" integer NOT NULL,
	"pick_rate" double precision NOT NULL,
	"game_stage" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "champion_role_agg" (
	"id" text PRIMARY KEY NOT NULL,
	"champion" text NOT NULL,
	"role" text NOT NULL,
	"patch" text NOT NULL,
	"rank" text NOT NULL,
	"games" integer NOT NULL,
	"wins" integer NOT NULL,
	"pick_rate" double precision NOT NULL,
	"ban_rate" double precision
);
--> statement-breakpoint
CREATE TABLE "champions" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"tags" jsonb NOT NULL,
	"partype" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_pair_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"champion" text NOT NULL,
	"role" text NOT NULL,
	"patch" text NOT NULL,
	"rank" text NOT NULL,
	"item_a" integer NOT NULL,
	"item_b" integer NOT NULL,
	"games" integer NOT NULL,
	"wins" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tags" jsonb NOT NULL,
	"stats" jsonb NOT NULL,
	"gold_total" integer NOT NULL,
	"is_boots" boolean NOT NULL,
	"is_completed" boolean NOT NULL
);
--> statement-breakpoint
CREATE INDEX "build_champ_role_idx" ON "build_stats" USING btree ("champion","role","patch","rank");--> statement-breakpoint
CREATE INDEX "build_items_gin" ON "build_stats" USING gin ("items");--> statement-breakpoint
CREATE INDEX "agg_champ_idx" ON "champion_role_agg" USING btree ("champion","patch","rank");--> statement-breakpoint
CREATE INDEX "pair_champ_role_idx" ON "item_pair_stats" USING btree ("champion","role","patch","rank");