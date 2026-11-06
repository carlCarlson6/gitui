import { readdir, readFile, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, join, relative, resolve } from "node:path"
import type { RepoEntry } from "../types"

const MAX_DEPTH = 8

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "target",
  "vendor",
  "Pods",
  "DerivedData",
  "coverage",
  "tmp",
  "temp",
])

function expandHome(path: string): string {
  if (path === "~") return homedir()
  if (path.startsWith("~/")) return join(homedir(), path.slice(2))
  return resolve(path)
}

export function defaultRepoRoots(): string[] {
  const override = process.env.GITUI_REPO_ROOTS
  if (override) {
    const roots = override
      .split(":")
      .map((root) => root.trim())
      .filter(Boolean)
      .map(expandHome)
    if (roots.length > 0) return [...new Set(roots)]
  }

  return [join(homedir(), "DEV"), join(homedir(), "FIT")]
}

async function readBranch(repoPath: string): Promise<string | undefined> {
  const dotGit = join(repoPath, ".git")
  try {
    let gitDir = dotGit
    const dotGitStat = await stat(dotGit)
    if (dotGitStat.isFile()) {
      const text = await readFile(dotGit, "utf8")
      const match = /^gitdir:\s*(.+)$/m.exec(text)
      if (!match) return undefined
      gitDir = resolve(repoPath, match[1]!.trim())
    }

    const head = (await readFile(join(gitDir, "HEAD"), "utf8")).trim()
    if (head.startsWith("ref: ")) {
      const ref = head.slice(5).trim()
      return ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref
    }
    return head.slice(0, 7)
  } catch {
    return undefined
  }
}

async function walk(
  dir: string,
  root: string,
  depth: number,
  results: RepoEntry[],
  seen: Set<string>,
): Promise<void> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  // Stop at the first repository boundary. This keeps submodules and nested
  // worktrees out of the picker as separate entries.
  if (entries.some((entry) => entry.name === ".git")) {
    const path = resolve(dir)
    if (seen.has(path)) return
    seen.add(path)

    const name = basename(path)
    results.push({
      name,
      path,
      root,
      rootLabel: basename(root) || root,
      relativePath: relative(root, path) || name,
      branch: await readBranch(path),
    })
    return
  }

  if (depth >= MAX_DEPTH) return

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith(".")) continue
    if (SKIP_DIRS.has(entry.name)) continue
    await walk(join(dir, entry.name), root, depth + 1, results, seen)
  }
}

export async function scanRepos(roots: string[]): Promise<RepoEntry[]> {
  const seen = new Set<string>()
  const results: RepoEntry[] = []

  for (const inputRoot of roots) {
    const root = expandHome(inputRoot)
    const found: RepoEntry[] = []
    await walk(root, root, 0, found, seen)
    found.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: "base" }))
    results.push(...found)
  }

  return results
}
