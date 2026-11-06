import { existsSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import type { Branch, StatusSnapshot } from "../types"
import { GitError, UserError, runGit, runGitOrThrow } from "./exec"
import { parseStatus } from "./status"

export async function discoverRepo(startPath: string): Promise<string> {
  let stat
  try {
    stat = statSync(startPath)
  } catch {
    throw new UserError(`Path does not exist: ${startPath}`)
  }

  if (!stat.isDirectory()) {
    throw new UserError(`Not a directory: ${startPath}`)
  }

  const result = await runGit(["rev-parse", "--show-toplevel"], startPath, { timeoutMs: 5000 })
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim()
    throw new UserError(`Not a git repository: ${startPath}${detail ? `\n\n${detail}` : ""}`)
  }

  const root = result.stdout.trim()
  if (!root) throw new UserError(`Could not determine the repository root for ${startPath}`)
  return root
}

export async function readStatus(root: string): Promise<StatusSnapshot> {
  const result = await runGitOrThrow(
    ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"],
    root,
  )
  return parseStatus(result.stdout)
}

export type Operation = "merge" | "rebase" | "cherry-pick" | "revert" | null

/**
 * Detect an in-progress merge/rebase/cherry-pick/revert by looking in the
 * repository's git dir. Resolving conflicts does not clear these markers;
 * finishing the operation does.
 */
export async function readOperation(root: string): Promise<Operation> {
  const result = await runGit(["rev-parse", "--git-dir"], root, { timeoutMs: 5000 })
  if (result.code !== 0) return null

  const gitDir = resolve(root, result.stdout.trim())
  if (existsSync(join(gitDir, "rebase-merge")) || existsSync(join(gitDir, "rebase-apply"))) {
    return "rebase"
  }
  if (existsSync(join(gitDir, "MERGE_HEAD"))) return "merge"
  if (existsSync(join(gitDir, "CHERRY_PICK_HEAD"))) return "cherry-pick"
  if (existsSync(join(gitDir, "REVERT_HEAD"))) return "revert"
  return null
}

function ensureCurrentBranch(branches: Branch[], status: StatusSnapshot): Branch[] {
  const list = branches.map((branch) => ({ ...branch, current: branch.name === status.head }))
  if (status.head && !list.some((branch) => branch.name === status.head)) {
    list.unshift({ name: status.head, current: true })
  }
  return list
}

export async function readBranches(root: string, status: StatusSnapshot): Promise<Branch[]> {
  const result = await runGitOrThrow(
    ["for-each-ref", "--format=%(refname:short)%09%(upstream:short)", "refs/heads"],
    root,
  )

  const branches: Branch[] = []
  for (const line of result.stdout.split("\n")) {
    if (!line.trim()) continue
    const [name, upstream] = line.split("\t")
    if (!name) continue
    branches.push({
      name,
      current: name === status.head,
      upstream: upstream?.trim() || undefined,
    })
  }

  return ensureCurrentBranch(branches, status)
}

export async function readRemotes(root: string): Promise<string[]> {
  const result = await runGit(["remote"], root, { timeoutMs: 10_000 })
  if (result.code !== 0) throw new GitError(result)
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

export async function readLastCommitMessage(root: string): Promise<string> {
  const result = await runGit(["log", "-1", "--pretty=%B"], root, { timeoutMs: 10_000 })
  if (result.code !== 0) return ""
  return result.stdout.trimEnd()
}

export async function hasHead(root: string): Promise<boolean> {
  const result = await runGit(["rev-parse", "--verify", "-q", "HEAD"], root, { timeoutMs: 10_000 })
  return result.code === 0
}
