-- ============================================================================
-- HIBERNATION PACKAGE: copied verbatim (no content changes) for restorability.
-- Original source: sql/013_reference_pack_hash.sql
-- See supabase/MIGRATION_MANIFEST.md for ordering rationale and known conflicts.
-- ============================================================================

-- Issue #156 — Create Reference Pack and compute deterministic reference_hash
-- Adds storage column for SHA256(canonical Reference Pack JSON)
-- NOTE: Create/commit this migration file but DO NOT execute it here.

ALTER TABLE public.references
  ADD COLUMN IF NOT EXISTS reference_hash text;

CREATE INDEX IF NOT EXISTS idx_references_reference_hash
  ON public.references (reference_hash);
