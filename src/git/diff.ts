import { statSync } from "node:fs"
import { join } from "node:path"
import type { FilePreviewData, Preview } from "../types"
import { GitError, runGit } from "./exec"
import { capText, looksBinary } from "./text"

type FilePreview = Extract<Preview, { kind: "file" }>

const MAX_READ = 512 * 1024

async function readWorkingFile(root: string, path: string): Promise<FilePreviewData> {
  const absolute = join(root, path)

  let stat
  try {
    stat = statSync(absolute)
  } catch {
    return {
      text: "(This file is missing from the working tree.)",
      mode: "content",
      binary: false,
      truncated: false,
    }
  }

  if (!stat.isFile()) {
    return {
      text: "(Not a regular file.)",
      mode: "content",
      binary: false,
      truncated: false,
    }
  }

  const file = Bun.file(absolute)
  const slice = file.slice(0, MAX_READ + 1)
  const text = await slice.text()
  const truncated = text.length > MAX_READ || stat.size > MAX_READ
  const clipped = text.slice(0, MAX_READ)

  if (looksBinary(clipped)) {
    return {
      text: "",
      mode: "content",
      binary: true,
      truncated: false,
      note: "Binary file — preview unavailable.",
    }
  }

  return {
    text: clipped,
    mode: "content",
    binary: false,
    truncated,
    note: "Unresolved conflict. Resolve it in your editor, then stage the file to mark it resolved.",
  }
}

function isBinaryDiff(text: string): boolean {
  return /^Binary files .* differ$/m.test(text) || /^GIT binary patch$/m.test(text)
}

async function readUntrackedDiff(root: string, path: string): Promise<FilePreviewData> {
  const result = await runGit(
    ["diff", "--no-index", "--no-color", "--no-ext-diff", "--", "/dev/null", path],
    root,
    { timeoutMs: 30_000 },
  )

  if (result.code !== 0 && result.code !== 1) throw new GitError(result)

  if (!result.stdout) {
    return { text: "", mode: "diff", binary: false, truncated: false, note: "Empty file." }
  }

  if (isBinaryDiff(result.stdout)) {
    return { text: "", mode: "diff", binary: true, truncated: false, note: "Binary file — preview unavailable." }
  }

  const capped = capText(result.stdout)
  return { text: capped.text, mode: "diff", binary: false, truncated: capped.truncated }
}

export async function readFilePreview(root: string, preview: FilePreview): Promise<FilePreviewData> {
  if (preview.section === "conflicted") {
    return readWorkingFile(root, preview.path)
  }

  if (preview.untracked) {
    return readUntrackedDiff(root, preview.path)
  }

  const paths = preview.origPath ? [preview.origPath, preview.path] : [preview.path]
  const args =
    preview.section === "staged"
      ? ["diff", "--cached", "--no-color", "--no-ext-diff", "--find-renames", "--", ...paths]
      : ["diff", "--no-color", "--no-ext-diff", "--find-renames", "--", ...paths]

  const result = await runGit(args, root, { timeoutMs: 30_000 })
  if (result.code !== 0) throw new GitError(result)

  if (!result.stdout) {
    return { text: "", mode: "diff", binary: false, truncated: false }
  }

  if (isBinaryDiff(result.stdout)) {
    return { text: "", mode: "diff", binary: true, truncated: false, note: "Binary file — preview unavailable." }
  }

  const capped = capText(result.stdout)
  return { text: capped.text, mode: "diff", binary: false, truncated: capped.truncated }
}

export { readUntrackedDiff }
