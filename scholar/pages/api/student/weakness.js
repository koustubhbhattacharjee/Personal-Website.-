import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { getWeaknessMap } from "../../../lib/db"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ error: "Unauthorized" })

  const isAdmin = (session.user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()
  const studentId = (req.query.as && isAdmin) ? req.query.as : session.notionStudentId

  try {
    const { subjectId } = req.query
    const weaknessMap = await getWeaknessMap(studentId, subjectId || null)
    return res.status(200).json({ weaknessMap })
  } catch (err) {
    console.error("Weakness error:", err)
    return res.status(500).json({ error: "Failed to load weakness scores" })
  }
}
