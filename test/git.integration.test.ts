import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  commitChanges,
  createBranch,
  deleteLocalBranch,
  deleteRemoteBranch,
  discardUnstagedChanges,
  stageAll,
  stagePaths,
  unstagePaths,
} from "../src/git/actions"
import { readFilePreview } from "../src/git/diff"
import { runGit, runGitOrThrow } from "../src/git/exec"
import { readBranchGraph, readCommit, readLog } from "../src/git/history"
import { readBranches, readOperation, readStatus } from "../src/git/repo"
import { buildFileRows, groupRows, hasConflicts } from "../src/git/status"
import { readCommitTree } from "../src/git/tree"

const repos: string[] = []

async function makeRepo(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "gitui-test-"))
  repos.push(root)
  await runGitOrThrow(["init", "-b", "main"], root)
  await runGitOrThrow(["config", "user.name", "Test User"], root)
  await runGitOrThrow(["config", "user.email", "test@example.com"], root)
  return root
}

async function commitAll(root: string, message: string) {
  await runGitOrThrow(["add", "-A"], root)
  const result = await runGit(["commit", "-m", message], root)
  if (result.code !== 0) throw new Error(result.stderr || result.stdout)
}

afterEach(() => {
  for (const repo of repos.splice(0)) rmSync(repo, { recursive: true, force: true })
})

