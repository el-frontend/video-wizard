ALTER TYPE "public"."studio_revision_operation" ADD VALUE 'import';--> statement-breakpoint
ALTER TYPE "public"."studio_revision_operation" ADD VALUE 'repair';--> statement-breakpoint
CREATE TABLE "studio_imports" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"source_id" text NOT NULL,
	"hash" text NOT NULL,
	CONSTRAINT "studio_imports_identity_unique" UNIQUE("owner_id","kind","source_id","hash")
);
--> statement-breakpoint
ALTER TABLE "studio_project_revisions" ADD COLUMN "import_context" json;--> statement-breakpoint
ALTER TABLE "studio_imports" ADD CONSTRAINT "studio_imports_project_owner_fk" FOREIGN KEY ("project_id","owner_id") REFERENCES "public"."studio_projects"("id","owner_id") ON DELETE cascade ON UPDATE no action;