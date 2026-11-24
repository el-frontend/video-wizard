CREATE TABLE "studio_proposals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"base_revision" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"source_digest" text NOT NULL,
	"input" json NOT NULL,
	"candidate" json,
	"bundle_hash" text,
	"module_hash" text,
	"samples" json,
	"diagnostics" json NOT NULL,
	"status" text NOT NULL,
	"applied_revision" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_proposals_delivery_unique" UNIQUE("owner_id","project_id","request_id","base_revision","source_digest")
);
--> statement-breakpoint
ALTER TABLE "studio_libraries" ADD COLUMN "listed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_proposals" ADD CONSTRAINT "studio_proposals_base_revision_studio_project_revisions_revision_fk" FOREIGN KEY ("base_revision") REFERENCES "public"."studio_project_revisions"("revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_proposals" ADD CONSTRAINT "studio_proposals_applied_revision_studio_project_revisions_revision_fk" FOREIGN KEY ("applied_revision") REFERENCES "public"."studio_project_revisions"("revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_proposals" ADD CONSTRAINT "studio_proposals_project_id_owner_id_studio_projects_id_owner_id_fk" FOREIGN KEY ("project_id","owner_id") REFERENCES "public"."studio_projects"("id","owner_id") ON DELETE cascade ON UPDATE no action;