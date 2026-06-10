// Deprecated — R2 backup retired. All data lives in Supabase.
export default function handler(req, res) {
  return res.status(410).json({ error: "R2 backup retired. Data is in Supabase." })
}
