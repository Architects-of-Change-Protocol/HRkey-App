# Edge Functions

This repository has **zero Supabase Edge Functions**. Confirmed by a
repo-wide search (no `supabase/functions/*` code prior to this audit, no
`Deno.serve`, no `functions.invoke(...)` calls anywhere in the app).

All server-side logic instead runs in the Node/Express backend deployed to
Render (`backend/`) and in Next.js API routes (`pages/api/`, `HRkey/api/`).
This directory is kept as an empty placeholder so the standard
`supabase/` project layout is complete — nothing to deploy here.
