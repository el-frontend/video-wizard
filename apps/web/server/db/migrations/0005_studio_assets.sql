CREATE TABLE "studio_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"hash" text NOT NULL,
	"name" text NOT NULL,
	"media_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"duration_ms" bigint,
	"width" integer,
	"height" integer,
	"has_audio" boolean NOT NULL,
	CONSTRAINT "studio_assets_owner_hash_unique" UNIQUE("owner_id","hash"),
	CONSTRAINT "studio_assets_hash_format" CHECK ("studio_assets"."hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "studio_assets_size_positive" CHECK ("studio_assets"."size_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "studio_assets" ADD CONSTRAINT "studio_assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;