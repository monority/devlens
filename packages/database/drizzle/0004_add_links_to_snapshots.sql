-- Step 63 (Phase 4): Add html_links column to snapshots table for <link> tag data
-- Restores round-trip fidelity for SiteSnapshot.html.links (previously dropped
-- by the write-side mapper and hard-coded to [] on read-back).
ALTER TABLE "snapshots" ADD COLUMN "html_links" jsonb NOT NULL DEFAULT '[]'::jsonb;
