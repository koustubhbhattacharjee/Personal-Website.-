// Deprecated — LO graph rebuild is no longer needed.
// Reinforcement LOs are resolved at import time via the 9MA0 taxonomy in Supabase.
export default function handler(req, res) {
  return res.status(410).json({ error: "rebuild-lo-graph retired. Taxonomy lives in Supabase." })
}
