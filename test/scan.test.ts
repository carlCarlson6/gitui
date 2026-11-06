import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
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

  test("returns an empty list for missing roots", async () => {
    const root = join(tempRoot("gitui-scan-empty"), "does-not-exist")
    expect(await scanRepos([root])).toEqual([])
  })
})
