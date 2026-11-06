import type { CommitTreeData, TreeRow } from "../types"
import { runGitOrThrow } from "./exec"

const MAX_TREE_FILES = 1500

type TreeNode = {
  children: Map<string, TreeNode>
  dir: boolean
}

function makeNode(dir: boolean): TreeNode {
  return { children: new Map(), dir }
}

/**
 * Turn flat repository paths into display rows with directory-first ordering
 * and box-drawing prefixes for a compact `tree`-style view.
 */
export function buildTreeRows(paths: string[]): TreeRow[] {
  const root = makeNode(true)

  for (const path of paths) {
    const parts = path.split("/").filter(Boolean)
    if (parts.length === 0) continue

    let node = root
    parts.forEach((part, index) => {
      const isDir = index < parts.length - 1
      let child = node.children.get(part)
      if (!child) {
        child = makeNode(isDir)
        node.children.set(part, child)
      } else if (isDir) {
        child.dir = true
      }
      node = child
    })
  }

  const rows: TreeRow[] = []

  const walk = (node: TreeNode, depth: number, ancestors: boolean[], parentPath: string) => {
    const entries = [...node.children.entries()].sort(([aName, a], [bName, b]) => {
      if (a.dir !== b.dir) return a.dir ? -1 : 1
      return aName < bName ? -1 : aName > bName ? 1 : 0
    })

    entries.forEach(([name, child], index) => {
      const last = index === entries.length - 1
      const prefix =
        ancestors.map((ancestorLast) => (ancestorLast ? "   " : "│  ")).join("") +
        (last ? "└─ " : "├─ ")
      const path = parentPath ? `${parentPath}/${name}` : name

      rows.push({ depth, name, path, kind: child.dir ? "dir" : "file", prefix })
      if (child.dir) walk(child, depth + 1, [...ancestors, last], path)
    })
  }

  walk(root, 0, [], "")
  return rows
}

export async function readCommitTree(root: string, hash: string): Promise<CommitTreeData> {
  const result = await runGitOrThrow(
    ["ls-tree", "-r", "-z", "--name-only", "--full-tree", hash],
    root,
    { timeoutMs: 30_000 },
  )

  const paths = result.stdout.split("\0").filter((path) => path.length > 0)
  const truncated = paths.length > MAX_TREE_FILES
  const shown = truncated ? paths.slice(0, MAX_TREE_FILES) : paths

  return {
    rows: buildTreeRows(shown),
    total: paths.length,
    truncated,
  }
}
