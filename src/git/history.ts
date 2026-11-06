import type { Commit, CommitDetail } from "../types"
import { GitError, runGit, runGitOrThrow } from "./exec"
import { capText } from "./text"

const LOG_FORMAT = "%H%x1f%h%x1f%ad%x1f%an%x1f%s%x1e"
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
    truncated: cappedStat.truncated || cappedPatch.truncated || cappedBody.truncated,
  }
}
