CREATE TABLE "scans" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"hostname" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"error_code" text,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"scan_id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"hostname" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"http_status_code" integer NOT NULL,
	"http_content_type" text NOT NULL,
	"http_final_url" text NOT NULL,
	"html_title" text NOT NULL,
	"html_description" text,
	"headers" jsonb NOT NULL,
	"resources" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;