ALTER TABLE "snapshots" ADD COLUMN "html_meta_tags" jsonb NOT NULL DEFAULT '[]'::jsonb;
