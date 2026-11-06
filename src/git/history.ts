import type { BranchGraphData, Commit, CommitDetail, CommitFileDiff, GraphRow } from "../types"
import { GitError, runGit, runGitOrThrow } from "./exec"
import { capText } from "./text"

const LOG_FORMAT = "%H%x1f%h%x1f%ad%x1f%an%x1f%s%x1e"
const GRAPH_MARKER = "\x1e"
const GRAPH_FIELD = "\x1f"
const GRAPH_FORMAT = "%x1e%h%x1f%d%x1f%s%x1f%ad"
const GRAPH_LIMIT = 400
const EMPTY_HISTORY_PATTERNS = [
  /does not have any commits yet/i,
  /unknown revision or path not in the working tree/i,
  /ambiguous argument/i,
  /bad revision/i,
  /unknown revision/i,
]

export async function readLog(root: string, rev: string, limit = 100): Promise<Commit[]> {
  const result = await runGit(
    ["log", "-n", String(limit), "--date=short", `--pretty=format:${LOG_FORMAT}`, rev, "--"],
    root,
    { timeoutMs: 30_000 },
  )

  if (result.code !== 0) {
    if (EMPTY_HISTORY_PATTERNS.some((pattern) => pattern.test(result.stderr))) return []
    throw new GitError(result)
  }

  const commits: Commit[] = []
  for (const rawRecord of result.stdout.split("\x1e")) {
    const record = rawRecord.replace(/^[\r\n]+/, "")
    if (!record) continue
    const fields = record.split("\x1f")
    if (fields.length < 5) continue
    const [hash, shortHash, date, author, subject] = fields
    if (!hash || !shortHash) continue
    commits.push({
      hash,
      shortHash,
      date: date ?? "",
      author: author ?? "",
      subject: subject ?? "",
    })
  }
  return commits
}

/**
 * Read a graph of every local and remote branch. The marker is used to tell
 * commit rows from the graph's connector-only rows and to enforce the limit.
 */
export async function readBranchGraph(root: string, limit = GRAPH_LIMIT): Promise<BranchGraphData> {
  const result = await runGit(
    [
      "log",
      "--graph",
      "--date=short",
      "--decorate=short",
      "--no-color",
      `--pretty=format:${GRAPH_FORMAT}`,
      "-n",
      String(limit + 1),
      "--branches",
      "--remotes",
      "HEAD",
      "--",
    ],
    root,
    { timeoutMs: 30_000 },
  )

  if (result.code !== 0) {
    if (EMPTY_HISTORY_PATTERNS.some((pattern) => pattern.test(result.stderr))) {
      return { rows: [], truncated: false }
    }
    throw new GitError(result)
  }

  const kept: string[] = []
  let commits = 0
  let truncated = false

  for (const line of result.stdout.split("\n")) {
    if (line.includes(GRAPH_MARKER)) {
      if (commits >= limit) {
        truncated = true
        break
      }
      commits++
    }
    kept.push(line)
  }

  // Drop connector rows that belonged to the commit we removed.
  if (truncated) {
    let end = kept.length
    while (end > 0 && !kept[end - 1]!.includes(GRAPH_MARKER)) end--
    kept.length = end
  }
  while (kept.length > 0 && !kept[kept.length - 1]!.trim()) kept.pop()

  const rows: GraphRow[] = kept.map((line) => {
    const marker = line.indexOf(GRAPH_MARKER)
    if (marker < 0) return { graph: line, commit: null }

    const graph = line.slice(0, marker)
    const [shortHash = "", decorations = "", subject = "", date = ""] = line
      .slice(marker + GRAPH_MARKER.length)
      .split(GRAPH_FIELD)
    return {
      graph,
      commit: { shortHash, decorations: decorations.trim(), subject, date },
    }
  })

  return { rows, truncated }
}

function unquotePath(path: string): string {
  if (!path.startsWith('"') || !path.endsWith('"')) return path
  return path
    .slice(1, -1)
    .replace(/\\t/g, "\t")
    .replace(/\\n/g, "\n")
    .replace(/\\(["\\])/g, "$1")
}

/** Git appends a tab to `---`/`+++` paths that contain spaces. */
function diffPath(value: string | undefined): string | undefined {
  if (!value) return undefined
  const cleaned = unquotePath(value.replace(/\t$/, "")).trim()
  if (!cleaned || cleaned === "/dev/null") return undefined
  return cleaned.replace(/^[ab]\//, "")
}

/**
 * The diff renderable only parses the first file in a patch, so split a
 * multi-file patch into one entry per file before rendering.
 */
export function splitPatchByFile(patch: string): CommitFileDiff[] {
  if (!patch) return []

  return patch
    .split(/^(?=diff --git )/m)
    .filter((chunk) => chunk.startsWith("diff --git "))
    .map((chunk) => {
      const newline = chunk.indexOf("\n")
      const header = newline >= 0 ? chunk.slice(0, newline) : chunk
      const plus = chunk.match(/^\+\+\+ (.*)$/m)?.[1]
      const minus = chunk.match(/^--- (.*)$/m)?.[1]
      const headerPath = header.match(/^diff --git a\/(.+?) b\/(.+)$/)?.[2]
      const path = diffPath(plus) ?? diffPath(minus) ?? diffPath(headerPath) ?? "unknown file"

      return { path, patch: chunk }
    })
}

export async function readCommit(root: string, hash: string): Promise<CommitDetail> {
  const metadata = await runGitOrThrow(
    [
      "show",
      "-s",
      "--date=format:%Y-%m-%d %H:%M",
      "--format=%H%x1f%h%x1f%an%x1f%ae%x1f%ad%x1f%P%x1f%s%x1f%b",
      hash,
    ],
    root,
    { timeoutMs: 30_000 },
  )

  const fields = metadata.stdout.split("\x1f")
  const [
    fullHash = hash,
    shortHash = hash.slice(0, 7),
    author = "",
    email = "",
    date = "",
    parentsRaw = "",
    subject = "",
  ] = fields
  const body = fields.slice(7).join("\x1f").trim()
  const parents = parentsRaw.trim() ? parentsRaw.trim().split(/\s+/) : []
  const merge = parents.length > 1

  const diffArgs = merge
    ? ["diff", "--no-color", "--no-ext-diff", "--stat", "--patch", "--find-renames", parents[0]!, hash]
    : ["show", "--no-color", "--no-ext-diff", "--stat", "--patch", "--format=", "--find-renames", hash]

  const diff = await runGitOrThrow(diffArgs, root, { timeoutMs: 30_000 })
  const marker = diff.stdout.indexOf("diff --git ")
  const stat = (marker >= 0 ? diff.stdout.slice(0, marker) : diff.stdout).trimEnd()
  const rawPatch = marker >= 0 ? diff.stdout.slice(marker) : ""

  const cappedStat = capText(stat, 64 * 1024, 400)
  const cappedPatch = capText(rawPatch, 512 * 1024, 2500)
  const cappedBody = capText(body, 32 * 1024, 300)

  return {
    hash: fullHash,
    shortHash,
    author,
    email,
    date,
    subject,
    body: cappedBody.text,
    parents,
    merge,
    stat: cappedStat.text,
    patch: cappedPatch.text,
    files: splitPatchByFile(cappedPatch.text),
    truncated: cappedStat.truncated || cappedPatch.truncated || cappedBody.truncated,
  }
}
