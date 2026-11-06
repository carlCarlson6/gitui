export type GitResult = {
  code: number
  stdout: string
  stderr: string
  timedOut: boolean
  command: string
}

export type GitOptions = {
  timeoutMs?: number
  env?: Record<string, string>
}

export class GitError extends Error {
  constructor(public readonly result: GitResult) {
    super(
      result.timedOut
        ? `git command timed out: ${result.command}`
        : `git command failed (${result.code}): ${result.command}`,
    )
    this.name = "GitError"
  }
}

export class UserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UserError"
  }
}

function quoteArg(arg: string): string {
  return /^[A-Za-z0-9_./:=@+-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`
}

function commandLine(args: string[]): string {
  return ["git", ...args].map(quoteArg).join(" ")
}

function gitEnv(extra?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "true",
    GIT_EDITOR: "true",
    GIT_SEQUENCE_EDITOR: "true",
    GIT_PAGER: "cat",
    GIT_MERGE_AUTOEDIT: "no",
    GIT_OPTIONAL_LOCKS: "0",
    PAGER: "cat",
    LC_ALL: "C",
    LANG: "C",
  }

  if (!env.GIT_SSH_COMMAND) {
    env.GIT_SSH_COMMAND = "ssh -oBatchMode=yes"
  }

  return { ...env, ...extra }
}

/**
 * Run git without a shell. Network / hook commands get a longer timeout.
 * All commands are non-interactive so they can never take over the TUI.
 */
export async function runGit(args: string[], cwd: string, options: GitOptions = {}): Promise<GitResult> {
  const command = commandLine(args)
  const timeoutMs = options.timeoutMs ?? 30_000

  let proc: Bun.Subprocess<"ignore", "pipe", "pipe">
  try {
    proc = Bun.spawn(["git", ...args], {
      cwd,
      env: gitEnv(options.env),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    })
  } catch (error) {
    return {
      code: -1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      timedOut: false,
      command,
    }
  }

  let timedOut = false
  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true
          try {
            proc.kill()
          } catch {
            // The process may already have exited.
          }
        }, timeoutMs)
      : undefined
  const hardKill =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true
          try {
            proc.kill("SIGKILL")
          } catch {
            // The process may already have exited.
          }
        }, timeoutMs + 2000)
      : undefined

  const stdoutPromise = new Response(proc.stdout).text().catch(() => "")
  const stderrPromise = new Response(proc.stderr).text().catch(() => "")

  const code = await proc.exited.catch(() => -1)
  if (timer) clearTimeout(timer)
  if (hardKill) clearTimeout(hardKill)

  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise])
  return { code, stdout, stderr, timedOut, command }
}

export async function runGitOrThrow(args: string[], cwd: string, options: GitOptions = {}): Promise<GitResult> {
  const result = await runGit(args, cwd, options)
  if (result.code !== 0) throw new GitError(result)
  return result
}

export function errorToText(error: unknown): string {
  if (error instanceof GitError) {
    const parts = [`$ ${error.result.command}`]
    if (error.result.timedOut) {
      parts.push("Timed out. The command may be waiting for credentials or an editor.")
    }
    if (error.result.stdout.trim()) parts.push(`stdout:\n${error.result.stdout.trimEnd()}`)
    if (error.result.stderr.trim()) parts.push(`stderr:\n${error.result.stderr.trimEnd()}`)
    return parts.join("\n\n")
  }
  if (error instanceof Error) return error.message
  return String(error)
}

export function errorTitle(error: unknown): string {
  if (error instanceof GitError) return error.result.timedOut ? "Git command timed out" : "Git command failed"
  if (error instanceof UserError) return "Cannot continue"
  return "Error"
}
