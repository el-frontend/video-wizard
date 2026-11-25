CREATE TYPE "public"."studio_library_kind" AS ENUM('component', 'template', 'style', 'brand');--> statement-breakpoint
CREATE TABLE "studio_libraries" (
	"owner_id" uuid NOT NULL,
	"id" text NOT NULL,
	"version" bigint NOT NULL,
	"kind" "studio_library_kind" NOT NULL,
	"entry" jsonb NOT NULL,
	"bundle_hash" text,
	CONSTRAINT "studio_libraries_owner_id_id_version_pk" PRIMARY KEY("owner_id","id","version"),
	CONSTRAINT "studio_libraries_version_positive" CHECK ("studio_libraries"."version" > 0),
	CONSTRAINT "studio_libraries_bundle_hash_format" CHECK ("studio_libraries"."bundle_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "studio_libraries" ADD CONSTRAINT "studio_libraries_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_libraries_owner_kind_idx" ON "studio_libraries" USING btree ("owner_id","kind");