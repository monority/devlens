-- Step 6E: Add html_scripts column to snapshots table for <script> tag data
ALTER TABLE "snapshots" ADD COLUMN "html_scripts" jsonb NOT NULL DEFAULT '[]'::jsonb;
