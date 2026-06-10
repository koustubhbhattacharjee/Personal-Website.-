// setup-db-columns.js — deprecated
// Previously added SLO columns to Notion DBs.
// Schema is now managed via Supabase migrations in supabase/migrations/.
export default function handler(req, res) {
  return res.status(410).json({
    error: "Deprecated. Schema is now managed via Supabase migrations in supabase/migrations/.",
  })
}
