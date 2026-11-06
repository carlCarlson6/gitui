import { existsSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { UserError, runGit, runProcess, type CommandResult } from "./exec"

const GIT_TIMEOUT_MS = 30_000
const GH_AUTH_TIMEOUT_MS = 30_000
const GH_CREATE_TIMEOUT_MS = 120_000

// GitHub repository names: letters, numbers, dots, hyphens and underscores.
// A leading dot is rejected so the folder cannot become hidden.
const VALID_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export function normalizeRepoName(raw: string): string {
  return raw.trim().replaceAll(" ", "-")
}

export function repoNameProblem(name: string): string | null {
  if (!name) return "A repository name is required."
  if (name === "." || name === "..") return "Choose a different repository name."
  if (name.length > 100) return "Keep the repository name to 100 characters or fewer."
  if (!VALID_NAME.test(name)) {
    return "Use letters, numbers, dots, hyphens and underscores, and start with a letter or number."
  }
  return null
}

function ghEnv(): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    GH_PROMPT_DISABLED: "1",
    GH_NO_UPDATE_NOTIFIER: "1",
    NO_COLOR: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "true",
  }
}

function failureDetail(result: CommandResult): string {
  return [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n").trim()
}

async function runGh(args: string[], cwd: string, timeoutMs: number): Promise<CommandResult> {
  return runProcess(["gh", ...args], cwd, { timeoutMs, env: ghEnv() })
}

async function ensureGhReady(devRoot: string): Promise<void> {
  const auth = await runGh(["api", "user", "--jq", ".login"], devRoot, GH_AUTH_TIMEOUT_MS)
  if (auth.code === 0) return

  const detail = failureDetail(auth)
  if (auth.code === -1) {
    throw new UserError(
      "The GitHub CLI (gh) is not available. Install it from https://cli.github.com, then run `gh auth login`." +
        (detail ? `\n\n${detail}` : ""),
    )
  }

  throw new UserError(
    "Could not verify your GitHub CLI login. Run `gh auth login` and check your network connection." +
      (detail ? `\n\n${detail}` : ""),
  )
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined
  return String((error as { code: unknown }).code)
}

export type CreatedRepo = {
  name: string
  path: string
  url?: string
}

/**
 * Create a folder under the DEV root, initialize a git repository inside it,
 * and create a matching public repository on GitHub using the authenticated
 * GitHub CLI. The local folder is created only after gh reports a usable login.
 */
export async function createRepo(devRoot: string, rawName: string): Promise<CreatedRepo> {
  const name = normalizeRepoName(rawName)
  const problem = repoNameProblem(name)
  if (problem) throw new UserError(problem)

  const path = join(devRoot, name)
  if (existsSync(path)) throw new UserError(`A folder already exists at ${path}.`)

  await ensureGhReady(devRoot)

  await mkdir(devRoot, { recursive: true })
  try {
    await mkdir(path)
  } catch (error) {
    if (errorCode(error) === "EEXIST") {
      throw new UserError(`A folder already exists at ${path}.`)
    }
    throw error
  }

  const init = await runGit(["init"], path, { timeoutMs: GIT_TIMEOUT_MS })
  if (init.code !== 0) {
    const detail = failureDetail(init)
    throw new UserError(
      `Created ${path}, but git init failed.` + (detail ? `\n\n${detail}` : ""),
    )
  }

  const create = await runGh(
    ["repo", "create", name, "--public", "--source", path, "--remote", "origin"],
    path,
    GH_CREATE_TIMEOUT_MS,
  )
  if (create.code !== 0) {
    throw new UserError(
      `Created the local repository at ${path}, but the public GitHub repository could not be created.\n\n${
        failureDetail(create) || "gh repo create failed."
      }`,
    )
  }

  const url = /https:\/\/github\.com\/\S+/.exec(create.stdout)?.[0]
  return { name, path, url }
}
