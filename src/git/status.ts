import type { FileRow, FileSection, StatusEntry, StatusSnapshot } from "../types"

type ParseState = {
  oid: string | null
  head: string | null
  detached: boolean
  unborn: boolean
  upstream: string | null
  ahead: number
  behind: number
  entries: StatusEntry[]
}

/**
 * Parse `git status --porcelain=v2 --branch -z --untracked-files=all`.
 *
 * Each NUL-delimited record is handled separately. Rename records (`2 ...`)
 * carry the original path as the next NUL-delimited record, so that record is
 * consumed explicitly.
 */
export function parseStatus(raw: string): StatusSnapshot {
  const state: ParseState = {
    oid: null,
    head: null,
    detached: false,
    unborn: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    entries: [],
  }

  const tokens = raw.split("\0")

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token) continue

    if (token.startsWith("# branch.oid ")) {
      const value = token.slice("# branch.oid ".length).replace(/\r?\n$/, "")
      if (value === "(initial)") {
        state.oid = null
        state.unborn = true
      } else {
        state.oid = value
      }
      continue
    }

    if (token.startsWith("# branch.head ")) {
      const value = token.slice("# branch.head ".length).replace(/\r?\n$/, "")
      if (value === "(detached)") {
        state.head = null
        state.detached = true
      } else {
        state.head = value
        state.detached = false
      }
      continue
    }

    if (token.startsWith("# branch.upstream ")) {
      state.upstream = token.slice("# branch.upstream ".length).replace(/\r?\n$/, "")
      continue
    }

    if (token.startsWith("# branch.ab ")) {
      const match = /^\+(\d+) -(\d+)$/.exec(token.slice("# branch.ab ".length).replace(/\r?\n$/, ""))
      if (match) {
        state.ahead = Number(match[1])
        state.behind = Number(match[2])
      }
      continue
    }

    if (token.startsWith("# ")) continue

    if (token.startsWith("1 ")) {
      const parts = token.split(" ")
      if (parts.length < 9) continue
      const xy = parts[1] ?? ".."
      state.entries.push({
        path: parts.slice(8).join(" "),
        x: xy[0] ?? ".",
        y: xy[1] ?? ".",
        untracked: false,
        unmerged: false,
      })
      continue
    }

    if (token.startsWith("2 ")) {
      const parts = token.split(" ")
      if (parts.length < 10) continue
      const xy = parts[1] ?? ".."
      const path = parts.slice(9).join(" ")
      const origPath = tokens[i + 1]?.replace(/\0/g, "")
      if (origPath !== undefined) i++
      state.entries.push({
        path,
        origPath,
        x: xy[0] ?? ".",
        y: xy[1] ?? ".",
        untracked: false,
        unmerged: false,
      })
      continue
    }

    if (token.startsWith("u ")) {
      const parts = token.split(" ")
      if (parts.length < 11) continue
      const xy = parts[1] ?? "UU"
      state.entries.push({
        path: parts.slice(10).join(" "),
        x: xy[0] ?? "U",
        y: xy[1] ?? "U",
        untracked: false,
        unmerged: true,
      })
      continue
    }

    if (token.startsWith("? ")) {
      state.entries.push({
        path: token.slice(2),
        x: "?",
        y: "?",
        untracked: true,
        unmerged: false,
      })
      continue
    }

    // "! path" ignored files are not requested, but tolerate them.
  }

  return {
    oid: state.oid,
    head: state.head,
    detached: state.detached,
    unborn: state.unborn,
    upstream: state.upstream,
    ahead: state.ahead,
    behind: state.behind,
    entries: state.entries,
  }
}

/**
 * Flatten a status snapshot into selectable rows. A file with both staged and
 * unstaged changes intentionally appears twice.
 */
export function buildFileRows(status: StatusSnapshot): FileRow[] {
  const conflicted: FileRow[] = []
  const staged: FileRow[] = []
  const unstaged: FileRow[] = []

  for (const entry of status.entries) {
    if (entry.unmerged) {
      conflicted.push({
        key: `conflict:${entry.path}`,
        path: entry.path,
        origPath: entry.origPath,
        section: "conflicted",
        code: `${entry.x}${entry.y}`,
        untracked: false,
      })
      continue
    }

    if (entry.untracked) {
      unstaged.push({
        key: `unstaged:${entry.path}`,
        path: entry.path,
        section: "unstaged",
        code: "?",
        untracked: true,
      })
      continue
    }

    if (entry.x !== ".") {
      staged.push({
        key: `staged:${entry.path}`,
        path: entry.path,
        origPath: entry.origPath,
        section: "staged",
        code: entry.x,
        untracked: false,
      })
    }

    if (entry.y !== ".") {
      unstaged.push({
        key: `unstaged:${entry.path}`,
        path: entry.path,
        origPath: entry.origPath,
        section: "unstaged",
        code: entry.y,
        untracked: false,
      })
    }
  }

  return [...conflicted, ...staged, ...unstaged]
}

export function groupRows(rows: FileRow[]): Record<FileSection, FileRow[]> {
  return {
    conflicted: rows.filter((row) => row.section === "conflicted"),
    staged: rows.filter((row) => row.section === "staged"),
    unstaged: rows.filter((row) => row.section === "unstaged"),
  }
}

export function hasConflicts(status: StatusSnapshot | null): boolean {
  return !!status && status.entries.some((entry) => entry.unmerged)
}

export function conflictPaths(status: StatusSnapshot | null): string[] {
  if (!status) return []
  return status.entries.filter((entry) => entry.unmerged).map((entry) => entry.path)
}

export function displayPath(row: Pick<FileRow, "path" | "origPath">): string {
  return row.origPath ? `${row.origPath} → ${row.path}` : row.path
}