describe("git integration", () => {
  test("reads status and stages/unstages a file", async () => {
    const root = await makeRepo()
    writeFileSync(join(root, "tracked.txt"), "one\n")
    await commitAll(root, "initial")

    writeFileSync(join(root, "tracked.txt"), "one\ntwo\n")
    writeFileSync(join(root, "untracked.txt"), "new\n")

    let status = await readStatus(root)
    let rows = buildFileRows(status)
    expect(rows.some((row) => row.path === "tracked.txt" && row.section === "unstaged")).toBe(true)
    expect(rows.some((row) => row.path === "untracked.txt" && row.untracked)).toBe(true)

    await stagePaths(root, ["tracked.txt", "untracked.txt"])
    status = await readStatus(root)
    rows = buildFileRows(status)
    expect(rows.some((row) => row.path === "tracked.txt" && row.section === "staged")).toBe(true)
    expect(rows.some((row) => row.path === "untracked.txt" && row.section === "staged")).toBe(true)

    await unstagePaths(root, ["tracked.txt", "untracked.txt"])
    status = await readStatus(root)
    rows = buildFileRows(status)
    expect(rows.some((row) => row.path === "tracked.txt" && row.section === "unstaged")).toBe(true)
    expect(rows.some((row) => row.path === "untracked.txt" && row.section === "unstaged")).toBe(true)
  })

  test("discards unstaged changes but keeps staged changes", async () => {
    const root = await makeRepo()
    writeFileSync(join(root, "tracked.txt"), "one\n")
    await commitAll(root, "initial")

    writeFileSync(join(root, "tracked.txt"), "one\ntwo\n")
    await stagePaths(root, ["tracked.txt"])
    writeFileSync(join(root, "tracked.txt"), "one\ntwo\nthree\n")

    await discardUnstagedChanges(root, [{ path: "tracked.txt", untracked: false }])

    expect(readFileSync(join(root, "tracked.txt"), "utf8")).toBe("one\ntwo\n")
    expect((await runGitOrThrow(["diff", "--cached", "--", "tracked.txt"], root)).stdout).toContain("+two")
    expect((await runGitOrThrow(["diff", "--", "tracked.txt"], root)).stdout).toBe("")
  })

  test("discards untracked and deleted files", async () => {
    const root = await makeRepo()
    writeFileSync(join(root, "keep.txt"), "keep\n")
    writeFileSync(join(root, "gone.txt"), "gone\n")
    await commitAll(root, "initial")

    writeFileSync(join(root, "keep.txt"), "changed\n")
    rmSync(join(root, "gone.txt"))
    writeFileSync(join(root, "untracked.txt"), "new\n")
    mkdirSync(join(root, "nested"))
    writeFileSync(join(root, "nested", "file.txt"), "new\n")

    await discardUnstagedChanges(root, [
      { path: "keep.txt", untracked: false },
      { path: "gone.txt", untracked: false },
      { path: "untracked.txt", untracked: true },
      { path: "nested/file.txt", untracked: true },
    ])

    expect(readFileSync(join(root, "keep.txt"), "utf8")).toBe("keep\n")
    expect(readFileSync(join(root, "gone.txt"), "utf8")).toBe("gone\n")
    expect(existsSync(join(root, "untracked.txt"))).toBe(false)
    expect(existsSync(join(root, "nested", "file.txt"))).toBe(false)
    expect(buildFileRows(await readStatus(root))).toHaveLength(0)
  })

  test("treats discard paths literally", async () => {
    const root = await makeRepo()
    writeFileSync(join(root, "base.txt"), "base\n")
    await commitAll(root, "initial")
    writeFileSync(join(root, "file[1].txt"), "bracket\n")
    writeFileSync(join(root, "file1.txt"), "plain\n")

    await discardUnstagedChanges(root, [{ path: "file[1].txt", untracked: true }])

    expect(existsSync(join(root, "file[1].txt"))).toBe(false)
    expect(readFileSync(join(root, "file1.txt"), "utf8")).toBe("plain\n")
  })

  test("discards an unstaged change on an unborn branch", async () => {
    const root = await makeRepo()
    writeFileSync(join(root, "first.txt"), "first\n")
    await stagePaths(root, ["first.txt"])
    writeFileSync(join(root, "first.txt"), "first\nsecond\n")

    await discardUnstagedChanges(root, [{ path: "first.txt", untracked: false }])

    expect(readFileSync(join(root, "first.txt"), "utf8")).toBe("first\n")
    const rows = buildFileRows(await readStatus(root))
    expect(groupRows(rows).staged).toHaveLength(1)
    expect(groupRows(rows).unstaged).toHaveLength(0)
  })

  test("reads history of a non-checked-out branch", async () => {
    const root = await makeRepo()
    writeFileSync(join(root, "base.txt"), "base\n")
    await commitAll(root, "initial")

    await runGitOrThrow(["switch", "-c", "feature"], root)
    writeFileSync(join(root, "feature.txt"), "feature\n")
    writeFileSync(join(root, "second.txt"), "second\n")
    writeFileSync(join(root, "name with space.txt"), "space\n")
    await commitAll(root, "feature work")
    const featureHash = (await runGitOrThrow(["rev-parse", "HEAD"], root)).stdout.trim()

    await runGitOrThrow(["switch", "main"], root)
    writeFileSync(join(root, "main.txt"), "main\n")
    await commitAll(root, "main work")

    const status = await readStatus(root)
    const branches = await readBranches(root, status)
    expect(branches.find((branch) => branch.name === "main")?.current).toBe(true)
    expect(branches.find((branch) => branch.name === "feature")?.current).toBe(false)

    const featureLog = await readLog(root, "feature")
    expect(featureLog.map((commit) => commit.subject)).toContain("feature work")
    expect(featureLog.map((commit) => commit.subject)).toContain("initial")
    expect(featureLog.map((commit) => commit.subject)).not.toContain("main work")

    const detail = await readCommit(root, featureHash)
    expect(detail.subject).toBe("feature work")
    expect(detail.patch).toContain("feature.txt")
    expect(detail.patch).toContain("second.txt")
    expect(detail.stat).toContain("3 files changed")
    expect(detail.merge).toBe(false)

    const files = new Map(detail.files.map((file) => [file.path, file.patch]))
    expect(files.size).toBe(3)
    expect(files.get("feature.txt")).toContain("+feature")
    expect(files.get("second.txt")).toContain("+second")
    expect(files.get("name with space.txt")).toContain("+space")
  })

  test("reads a graph of all branches", async () => {
    const root = await makeRepo()
    writeFileSync(join(root, "base.txt"), "base\n")
    await commitAll(root, "initial")

    await runGitOrThrow(["switch", "-c", "feature"], root)
    writeFileSync(join(root, "feature.txt"), "feature\n")
    await commitAll(root, "feature work")

    await runGitOrThrow(["switch", "main"], root)
    writeFileSync(join(root, "main.txt"), "main\n")
    await commitAll(root, "main work")

    const graph = await readBranchGraph(root)
    const commits = graph.rows.flatMap((row) => (row.commit ? [row.commit] : []))
    expect(commits.map((commit) => commit.subject)).toContain("feature work")
    expect(commits.map((commit) => commit.subject)).toContain("main work")
    expect(commits.some((commit) => commit.decorations.includes("feature"))).toBe(true)
    expect(commits.every((commit) => /^[0-9a-f]+$/.test(commit.shortHash))).toBe(true)
    expect(graph.rows.some((row) => row.graph.includes("*"))).toBe(true)
    expect(graph.truncated).toBe(false)

    const limited = await readBranchGraph(root, 1)
    expect(limited.rows.filter((row) => row.commit)).toHaveLength(1)
    expect(limited.truncated).toBe(true)
  })

  test("reads the file tree of a commit", async () => {
    const root = await makeRepo()
    mkdirSync(join(root, "src", "components"), { recursive: true })
    writeFileSync(join(root, "README.md"), "# demo\n")
    writeFileSync(join(root, "src", "index.ts"), "export {}\n")
    writeFileSync(join(root, "src", "components", "App.tsx"), "export {}\n")
    await commitAll(root, "tree")

    const hash = (await runGitOrThrow(["rev-parse", "HEAD"], root)).stdout.trim()
    const tree = await readCommitTree(root, hash)
    const byPath = new Map(tree.rows.map((row) => [row.path, row]))

    expect(tree.total).toBe(3)
    expect(tree.truncated).toBe(false)
    expect(byPath.get("README.md")?.kind).toBe("file")
    expect(byPath.get("src")?.kind).toBe("dir")
    expect(byPath.get("src/components")?.kind).toBe("dir")
    expect(byPath.get("src/components/App.tsx")?.kind).toBe("file")

    const rootPaths = tree.rows.filter((row) => row.depth === 0).map((row) => row.path)
    expect(rootPaths).toEqual(["src", "README.md"])
    expect(byPath.get("src")?.prefix).toBe("├─ ")
    expect(byPath.get("README.md")?.prefix).toBe("└─ ")
    expect(byPath.get("src/components/App.tsx")?.prefix).toBe("│  │  └─ ")
  })

  test("creates and checks out a branch from a selected base branch", async () => {
    const root = await makeRepo()
    writeFileSync(join(root, "base.txt"), "base\n")
    await commitAll(root, "initial")

    await runGitOrThrow(["switch", "-c", "feature"], root)
    writeFileSync(join(root, "feature.txt"), "feature\n")
    await commitAll(root, "feature work")
    const featureHash = (await runGitOrThrow(["rev-parse", "HEAD"], root)).stdout.trim()
    await runGitOrThrow(["switch", "main"], root)

    await createBranch(root, "topic", "feature")

    const status = await readStatus(root)
    expect(status.head).toBe("topic")
    expect((await runGitOrThrow(["rev-parse", "HEAD"], root)).stdout.trim()).toBe(featureHash)
    const branches = await readBranches(root, status)
    expect(branches.find((branch) => branch.name === "topic")?.current).toBe(true)
  })

  test("creates a branch on an unborn repository", async () => {
    const root = await makeRepo()

    await createBranch(root, "topic", null)

    const status = await readStatus(root)
    expect(status.head).toBe("topic")
    expect(status.unborn).toBe(true)
  })

  test("deletes a local branch and its upstream remote branch", async () => {
    const root = await makeRepo()
    const remote = mkdtempSync(join(tmpdir(), "gitui-remote-"))
    repos.push(remote)
    await runGitOrThrow(["init", "--bare", "-b", "main"], remote)
    await runGitOrThrow(["remote", "add", "origin", remote], root)

    writeFileSync(join(root, "base.txt"), "base\n")
    await commitAll(root, "initial")
    await runGitOrThrow(["push", "-u", "origin", "main"], root)

    await runGitOrThrow(["switch", "-c", "feature"], root)
    await runGitOrThrow(["push", "-u", "origin", "feature"], root)
    await runGitOrThrow(["switch", "main"], root)

    const feature = (await readBranches(root, await readStatus(root))).find(
      (branch) => branch.name === "feature",
    )
    expect(feature?.upstream).toBe("origin/feature")
    expect(feature?.upstreamRemote).toBe("origin")
    expect(feature?.upstreamBranch).toBe("feature")

    await deleteRemoteBranch(root, "origin", "feature")
    const remoteBranches = (
      await runGitOrThrow(["for-each-ref", "--format=%(refname:short)", "refs/heads"], remote)
    ).stdout
      .split("\n")
      .filter(Boolean)
    expect(remoteBranches).toEqual(["main"])

    await deleteLocalBranch(root, "feature")
    const remaining = await readBranches(root, await readStatus(root))
    expect(remaining.some((branch) => branch.name === "feature")).toBe(false)
  })

  test("refuses to delete an unmerged local branch", async () => {
    const root = await makeRepo()
    writeFileSync(join(root, "base.txt"), "base\n")
    await commitAll(root, "initial")

    await runGitOrThrow(["switch", "-c", "feature"], root)
    writeFileSync(join(root, "feature.txt"), "feature\n")
    await commitAll(root, "feature work")
    await runGitOrThrow(["switch", "main"], root)

    await expect(deleteLocalBranch(root, "feature")).rejects.toThrow()
    expect(
      (await runGit(["rev-parse", "--verify", "-q", "refs/heads/feature"], root)).code,
    ).toBe(0)
  })

  test("supports the initial commit on an unborn branch", async () => {
    const root = await makeRepo()
    writeFileSync(join(root, "first.txt"), "first\n")

    let status = await readStatus(root)
    expect(status.unborn).toBe(true)
    expect(status.head).toBe("main")
    expect(await readLog(root, "main")).toEqual([])
    expect((await readBranchGraph(root)).rows).toEqual([])

    await stagePaths(root, ["first.txt"])
    status = await readStatus(root)
    expect(groupRows(buildFileRows(status)).staged).toHaveLength(1)

    await unstagePaths(root, ["first.txt"])
    status = await readStatus(root)
    expect(groupRows(buildFileRows(status)).unstaged).toHaveLength(1)

    await stageAll(root)
    const result = await commitChanges(root, "initial commit", false)
    expect(result.code).toBe(0)

    const log = await readLog(root, "main")
    expect(log).toHaveLength(1)
    expect(log[0]?.subject).toBe("initial commit")
  })

  test("stages and unstages a rename using both paths", async () => {
    const root = await makeRepo()
    writeFileSync(join(root, "old.txt"), "content\n")
    await commitAll(root, "initial")

    await runGitOrThrow(["mv", "old.txt", "new.txt"], root)
    let status = await readStatus(root)
    const renamed = buildFileRows(status).find((row) => row.section === "staged")
    expect(renamed?.origPath).toBe("old.txt")
    expect(renamed?.path).toBe("new.txt")

    await unstagePaths(root, ["old.txt", "new.txt"])
    status = await readStatus(root)
    const rows = buildFileRows(status)
    expect(rows.some((row) => row.path === "old.txt" && row.section === "unstaged" && row.code === "D")).toBe(true)
    expect(rows.some((row) => row.path === "new.txt" && row.untracked)).toBe(true)
  })

  test("reads an untracked file diff", async () => {
    const root = await makeRepo()
    writeFileSync(join(root, "notes.txt"), "hello\nworld\n")

    const preview = await readFilePreview(root, {
      kind: "file",
      key: "unstaged:notes.txt",
      path: "notes.txt",
      section: "unstaged",
      untracked: true,
    })

    expect(preview.mode).toBe("diff")
    expect(preview.binary).toBe(false)
    expect(preview.text).toContain("+hello")
    expect(preview.text).toContain("+world")
  })

  test("detects in-progress operations", async () => {
    const root = await makeRepo()
    writeFileSync(join(root, "a.txt"), "a\n")
    await commitAll(root, "initial")
    expect(await readOperation(root)).toBeNull()

    writeFileSync(join(root, ".git", "MERGE_HEAD"), "deadbeef\n")
    expect(await readOperation(root)).toBe("merge")
    rmSync(join(root, ".git", "MERGE_HEAD"))

    mkdirSync(join(root, ".git", "rebase-merge"), { recursive: true })
    expect(await readOperation(root)).toBe("rebase")
  })

  test("detects and stages a conflict, then commits the merge", async () => {
    const root = await makeRepo()
    writeFileSync(join(root, "conflict.txt"), "base\n")
    await commitAll(root, "initial")

    await runGitOrThrow(["switch", "-c", "other"], root)
    writeFileSync(join(root, "conflict.txt"), "other\n")
    await commitAll(root, "other change")

    await runGitOrThrow(["switch", "main"], root)
    writeFileSync(join(root, "conflict.txt"), "main\n")
    await commitAll(root, "main change")

    const merge = await runGit(["merge", "other"], root)
    expect(merge.code).not.toBe(0)

    let status = await readStatus(root)
    expect(hasConflicts(status)).toBe(true)
    const conflictRow = buildFileRows(status).find((row) => row.section === "conflicted")
    expect(conflictRow?.path).toBe("conflict.txt")

    const preview = await readFilePreview(root, {
      kind: "file",
      key: "conflict:conflict.txt",
      path: "conflict.txt",
      section: "conflicted",
      untracked: false,
    })
    expect(preview.mode).toBe("content")
    expect(preview.text).toContain("<<<<<<<")

    await stagePaths(root, ["conflict.txt"])
    status = await readStatus(root)
    expect(hasConflicts(status)).toBe(false)

    const result = await commitChanges(root, "merge other", false)
    expect(result.code).toBe(0)

    const mergeHash = (await runGitOrThrow(["rev-parse", "HEAD"], root)).stdout.trim()
    const detail = await readCommit(root, mergeHash)
    expect(detail.merge).toBe(true)
    expect(detail.parents).toHaveLength(2)
  })
})
