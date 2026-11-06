import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { runGitOrThrow } from "../src/git/exec"
import { scanRepos } from "../src/git/scan"

const dirs: string[] = []

function tempRoot(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`))
  dirs.push(dir)
  return dir
}

function makeRepo(path: string, branch: string) {
  mkdirSync(join(path, ".git"), { recursive: true })
  writeFileSync(join(path, ".git", "HEAD"), `ref: refs/heads/${branch}\n`)
}

async function makeRealRepo(path: string, branch = "main") {
  mkdirSync(path, { recursive: true })
  await runGitOrThrow(["init", "-b", branch], path)
  await runGitOrThrow(["config", "user.name", "Test User"], path)
  await runGitOrThrow(["config", "user.email", "test@example.com"], path)
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("scanRepos", () => {
  test("finds repositories, reads branches, prunes heavy directories and stops at repo roots", async () => {
    const rootA = tempRoot("gitui-scan-a")
    const rootB = tempRoot("gitui-scan-b")

    makeRepo(join(rootA, "projects", "repo-one"), "main")
    makeRepo(join(rootA, "projects", "repo-one", "nested"), "nested-branch")
    makeRepo(join(rootA, "node_modules", "package"), "ignored")
    makeRepo(join(rootA, ".hidden", "repo"), "ignored")
    mkdirSync(join(rootA, "plain", "deep"), { recursive: true })

    // A linked worktree style .git file pointing at a separate git dir.
    const worktree = join(rootA, "plain", "deep", "repo-two")
    mkdirSync(worktree, { recursive: true })
    writeFileSync(join(worktree, ".git"), "gitdir: ../../gitdirs/repo-two\n")
    mkdirSync(join(rootA, "plain", "gitdirs", "repo-two"), { recursive: true })
    writeFileSync(join(rootA, "plain", "gitdirs", "repo-two", "HEAD"), "ref: refs/heads/feature/x\n")

    makeRepo(join(rootB, "fit-app"), "master")

    const repos = await scanRepos([rootA, rootB])
    expect(repos.map((repo) => repo.relativePath)).toEqual([
      "plain/deep/repo-two",
      "projects/repo-one",
      "fit-app",
    ])
    expect(repos.map((repo) => repo.branch)).toEqual(["feature/x", "main", "master"])
    expect(repos.map((repo) => repo.rootLabel)).toEqual([
      basename(rootA),
      basename(rootA),
      basename(rootB),
    ])
  })

  test("reports whether the checked-out branch has uncommitted changes", async () => {
    const root = tempRoot("gitui-scan-dirty")
    const clean = join(root, "clean")
    const dirty = join(root, "dirty")

    await makeRealRepo(clean)
    writeFileSync(join(clean, "committed.txt"), "committed\n")
    await runGitOrThrow(["add", "-A"], clean)
    await runGitOrThrow(["commit", "-m", "initial"], clean)

    await makeRealRepo(dirty)
    writeFileSync(join(dirty, "untracked.txt"), "untracked\n")

    const repos = await scanRepos([root])
    const byPath = new Map(repos.map((repo) => [repo.path, repo]))
    expect(byPath.get(clean)?.dirty).toBe(false)
    expect(byPath.get(dirty)?.dirty).toBe(true)
  })

  test("returns an empty list for missing roots", async () => {
    const root = join(tempRoot("gitui-scan-empty"), "does-not-exist")
    expect(await scanRepos([root])).toEqual([])
  })
})
