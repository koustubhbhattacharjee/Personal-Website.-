import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  readGraph, writeGraph, addEdge, removeEdge,
  addNode, normalizeAll, recomputeDegrees,
} from "../../../lib/lo-graph"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

function isAdmin(session) {
  return (session?.user?.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ error: "Unauthorized" })
  if (!isAdmin(session)) return res.status(403).json({ error: "Forbidden" })

  if (req.method === "GET") {
    const graph = await readGraph()
    return res.status(200).json({ ok: true, graph })
  }

  if (req.method === "POST") {
    // Add a single edge (and its nodes if new)
    const { from, to, weight = 0.5, fromName = "", toName = "" } = req.body || {}
    if (!from || !to) return res.status(400).json({ error: "Missing from or to" })

    const graph = await readGraph()
    addNode(graph, from, fromName)
    addNode(graph, to, toName)
    addEdge(graph, from, to, weight)
    await writeGraph(graph)
    return res.status(200).json({ ok: true, graph })
  }

  if (req.method === "DELETE") {
    const { from, to } = req.body || {}
    if (!from || !to) return res.status(400).json({ error: "Missing from or to" })

    const graph = await readGraph()
    removeEdge(graph, from, to)
    await writeGraph(graph)
    return res.status(200).json({ ok: true, graph })
  }

  if (req.method === "PUT") {
    // Full graph replacement — used on import
    const { graph: newGraph } = req.body || {}
    if (!newGraph?.nodes || !Array.isArray(newGraph?.edges)) {
      return res.status(400).json({ error: "Invalid graph structure" })
    }
    recomputeDegrees(newGraph)
    normalizeAll(newGraph)
    await writeGraph(newGraph)
    return res.status(200).json({ ok: true, graph: newGraph })
  }

  return res.status(405).json({ error: "Method not allowed" })
}
