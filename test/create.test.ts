import { afterEach, describe, expect, test } from "bun:test"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRepo, normalizeRepoName, repoNameProblem } from "../src/git/create"

const dirs: string[] = []

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("repository names", () => {
  test("normalizes spaces and validates GitHub-safe names", () => {
    expect(normalizeRepoName("  new app  ")).toBe("new-app")
    expect(repoNameProblem("new-app")).toBeNull()
    expect(repoNameProblem("New.App_2")).toBeNull()
    expect(repoNameProblem("")).not.toBeNull()
    expect(repoNameProblem("..")).not.toBeNull()
    expect(repoNameProblem(".hidden")).not.toBeNull()
    expect(repoNameProblem("bad/name")).not.toBeNull()
  })
})

describe("createRepo", () => {
  test("creates the folder, initializes git and creates a public GitHub repository", async () => {
    const dev = tempDir("gitui-dev")
    const bin = tempDir("gitui-bin")
    const argsFile = join(tempDir("gitui-args"), "args.txt")
    const gh = join(bin, "gh")
    writeFileSync(
      gh,
      `#!/bin/sh
if [ "$1" = "api" ]; then
  echo "example"
  exit 0
fi
printf '%s\\n' "$@" > "$GH_ARGS_FILE"
echo "https://github.com/example/new-app"
`,
    )
    chmodSync(gh, 0o755)

    const previousPath = process.env.PATH
    const previousArgsFile = process.env.GH_ARGS_FILE
    process.env.PATH = `${bin}:${previousPath ?? ""}`
    process.env.GH_ARGS_FILE = argsFile
    try {
      const created = await createRepo(dev, "new app")

      expect(created.name).toBe("new-app")
      expect(created.path).toBe(join(dev, "new-app"))
      expect(created.url).toBe("https://github.com/example/new-app")
      expect(existsSync(join(created.path, ".git"))).toBe(true)
      expect(readFileSync(argsFile, "utf8").trim().split("\n")).toEqual([
        "repo",
        "create",
        "new-app",
        "--public",
        "--source",
        created.path,
        "--remote",
        "origin",
      ])
    } finally {
      if (previousPath === undefined) delete process.env.PATH
      else process.env.PATH = previousPath
      if (previousArgsFile === undefined) delete process.env.GH_ARGS_FILE
      else process.env.GH_ARGS_FILE = previousArgsFile
    }
  })

  test("does not create a folder when gh is not authenticated", async () => {
    const dev = tempDir("gitui-dev-auth")
    const bin = tempDir("gitui-bin-auth")
    const gh = join(bin, "gh")
    writeFileSync(gh, "#!/bin/sh\nexit 1\n")
    chmodSync(gh, 0o755)

    const previousPath = process.env.PATH
    process.env.PATH = `${bin}:${previousPath ?? ""}`
    try {
      await expect(createRepo(dev, "private-one")).rejects.toThrow(/verify your GitHub CLI login/)
      expect(existsSync(join(dev, "private-one"))).toBe(false)
    } finally {
      if (previousPath === undefined) delete process.env.PATH
      else process.env.PATH = previousPath
    }
  })

  test("refuses to reuse an existing folder", async () => {
    const dev = tempDir("gitui-dev-existing")
    mkdirSync(join(dev, "taken"))

    await expect(createRepo(dev, "taken")).rejects.toThrow(/already exists/)
  })
})
