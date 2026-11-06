import { UserError, runGit, runGitOrThrow } from "./exec"
import { hasHead, readRemotes } from "./repo"

const LOCAL_TIMEOUT = 30_000
const NETWORK_TIMEOUT = 120_000

export async function stagePaths(root: string, paths: string[]) {
  if (!paths.length) return
  await runGitOrThrow(["add", "-A", "--", ...paths], root, { timeoutMs: LOCAL_TIMEOUT })
}

export async function stageAll(root: string) {
  await runGitOrThrow(["add", "-A"], root, { timeoutMs: LOCAL_TIMEOUT })
}

export async function unstagePaths(root: string, paths: string[]) {
  if (!paths.length) return

  if (await hasHead(root)) {
    await runGitOrThrow(["restore", "--staged", "--", ...paths], root, { timeoutMs: LOCAL_TIMEOUT })
  } else {
    // There is no HEAD to restore from in an unborn branch.
    await runGitOrThrow(
      ["rm", "--cached", "-r", "--ignore-unmatch", "--", ...paths],
      root,
      { timeoutMs: LOCAL_TIMEOUT },
    )
  }
}

export async function unstageAll(root: string) {
  if (await hasHead(root)) {
    await runGitOrThrow(["reset", "--quiet"], root, { timeoutMs: LOCAL_TIMEOUT })
  } else {
    await runGitOrThrow(
      ["rm", "--cached", "-r", "--ignore-unmatch", "--", "."],
      root,
      { timeoutMs: LOCAL_TIMEOUT },
    )
  }
}

export type DiscardTarget = {
  path: string
  untracked: boolean
}

/** Treat paths as literals so filenames containing glob characters stay safe. */
function literalPaths(paths: string[]): string[] {
  return paths.map((path) => `:(literal)${path}`)
}

/**
 * Discard unstaged changes for the given paths. Tracked files are restored
 * from the index (so staged content is preserved); untracked files are deleted.
 */
export async function discardUnstagedChanges(root: string, targets: DiscardTarget[]) {
  if (!targets.length) return

  const tracked = [
    ...new Set(targets.filter((target) => !target.untracked).map((target) => target.path)),
  ]
  const untracked = [
    ...new Set(targets.filter((target) => target.untracked).map((target) => target.path)),
  ]

  if (tracked.length) {
    await runGitOrThrow(["restore", "--worktree", "--", ...literalPaths(tracked)], root, {
      timeoutMs: LOCAL_TIMEOUT,
    })
  }

  if (untracked.length) {
    await runGitOrThrow(["clean", "-f", "--", ...literalPaths(untracked)], root, {
      timeoutMs: LOCAL_TIMEOUT,
    })
  }
}

export async function commitChanges(root: string, message: string, amend: boolean) {
  const args = ["commit", "-m", message]
  if (amend) args.push("--amend")
  return runGit(args, root, { timeoutMs: NETWORK_TIMEOUT })
}

export async function checkoutBranch(root: string, branch: string) {
  await runGitOrThrow(["switch", branch], root, { timeoutMs: 60_000 })
}

export async function fetchAll(root: string) {
  await runGitOrThrow(["fetch", "--all", "--prune"], root, { timeoutMs: NETWORK_TIMEOUT })
}

export async function pullRepo(root: string) {
  return runGit(["pull"], root, { timeoutMs: NETWORK_TIMEOUT })
}

export async function pushRepo(root: string) {
  const upstream = await runGit(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    root,
    { timeoutMs: 10_000 },
  )

  if (upstream.code === 0) {
    return runGit(["push"], root, { timeoutMs: NETWORK_TIMEOUT })
  }

  const remotes = await readRemotes(root)
  if (!remotes.length) {
    throw new UserError("No remotes configured. Add a remote before pushing.")
  }

  const remote = remotes.includes("origin") ? "origin" : remotes[0]!
  return runGit(["push", "-u", remote, "HEAD"], root, { timeoutMs: NETWORK_TIMEOUT })
}
