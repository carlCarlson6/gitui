export type Panel = "branches" | "changes" | "commits" | "main"

/** The panel that owns the right-hand content. "main" keeps the previous view. */
export type MainView = "branches" | "changes" | "commits"

export type Branch = {
  name: string
  current: boolean
  upstream?: string
  upstreamRemote?: string
  upstreamBranch?: string
}

export type StatusEntry = {
  path: string
  origPath?: string
  x: string
  y: string
  untracked: boolean
  unmerged: boolean
}

export type StatusSnapshot = {
  oid: string | null
  head: string | null
  detached: boolean
  unborn: boolean
  upstream: string | null
  ahead: number
  behind: number
  entries: StatusEntry[]
}

export type FileSection = "conflicted" | "staged" | "unstaged"

export type FileRow = {
  key: string
  path: string
  origPath?: string
  section: FileSection
  code: string
  untracked: boolean
}

export type Commit = {
  hash: string
  shortHash: string
  date: string
  author: string
  subject: string
}

export type GraphCommit = {
  shortHash: string
  /** Decorations such as `HEAD -> main, origin/main`; empty when undecorated. */
  decorations: string
  subject: string
  date: string
}

export type GraphRow = {
  /** Branch-lane glyphs and spacing before the commit text. */
  graph: string
  /** Commit shown by this row; null for connector-only rows. */
  commit: GraphCommit | null
}

export type BranchGraphData = {
  rows: GraphRow[]
  truncated: boolean
}

export type TreeRow = {
  depth: number
  name: string
  path: string
  kind: "dir" | "file"
  /** Glyphs used to draw the tree connectors at this depth. */
  prefix: string
}

export type CommitTreeData = {
  rows: TreeRow[]
  total: number
  truncated: boolean
}

export type CommitFileDiff = {
  path: string
  patch: string
}

export type CommitDetail = {
  hash: string
  shortHash: string
  author: string
  email: string
  date: string
  subject: string
  body: string
  parents: string[]
  merge: boolean
  stat: string
  patch: string
  /** Each file's patch, split apart because the diff renderable handles one file at a time. */
  files: CommitFileDiff[]
  truncated: boolean
}

export type FilePreviewData = {
  text: string
  mode: "diff" | "content"
  binary: boolean
  truncated: boolean
  note?: string
}

export type Preview =
  | {
      kind: "file"
      key: string
      path: string
      origPath?: string
      section: FileSection
      untracked: boolean
    }
  | {
      kind: "commit"
      hash: string
      shortHash: string
    }

export type PreviewData =
  | { kind: "file"; data: FilePreviewData }
  | { kind: "commit"; data: CommitDetail }
  | { kind: "error"; message: string }

export type ErrorInfo = {
  title: string
  body: string
}

export type RepoEntry = {
  name: string
  path: string
  root: string
  rootLabel: string
  relativePath: string
  branch?: string
  /** True when the checked-out branch has staged, unstaged or untracked changes. */
  dirty?: boolean
}
