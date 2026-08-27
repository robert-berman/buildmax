CREATE TABLE "processed_matches" (
	"match_id" text PRIMARY KEY NOT NULL,
	"patch" text NOT NULL,
	"ingested_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"patch" text NOT NULL,
	"champion" text NOT NULL,
	"role" text NOT NULL,
	"win" boolean NOT NULL,
	"items" integer[] NOT NULL,
	"boots" integer
);
--> statement-breakpoint
CREATE INDEX "raw_patch_idx" ON "raw_participants" USING btree ("patch");--> statement-breakpoint
CREATE INDEX "raw_match_idx" ON "raw_participants" USING btree ("match_id");