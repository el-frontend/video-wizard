CREATE TYPE "public"."studio_engine" AS ENUM('remotion', 'hyperframes');--> statement-breakpoint
CREATE TYPE "public"."studio_revision_operation" AS ENUM('create', 'save', 'restore', 'duplicate');--> statement-breakpoint
CREATE TABLE "studio_project_revisions" (
	"revision" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"document" json NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"operation" "studio_revision_operation" NOT NULL,
	CONSTRAINT "studio_project_revisions_sequence_unique" UNIQUE("project_id","sequence"),
	CONSTRAINT "studio_project_revisions_sequence_positive" CHECK ("studio_project_revisions"."sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "studio_projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"engine" "studio_engine" NOT NULL,
	"revision" uuid NOT NULL,
	CONSTRAINT "studio_projects_id_owner_unique" UNIQUE("id","owner_id")
);
--> statement-breakpoint
ALTER TABLE "studio_project_revisions" ADD CONSTRAINT "studio_project_revisions_project_owner_fk" FOREIGN KEY ("project_id","author_id") REFERENCES "public"."studio_projects"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_projects" ADD CONSTRAINT "studio_projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_projects_owner_idx" ON "studio_projects" USING btree ("owner_id");