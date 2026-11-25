CREATE TABLE "studio_bindings" (
	"binding_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"digest" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "studio_bindings_owner_id_project_id_binding_id_pk" PRIMARY KEY("owner_id","project_id","binding_id"),
	CONSTRAINT "studio_bindings_digest_unique" UNIQUE("digest")
);
--> statement-breakpoint
CREATE TABLE "studio_pairings" (
	"digest" text PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"binding_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"attempt_id" uuid,
	"attempt_digest" text,
	"attempt_expires" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"generation_started" timestamp with time zone,
	"result_revision" uuid,
	"proposal_id" uuid,
	"asset_id" uuid,
	"ranges" jsonb,
	"action_digest" text,
	"voice" jsonb,
	"delivery" jsonb,
	CONSTRAINT "studio_requests_attempt_id_unique" UNIQUE("attempt_id"),
	CONSTRAINT "studio_requests_attempt_digest_unique" UNIQUE("attempt_digest"),
	CONSTRAINT "studio_requests_owner_id_project_id_idempotency_key_unique" UNIQUE("owner_id","project_id","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "studio_bindings" ADD CONSTRAINT "studio_bindings_project_id_owner_id_studio_projects_id_owner_id_fk" FOREIGN KEY ("project_id","owner_id") REFERENCES "public"."studio_projects"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_pairings" ADD CONSTRAINT "studio_pairings_project_id_owner_id_studio_projects_id_owner_id_fk" FOREIGN KEY ("project_id","owner_id") REFERENCES "public"."studio_projects"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_requests" ADD CONSTRAINT "studio_requests_result_revision_studio_project_revisions_revision_fk" FOREIGN KEY ("result_revision") REFERENCES "public"."studio_project_revisions"("revision") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_requests" ADD CONSTRAINT "studio_requests_proposal_id_studio_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."studio_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_requests" ADD CONSTRAINT "studio_requests_asset_id_studio_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."studio_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_requests" ADD CONSTRAINT "studio_requests_owner_id_project_id_binding_id_studio_bindings_owner_id_project_id_binding_id_fk" FOREIGN KEY ("owner_id","project_id","binding_id") REFERENCES "public"."studio_bindings"("owner_id","project_id","binding_id") ON DELETE cascade ON UPDATE no action;