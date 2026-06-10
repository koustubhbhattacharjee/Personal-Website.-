import fs from "fs/promises"
import { getLoForSlo } from "./slo-utils.js"
import os from "os"
import path from "path"

const GRAPH_FILE = process.env.VERCEL
  ? path.join(os.tmpdir(), "scholar-lo-graph.json")
  : path.join(process.cwd(), "data", "lo-graph.json")

/**
 * Aggregate SLO-level scores to LO-level by averaging.
 * sloScores: { [sloId]: number (0–1) }
 * Returns: { [loCode]: number }
 */
export function computeLoScore(sloScores) {
  const sums = {}
  const counts = {}
  for (const [sloId, score] of Object.entries(sloScores || {})) {
    const loCode = getLoForSlo(sloId)
    if (!loCode) continue
    sums[loCode] = (sums[loCode] || 0) + Number(score || 0)
    counts[loCode] = (counts[loCode] || 0) + 1
  }
  const result = {}
  for (const loCode of Object.keys(sums)) {
    result[loCode] = sums[loCode] / counts[loCode]
  }
  return result
}

export function emptyGraph() {
  return { nodes: {}, edges: [] }
}

export function addNode(graph, code, name = "") {
  if (!graph.nodes[code]) {
    graph.nodes[code] = { code, name: name || code, inDegree: 0, outDegree: 0 }
  } else if (name && graph.nodes[code].name === code) {
    graph.nodes[code].name = name
  }
  return graph
}

// BFS: can we reach `target` starting from `from`?
function canReach(graph, from, target) {
  const visited = new Set()
  const queue = [from]
  while (queue.length) {
    const node = queue.shift()
    if (node === target) return true
    if (visited.has(node)) continue
    visited.add(node)
    graph.edges.filter(e => e.from === node).forEach(e => queue.push(e.to))
  }
  return false
}

// For a given target node, normalize all incoming edge weights to sum ≤ 1.
export function normalizeIncoming(graph, toCode) {
  const incoming = graph.edges.filter(e => e.to === toCode)
  if (!incoming.length) return
  const total = incoming.reduce((s, e) => s + (e.weight || 0), 0)
  if (total <= 1) return
  incoming.forEach(e => { e.weight = e.weight / total })
}

export function normalizeAll(graph) {
  const targets = [...new Set(graph.edges.map(e => e.to))]
  targets.forEach(to => normalizeIncoming(graph, to))
  return graph
}

export function addEdge(graph, from, to, weight = 0.5) {
  if (!from || !to || from === to) return graph
  // DAG constraint: reject if this edge would create a cycle
  if (canReach(graph, to, from)) return graph

  const w = Math.max(0, Math.min(1, Number(weight) || 0))
  const existing = graph.edges.find(e => e.from === from && e.to === to)
  if (existing) {
    existing.weight = w
  } else {
    graph.edges.push({ from, to, weight: w })
    if (graph.nodes[from]) graph.nodes[from].outDegree = (graph.nodes[from].outDegree || 0) + 1
    if (graph.nodes[to]) graph.nodes[to].inDegree = (graph.nodes[to].inDegree || 0) + 1
  }

  normalizeIncoming(graph, to)
  return graph
}

export function removeEdge(graph, from, to) {
  const idx = graph.edges.findIndex(e => e.from === from && e.to === to)
  if (idx === -1) return graph
  graph.edges.splice(idx, 1)
  if (graph.nodes[from]) graph.nodes[from].outDegree = Math.max(0, (graph.nodes[from].outDegree || 0) - 1)
  if (graph.nodes[to]) graph.nodes[to].inDegree = Math.max(0, (graph.nodes[to].inDegree || 0) - 1)
  return graph
}

// Merge reinforcement data from a tagged question into the graph.
// Called when backfill adds an E: block or on content import.
export function mergeReinforcement(graph, primaryCode, primaryName, reinforcementByCode, objectiveList = []) {
  const loNameMap = Object.fromEntries((objectiveList || []).map(o => [o.code, o.name]))
  addNode(graph, primaryCode, loNameMap[primaryCode] || primaryName || primaryCode)
  Object.entries(reinforcementByCode || {}).forEach(([toCode, weight]) => {
    if (!toCode || toCode === primaryCode) return
    addNode(graph, toCode, loNameMap[toCode] || toCode)
    addEdge(graph, primaryCode, toCode, Number(weight) || 0)
  })
  return graph
}

export function recomputeDegrees(graph) {
  Object.values(graph.nodes).forEach(n => { n.inDegree = 0; n.outDegree = 0 })
  graph.edges.forEach(e => {
    if (graph.nodes[e.from]) graph.nodes[e.from].outDegree++
    if (graph.nodes[e.to]) graph.nodes[e.to].inDegree++
  })
  return graph
}

// File I/O — server-side only
async function ensureFile() {
  await fs.mkdir(path.dirname(GRAPH_FILE), { recursive: true })
  try { await fs.access(GRAPH_FILE) }
  catch { await fs.writeFile(GRAPH_FILE, JSON.stringify(emptyGraph(), null, 2) + "\n", "utf8") }
}

export async function readGraph() {
  await ensureFile()
  try {
    const raw = await fs.readFile(GRAPH_FILE, "utf8")
    const parsed = JSON.parse(raw)
    if (parsed?.nodes && Array.isArray(parsed?.edges)) return parsed
  } catch {}
  return emptyGraph()
}

export async function writeGraph(graph) {
  await ensureFile()
  await fs.writeFile(GRAPH_FILE, JSON.stringify(graph, null, 2) + "\n", "utf8")
}
