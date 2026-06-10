// Deprecated — LO graph is now derived from the 9MA0 taxonomy in Supabase.
// The file-based lo-graph.json is no longer used for new subjects.
export default function handler(req, res) {
  return res.status(410).json({ error: "LO graph endpoint retired. Use Supabase taxonomy." })
}
