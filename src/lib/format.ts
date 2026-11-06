import { homedir } from "node:os"
import { basename } from "node:path"
import { theme } from "../theme"

export function prettyPath(path: string): string {
  const home = homedir()
  if (path === home) return "~"
  if (path.startsWith(`${home}/`)) return `~${path.slice(home.length)}`
  return path
}

export function truncateRight(text: string, width: number): string {
  if (width <= 0) return ""
  if (text.length <= width) return text
  if (width === 1) return "…"
  return `${text.slice(0, width - 1)}…`
}

export function truncateLeft(text: string, width: number): string {
  if (width <= 0) return ""
  if (text.length <= width) return text
  if (width === 1) return "…"
  return `…${text.slice(text.length - (width - 1))}`
}

export function repoName(root: string): string {
  return basename(root) || root
}

export function firstLine(text: string): string {
  return text.split("\n").find((line) => line.trim())?.trim() ?? ""
}

export function statusCodeColor(code: string, section: "conflicted" | "staged" | "unstaged"): string {
  if (section === "conflicted") return theme.red
  if (code === "?") return theme.muted
  switch (code[0]) {
    case "M":
    case "T":
      return theme.yellow
    case "A":
      return theme.green
    case "D":
      return theme.red
    case "R":
    case "C":
      return theme.cyan
    case "U":
      return theme.red
    default:
      return theme.muted
  }
}

export function formatSync(ahead: number, behind: number, hasUpstream: boolean): string {
  if (!hasUpstream) return ""
  if (ahead === 0 && behind === 0) return "synced"
  const parts: string[] = []
  if (ahead > 0) parts.push(`↑${ahead}`)
  if (behind > 0) parts.push(`↓${behind}`)
  return parts.join(" ")
}
