CREATE TYPE "public"."job_status" AS ENUM('pending', 'queued', 'processing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('transcription', 'render', 'clip_creation', 'analysis');--> statement-breakpoint
CREATE TYPE "public"."queue_status" AS ENUM('active', 'paused');--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "job_type" NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"input_data" jsonb,
	"result_data" jsonb,
	"error_message" text,
	"progress" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "jobs_progress_range" CHECK ("jobs"."progress" >= 0 AND "jobs"."progress" <= 100)
);
--> statement-breakpoint
CREATE TABLE "queue_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"queue_id" uuid NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_queues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" "queue_status" DEFAULT 'active' NOT NULL,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_queues_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "queue_tasks" ADD CONSTRAINT "queue_tasks_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_tasks" ADD CONSTRAINT "queue_tasks_queue_id_task_queues_id_fk" FOREIGN KEY ("queue_id") REFERENCES "public"."task_queues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_user_id_status_idx" ON "jobs" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "queue_tasks_job_id_idx" ON "queue_tasks" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "queue_tasks_status_idx" ON "queue_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "queue_tasks_queue_id_idx" ON "queue_tasks" USING btree ("queue_id");--> statement-breakpoint
CREATE INDEX "queue_tasks_queue_id_position_idx" ON "queue_tasks" USING btree ("queue_id","position");