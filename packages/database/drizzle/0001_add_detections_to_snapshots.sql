ALTER TABLE "snapshots" ADD COLUMN "detections" jsonb NOT NULL DEFAULT '[]'::jsonb;
