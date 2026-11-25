ALTER TYPE "public"."job_status" ADD VALUE 'cancelling';--> statement-breakpoint
ALTER TYPE "public"."job_type" ADD VALUE 'studio_export';--> statement-breakpoint
ALTER TABLE "queue_tasks" ADD COLUMN "attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "queue_tasks" ADD COLUMN "lease_until" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_export_key_idx" ON "jobs" USING btree ("user_id",("input_data"->>'projectId'),("input_data"->>'idempotencyKey')) WHERE "jobs"."input_data"->>'kind' = 'studio-export-v1';