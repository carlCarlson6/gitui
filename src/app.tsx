import type { ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BranchPanel } from "./components/BranchPanel"
import { ChangesPanel } from "./components/ChangesPanel"
import { CommitModal } from "./components/CommitModal"
import { CommitsPanel } from "./components/CommitsPanel"
import { Footer } from "./components/Footer"
import { Header } from "./components/Header"
import { MainPane } from "./components/MainPane"
import { ModalFrame, TextModal } from "./components/Modal"
import { RepoPicker } from "./components/RepoPicker"
import {
  checkoutBranch,
  commitChanges,
  fetchAll,
  pullRepo,
  pushRepo,
  stageAll,
  stagePaths,
  unstageAll,
  unstagePaths,
} from "./git/actions"
import { readFilePreview } from "./git/diff"
import { GitError, UserError, errorTitle, errorToText } from "./git/exec"
import { readCommit, readLog } from "./git/history"
import {
  discoverRepo,
  readBranches,
  readLastCommitMessage,
  readOperation,
  readRemotes,
  readStatus,
  type Operation,
} from "./git/repo"
import { buildFileRows, conflictPaths, groupRows, hasConflicts } from "./git/status"
import { defaultRepoRoots, scanRepos } from "./git/scan"
import { firstLine, truncateRight } from "./lib/format"
import { theme } from "./theme"
import type {
  Branch,
  Commit,
  CommitDetail,
  ErrorInfo,
  FileRow,
  Panel,
  Preview,
  PreviewData,
  RepoEntry,
  StatusSnapshot,
} from "./types"

type Phase = "boot" | "ready" | "error"

type ModalState =
  | { type: "none" }
  | { type: "commit"; amend: boolean; initial: string }
  | { type: "help" }
  | { type: "error"; title: string; body: string }
  | { type: "conflicts"; paths: string[] }

type Props = {
  startPath: string | null
}

const PANEL_ORDER: Panel[] = ["branches", "changes", "commits", "main"]

const HELP_TEXT = `gitui — keyboard shortcuts

Panels
  Tab / Shift+Tab     cycle Branches → Changes → Commits → Preview
  l                   jump to Commits
  j/k or ↑/↓          move selection / scroll
  g / G               top / bottom
  Enter               checkout branch / focus preview
  b                   switch repository
  q                   quit
  ?                   show this help
  Esc                 close modal / return to Changes

Changes
  space               stage or unstage the selected file
  a                   stage all changes
  u                   unstage all changes

Git
  c                   commit staged changes
  A                   amend the last commit
  f                   fetch all remotes (--prune)
  p                   pull (honors your git config)
  P                   push (sets upstream on first push)
  r                   refresh status, branches and history

Scroll the preview
  j/k, PgUp/PgDn, g/G

Notes
  • Commit history follows the branch highlighted in Branches. Enter checks it out.
  • Commits always apply to the checked-out branch; previewing another branch blocks commits until you check it out.
  • Pull honors your git config. Conflicts are detected, not resolved in-app.
  • Resolve conflicted files in your editor, then stage them here one by one.
  • If a rebase is in progress, finish it with git rebase --continue.
  • Network commands use your existing SSH agent / credential helper and never prompt inside the TUI.
  • No discard, reset, force-push or branch deletion in this version.`

function failureInfo(error: unknown): ErrorInfo {
  return { title: errorTitle(error), body: errorToText(error) }
}

function samePreview(a: Preview | null, b: Preview | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (a.kind !== b.kind) return false
  if (a.kind === "commit" && b.kind === "commit") return a.hash === b.hash
  if (a.kind === "file" && b.kind === "file") return a.key === b.key && a.section === b.section
  return false
}

function conflictsBody(paths: string[], operation: Operation): string {
  const lines = [
    `${paths.length} unresolved file${paths.length === 1 ? "" : "s"}:`,
    "",
    ...paths.map((path) => `  ${path}`),
    "",
    "Resolve these files in your editor, then stage each one with space to mark it resolved.",
    "Commit, checkout, pull and push are blocked until the index has no unmerged entries.",
    "",
  ]

  if (operation === "merge") {
    lines.push("A merge is in progress. After staging the resolved files, commit from gitui to finish it.")
  } else if (operation === "rebase") {
    lines.push("A rebase is in progress. After resolving, run: git rebase --continue")
  } else if (operation === "cherry-pick") {
    lines.push("A cherry-pick is in progress. After resolving, run: git cherry-pick --continue")
  } else if (operation === "revert") {
    lines.push("A revert is in progress. After resolving, run: git revert --continue")
  } else {
    lines.push("If a rebase or other multi-step operation is in progress, finish it in your terminal.")
  }

  return lines.join("\n")
}

export function App({ startPath }: Props) {
  const renderer = useRenderer()
  const { width, height } = useTerminalDimensions()

  const [screen, setScreen] = useState<"picker" | "repo">(startPath ? "repo" : "picker")
  const [launchPath, setLaunchPath] = useState<string | null>(startPath)
  const [repoEpoch, setRepoEpoch] = useState(0)
  const [pickerRepos, setPickerRepos] = useState<RepoEntry[]>([])
  const [pickerRoots, setPickerRoots] = useState<string[]>(() => defaultRepoRoots())
  const [pickerCursor, setPickerCursor] = useState(0)
  const [pickerLoading, setPickerLoading] = useState(!startPath)
  const [pickerError, setPickerError] = useState<string | null>(null)

  const [phase, setPhase] = useState<Phase>("boot")
  const [startupError, setStartupError] = useState<ErrorInfo | null>(null)
  const [root, setRoot] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusSnapshot | null>(null)
  const [operation, setOperation] = useState<Operation>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [historyBranch, setHistoryBranchState] = useState<string | null>(null)
  const [commits, setCommits] = useState<Commit[]>([])
  const [commitsLoading, setCommitsLoading] = useState(false)
  const [commitsError, setCommitsError] = useState<string | null>(null)
  const [dataVersion, setDataVersion] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [focus, setFocus] = useState<Panel>("changes")
  const [fileCursor, setFileCursor] = useState(0)
  const [commitCursor, setCommitCursor] = useState(0)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewData, setPreviewData] = useState<PreviewData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [modal, setModal] = useState<ModalState>({ type: "none" })
  const [commitError, setCommitError] = useState<string | null>(null)

  const historyBranchRef = useRef<string | null>(null)
  const currentBranchRef = useRef<string | null>(null)
  const refreshSeq = useRef(0)
  const commitsSeq = useRef(0)
  const previewSeq = useRef(0)
  const busyRef = useRef(false)
  const didInitRef = useRef(false)
  const commitHashRef = useRef<string | null>(null)
  const resetCommitRef = useRef(false)
  const lastHistoryRef = useRef<string | null | undefined>(undefined)
  const selectedFileKeyRef = useRef<string | null>(null)
  const pendingFileKeyRef = useRef<string | null>(null)
  const pickerSelectedPathRef = useRef<string | null>(null)
  const pickerScanSeq = useRef(0)
  const commitCacheRef = useRef(new Map<string, CommitDetail>())
  const mainScrollRef = useRef<ScrollBoxRenderable>(null)
  const modalScrollRef = useRef<ScrollBoxRenderable>(null)

  const fileRows = useMemo(() => (status ? buildFileRows(status) : []), [status])
  const groupedRows = useMemo(() => groupRows(fileRows), [fileRows])
  const stagedCount = groupedRows.staged.length
  const currentBranch = status?.head ?? null

  const historyLabel = useMemo(() => {
    if (historyBranch) {
      return historyBranch === currentBranch ? `${historyBranch} (current)` : `${historyBranch} (preview)`
    }
    return status?.detached ? "HEAD (detached)" : "HEAD"
  }, [historyBranch, currentBranch, status?.detached])

  const activity = busy ?? (refreshing ? "Refreshing" : null)
  const tooSmall = width < 70 || height < 20
  const leftWidth = Math.max(32, Math.min(52, Math.floor(width * 0.38)))
  const modalWidth = Math.max(40, Math.min(width - 6, 104))
  const modalHeight = Math.max(9, Math.min(height - 4, Math.floor(height * 0.8)))
  const commitWidth = Math.max(40, Math.min(width - 8, 78))
  const commitHeight = Math.max(14, Math.min(height - 4, 20))
  const textModalBody =
    modal.type === "error"
      ? modal.body
      : modal.type === "conflicts"
        ? conflictsBody(modal.paths, operation)
        : ""
  const errorModalHeight = Math.max(9, Math.min(modalHeight, textModalBody.split("\n").length + 6))

  const showError = useCallback((error: unknown) => {
    setModal({ type: "error", ...failureInfo(error) })
  }, [])

  const selectHistoryBranch = useCallback((name: string | null) => {
    if (historyBranchRef.current !== name) {
      setCommits([])
      setCommitCursor(0)
      commitHashRef.current = null
    }
    historyBranchRef.current = name
    setHistoryBranchState(name)
  }, [])

  const refreshRepo = useCallback(
    async (opts: { desiredBranch?: string | null } = {}) => {
      if (!root) return null
      const seq = ++refreshSeq.current
      setRefreshing(true)
      try {
        const [nextStatus, nextOperation] = await Promise.all([readStatus(root), readOperation(root)])
        const nextBranches = await readBranches(root, nextStatus)
        if (seq !== refreshSeq.current) return null

        setStatus(nextStatus)
        setOperation(nextOperation)
        setBranches(nextBranches)

        const names = new Set(nextBranches.map((branch) => branch.name))
        const previous = historyBranchRef.current
        const followsCurrent = previous !== null && previous === currentBranchRef.current
        let nextHistory: string | null

        if (nextOperation) {
          nextHistory = nextStatus.head && names.has(nextStatus.head) ? nextStatus.head : null
        } else if (opts.desiredBranch !== undefined) {
          if (opts.desiredBranch !== null && names.has(opts.desiredBranch)) {
            nextHistory = opts.desiredBranch
          } else if (nextStatus.head && names.has(nextStatus.head)) {
            nextHistory = nextStatus.head
          } else {
            nextHistory = null
          }
        } else if (followsCurrent) {
          nextHistory = nextStatus.head && names.has(nextStatus.head) ? nextStatus.head : null
        } else if (previous && names.has(previous)) {
          nextHistory = previous
        } else if (nextStatus.head && names.has(nextStatus.head)) {
          nextHistory = nextStatus.head
        } else {
          nextHistory = null
        }

        currentBranchRef.current = nextStatus.head
        selectHistoryBranch(nextHistory)
        setDataVersion((version) => version + 1)

        return { status: nextStatus, branches: nextBranches, historyBranch: nextHistory, operation: nextOperation }
      } finally {
        if (seq === refreshSeq.current) setRefreshing(false)
      }
    },
    [root, selectHistoryBranch],
  )

  // Discover the repository selected in the picker or passed on the command line.
  useEffect(() => {
    if (!launchPath) return
    let cancelled = false
    void (async () => {
      try {
        const discovered = await discoverRepo(launchPath)
        if (!cancelled) setRoot(discovered)
      } catch (error) {
        if (!cancelled) {
          setStartupError(failureInfo(error))
          setPhase("error")
        }
      }
    })()
    return () => {
      cancelled = true
      refreshSeq.current++
    }
  }, [launchPath, repoEpoch])

  // First load once the root is known.
  useEffect(() => {
    if (!root) return
    let cancelled = false
    void (async () => {
      try {
        const data = await refreshRepo()
        if (cancelled || !data) return
        if (!didInitRef.current) {
          didInitRef.current = true
          const rows = buildFileRows(data.status)
          setFileCursor(0)
          setCommitCursor(0)
          setFocus(rows.length > 0 ? "changes" : "commits")
        }
        setPhase("ready")
      } catch (error) {
        if (!cancelled) {
          setStartupError(failureInfo(error))
          setPhase("error")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [root, refreshRepo])

  useEffect(() => {
    historyBranchRef.current = historyBranch
  }, [historyBranch])

  const scanPicker = useCallback(async () => {
    const seq = ++pickerScanSeq.current
    setPickerLoading(true)
    setPickerError(null)
    try {
      const roots = defaultRepoRoots()
      const list = await scanRepos(roots)
      if (seq !== pickerScanSeq.current) return
      setPickerRoots(roots)
      setPickerRepos(list)
      setPickerCursor((current) => {
        const selectedPath = pickerSelectedPathRef.current
        if (selectedPath) {
          const index = list.findIndex((entry) => entry.path === selectedPath)
          if (index >= 0) return index
        }
        return Math.max(0, Math.min(current, list.length - 1))
      })
    } catch (error) {
      if (seq !== pickerScanSeq.current) return
      setPickerError(errorToText(error))
    } finally {
      if (seq === pickerScanSeq.current) setPickerLoading(false)
    }
  }, [])

  // Scan whenever the picker is shown so newly created repositories appear.
  useEffect(() => {
    if (screen === "picker") void scanPicker()
  }, [screen, scanPicker])

  useEffect(() => {
    const selected = pickerRepos[pickerCursor]
    pickerSelectedPathRef.current = selected?.path ?? null
  }, [pickerRepos, pickerCursor])

  // Load the history of the highlighted branch.
  useEffect(() => {
    if (!root || phase !== "ready") return
    const rev = historyBranch ?? "HEAD"
    const branchChanged = lastHistoryRef.current !== rev
    lastHistoryRef.current = rev
    const seq = ++commitsSeq.current

    setCommitsLoading(true)
    if (branchChanged) {
      setCommits([])
      setCommitCursor(0)
      commitHashRef.current = null
    }

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const list = await readLog(root, rev)
          if (seq !== commitsSeq.current) return
          setCommits(list)
          setCommitsError(null)
          setCommitCursor((current) => {
            if (branchChanged || resetCommitRef.current) {
              resetCommitRef.current = false
              return 0
            }
            const hash = commitHashRef.current
            const index = hash ? list.findIndex((commit) => commit.hash === hash) : -1
            return index >= 0 ? index : Math.min(current, Math.max(0, list.length - 1))
          })
        } catch (error) {
          if (seq !== commitsSeq.current) return
          setCommits([])
          setCommitsError(errorToText(error))
          setCommitCursor(0)
        } finally {
          if (seq === commitsSeq.current) setCommitsLoading(false)
        }
      })()
    }, 80)

    return () => clearTimeout(timer)
  }, [root, historyBranch, dataVersion, phase])

  useEffect(() => {
    const commit = commits[commitCursor]
    commitHashRef.current = commit?.hash ?? null
  }, [commits, commitCursor])

  // Keep the selected file stable across refreshes.
  useEffect(() => {
    if (!fileRows.length) {
      selectedFileKeyRef.current = null
      setFileCursor(0)
      return
    }

    const pending = pendingFileKeyRef.current
    if (pending) {
      pendingFileKeyRef.current = null
      const index = fileRows.findIndex((row) => row.key === pending)
      if (index >= 0) {
        selectedFileKeyRef.current = pending
        setFileCursor(index)
        return
      }
    }

    const key = selectedFileKeyRef.current
    if (key) {
      const index = fileRows.findIndex((row) => row.key === key)
      if (index >= 0) {
        setFileCursor((current) => (current === index ? current : index))
        return
      }
    }

    setFileCursor((current) => Math.min(current, fileRows.length - 1))
  }, [fileRows])

  useEffect(() => {
    const row = fileRows[fileCursor]
    if (row) selectedFileKeyRef.current = row.key
  }, [fileCursor, fileRows])

  // The focused list drives the preview. Branches and the preview pane leave it alone.
  useEffect(() => {
    if (focus === "changes") {
      const row = fileRows[fileCursor]
      const next: Preview | null = row
        ? {
            kind: "file",
            key: row.key,
            path: row.path,
            origPath: row.origPath,
            section: row.section,
            untracked: row.untracked,
          }
        : null
      setPreview((current) => (samePreview(current, next) ? current : next))
    } else if (focus === "commits" || focus === "branches") {
      const commit = commits[commitCursor]
      const next: Preview | null = commit
        ? { kind: "commit", hash: commit.hash, shortHash: commit.shortHash }
        : null
      setPreview((current) => (samePreview(current, next) ? current : next))
    }
  }, [focus, fileCursor, fileRows, commitCursor, commits])

  useEffect(() => {
    mainScrollRef.current?.scrollTo({ x: 0, y: 0 })
  }, [preview])

  // Fetch the preview body with a request id so rapid j/k cannot render stale data.
  useEffect(() => {
    const seq = ++previewSeq.current
    let active = true

    if (!root || !preview) {
      setPreviewData(null)
      setPreviewLoading(false)
      return
    }

    if (preview.kind === "commit") {
      const cached = commitCacheRef.current.get(preview.hash)
      if (cached) {
        setPreviewData({ kind: "commit", data: cached })
        setPreviewLoading(false)
        return
      }
    }

    setPreviewData(null)
    setPreviewLoading(true)

    const timer = setTimeout(() => {
      void (async () => {
        try {
          let next: PreviewData
          if (preview.kind === "commit") {
            const detail = await readCommit(root, preview.hash)
            const cache = commitCacheRef.current
            if (cache.size >= 20) {
              const first = cache.keys().next().value
              if (first) cache.delete(first)
            }
            cache.set(preview.hash, detail)
            next = { kind: "commit", data: detail }
          } else {
            const file = await readFilePreview(root, preview)
            next = { kind: "file", data: file }
          }
          if (active && seq === previewSeq.current) {
            setPreviewData(next)
            setPreviewLoading(false)
          }
        } catch (error) {
          if (active && seq === previewSeq.current) {
            setPreviewData({ kind: "error", message: errorToText(error) })
            setPreviewLoading(false)
          }
        }
      })()
    }, 30)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [root, preview, dataVersion])

  const perform = useCallback(
    async (label: string, action: () => Promise<void>) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy(label)
      setMessage("")
      try {
        await action()
      } catch (error) {
        showError(error)
      } finally {
        busyRef.current = false
        setBusy(null)
      }
    },
    [showError],
  )

  const ensureNoConflicts = useCallback((): boolean => {
    if (!hasConflicts(status)) return true
    setModal({ type: "conflicts", paths: conflictPaths(status) })
    return false
  }, [status])

  const ensureNoOperation = useCallback((): boolean => {
    if (!operation) return true
    const finish =
      operation === "merge"
        ? "Commit from gitui to finish the merge, or run git merge --continue."
        : `Run git ${operation} --continue in a terminal to finish it.`
    setModal({
      type: "error",
      title: "Operation in progress",
      body: `A ${operation} is in progress.\n\n${finish}`,
    })
    return false
  }, [operation])

  const ensurePreviewIsCurrent = (verb: string): boolean => {
    if (historyBranch && currentBranch && historyBranch !== currentBranch) {
      setMessage(`Check out ${historyBranch} before ${verb}.`)
      return false
    }
    return true
  }

  const moveFile = (delta: number) => {
    if (!fileRows.length) return
    setFileCursor((current) => Math.max(0, Math.min(fileRows.length - 1, current + delta)))
  }

  const jumpFile = (end: boolean) => {
    if (!fileRows.length) return
    setFileCursor(end ? fileRows.length - 1 : 0)
  }

  const moveBranch = (delta: number) => {
    if (!branches.length) return
    const current = historyBranchRef.current
    const index = branches.findIndex((branch) => branch.name === current)
    let next = index < 0 ? (delta > 0 ? 0 : branches.length - 1) : index + delta
    next = Math.max(0, Math.min(branches.length - 1, next))
    selectHistoryBranch(branches[next]!.name)
  }

  const jumpBranch = (end: boolean) => {
    if (!branches.length) return
    selectHistoryBranch(branches[end ? branches.length - 1 : 0]!.name)
  }

  const moveCommit = (delta: number) => {
    if (!commits.length) return
    setCommitCursor((current) => Math.max(0, Math.min(commits.length - 1, current + delta)))
  }

  const jumpCommit = (end: boolean) => {
    if (!commits.length) return
    setCommitCursor(end ? commits.length - 1 : 0)
  }

  const cycleFocus = (delta: number) => {
    setFocus((current) => {
      const index = PANEL_ORDER.indexOf(current)
      return PANEL_ORDER[(index + delta + PANEL_ORDER.length) % PANEL_ORDER.length]!
    })
  }

  const movePicker = (delta: number) => {
    if (!pickerRepos.length) return
    setPickerCursor((current) => Math.max(0, Math.min(pickerRepos.length - 1, current + delta)))
  }

  const jumpPicker = (end: boolean) => {
    if (!pickerRepos.length) return
    setPickerCursor(end ? pickerRepos.length - 1 : 0)
  }

  const resetRepoState = () => {
    refreshSeq.current++
    commitsSeq.current++
    previewSeq.current++
    busyRef.current = false
    didInitRef.current = false
    historyBranchRef.current = null
    currentBranchRef.current = null
    lastHistoryRef.current = undefined
    commitHashRef.current = null
    resetCommitRef.current = false
    selectedFileKeyRef.current = null
    pendingFileKeyRef.current = null
    commitCacheRef.current.clear()

    setRoot(null)
    setStatus(null)
    setOperation(null)
    setBranches([])
    setHistoryBranchState(null)
    setCommits([])
    setCommitsLoading(false)
    setCommitsError(null)
    setDataVersion(0)
    setRefreshing(false)
    setFocus("changes")
    setFileCursor(0)
    setCommitCursor(0)
    setPreview(null)
    setPreviewData(null)
    setPreviewLoading(false)
    setBusy(null)
    setMessage("")
    setModal({ type: "none" })
    setCommitError(null)
    setStartupError(null)
  }

  const openRepo = (entry: RepoEntry) => {
    if (entry.path === root && phase === "ready") {
      setScreen("repo")
      return
    }
    resetRepoState()
    setLaunchPath(entry.path)
    setRepoEpoch((epoch) => epoch + 1)
    setScreen("repo")
    setPhase("boot")
  }

  const openPicker = () => {
    if (root) pickerSelectedPathRef.current = root
    setPickerLoading(true)
    setPickerError(null)
    setScreen("picker")
  }

  const toggleStage = () => {
    if (!root || focus !== "changes") return
    const row = fileRows[fileCursor]
    if (!row) return
    const targetSection = row.section === "staged" ? "unstaged" : "staged"
    const paths = row.origPath ? [row.origPath, row.path] : [row.path]

    void perform(row.section === "staged" ? "Unstaging" : "Staging", async () => {
      if (row.section === "staged") {
        await unstagePaths(root, paths)
      } else {
        await stagePaths(root, paths)
      }
      pendingFileKeyRef.current = `${targetSection}:${row.path}`
      await refreshRepo()
      setMessage(row.section === "conflicted" ? "Marked resolved" : row.section === "staged" ? "Unstaged" : "Staged")
    })
  }

  const stageEverything = () => {
    if (!root) return
    if (hasConflicts(status)) {
      setMessage("Resolve conflicts first, then stage files individually to mark them resolved.")
      return
    }
    void perform("Staging all", async () => {
      await stageAll(root)
      pendingFileKeyRef.current = null
      await refreshRepo()
      setMessage("Staged all changes")
    })
  }

  const unstageEverything = () => {
    if (!root) return
    if (hasConflicts(status)) {
      setMessage("Unstage-all is disabled while conflicts are unresolved.")
      return
    }
    void perform("Unstaging all", async () => {
      await unstageAll(root)
      pendingFileKeyRef.current = null
      await refreshRepo()
      setMessage("Unstaged all changes")
    })
  }

  const refresh = () => {
    void perform("Refreshing", async () => {
      await refreshRepo()
      setMessage("Refreshed")
    })
  }

  const checkoutSelected = () => {
    if (!root) return
    const branch = branches.find((item) => item.name === historyBranchRef.current)
    if (!branch) {
      setMessage("No branch selected")
      return
    }
    if (branch.current) {
      setMessage(`Already on ${branch.name}`)
      return
    }
    if (!ensureNoConflicts()) return
    if (!ensureNoOperation()) return

    void perform(`Checking out ${branch.name}`, async () => {
      await checkoutBranch(root, branch.name)
      resetCommitRef.current = true
      selectHistoryBranch(branch.name)
      await refreshRepo({ desiredBranch: branch.name })
      setMessage(`Checked out ${branch.name}`)
    })
  }

  const doFetch = () => {
    if (!root) return
    void perform("Fetching", async () => {
      const remotes = await readRemotes(root)
      if (!remotes.length) throw new UserError("No remotes configured. Add a remote before fetching.")
      await fetchAll(root)
      await refreshRepo()
      setMessage(`Fetched ${remotes.join(", ")}`)
    })
  }

  const doPull = () => {
    if (!root || !ensureNoConflicts() || !ensureNoOperation()) return
    if (status?.detached) {
      setMessage("Check out a branch before pulling.")
      return
    }
    if (!ensurePreviewIsCurrent("pulling")) return
    void perform("Pulling", async () => {
      const remotes = await readRemotes(root)
      if (!remotes.length) throw new UserError("No remotes configured. Add a remote before pulling.")
      const result = await pullRepo(root)
      const data = await refreshRepo()
      if (result.code !== 0) {
        if (data && hasConflicts(data.status)) {
          setMessage("Pull stopped with conflicts")
          setModal({ type: "conflicts", paths: conflictPaths(data.status) })
          return
        }
        throw new GitError(result)
      }
      setMessage(firstLine(result.stdout) || "Pulled")
    })
  }

  const doPush = () => {
    if (!root || !ensureNoConflicts() || !ensureNoOperation()) return
    if (status?.detached) {
      setMessage("Check out a branch before pushing.")
      return
    }
    if (!ensurePreviewIsCurrent("pushing")) return
    void perform("Pushing", async () => {
      const result = await pushRepo(root)
      await refreshRepo()
      if (result.code !== 0) throw new GitError(result)
      setMessage("Pushed")
    })
  }

  const openCommit = (amend: boolean) => {
    if (!root) return
    if (!ensureNoConflicts()) return
    if (operation && operation !== "merge") {
      setModal({
        type: "error",
        title: "Operation in progress",
        body: `A ${operation} is in progress.\n\nRun git ${operation} --continue in a terminal to finish it before committing.`,
      })
      return
    }
    if (amend && operation) {
      setMessage(`Cannot amend while a ${operation} is in progress.`)
      return
    }
    if (!currentBranch) {
      setMessage("Detached HEAD — check out a branch before committing.")
      return
    }
    if (!ensurePreviewIsCurrent("committing")) return
    if (amend && (!status || status.unborn || !status.oid)) {
      setMessage("There is no commit to amend yet.")
      return
    }
    if (!amend && stagedCount === 0) {
      setMessage("Nothing staged to commit.")
      return
    }

    if (amend) {
      void perform("Loading last commit", async () => {
        const initial = await readLastCommitMessage(root)
        setCommitError(null)
        setModal({ type: "commit", amend: true, initial })
      })
    } else {
      setCommitError(null)
      setModal({ type: "commit", amend: false, initial: "" })
    }
  }

  const submitCommit = async (text: string) => {
    if (!root || modal.type !== "commit" || busyRef.current) return
    const amend = modal.amend
    busyRef.current = true
    setBusy("Committing")
    setCommitError(null)
    setMessage("")

    try {
      const result = await commitChanges(root, text, amend)
      if (result.code !== 0) {
        const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n\n")
        setCommitError(output || "Commit failed.")
        return
      }

      setModal({ type: "none" })
      setCommitError(null)
      setMessage(amend ? "Amended the last commit" : "Commit created")
      pendingFileKeyRef.current = null
      resetCommitRef.current = true
      commitHashRef.current = null
      setCommitCursor(0)
      setFileCursor(0)
      try {
        await refreshRepo()
      } catch (error) {
        showError(error)
      }
    } catch (error) {
      setCommitError(errorToText(error))
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }

  useKeyboard((key) => {
    const ctrlC = key.ctrl && key.name === "c"

    if (ctrlC) {
      key.preventDefault()
      renderer.destroy()
      return
    }

    if (screen === "picker") {
      if (key.name === "q") {
        key.preventDefault()
        renderer.destroy()
        return
      }
      if (key.name === "escape") {
        key.preventDefault()
        if (launchPath || root) setScreen("repo")
        else renderer.destroy()
        return
      }
      if (pickerLoading) return
      if (key.name === "j" || key.name === "down") {
        key.preventDefault()
        movePicker(1)
        return
      }
      if (key.name === "k" || key.name === "up") {
        key.preventDefault()
        movePicker(-1)
        return
      }
      if (key.name === "g") {
        key.preventDefault()
        jumpPicker(key.shift)
        return
      }
      if (key.name === "pagedown") {
        key.preventDefault()
        movePicker(10)
        return
      }
      if (key.name === "pageup") {
        key.preventDefault()
        movePicker(-10)
        return
      }
      if (key.name === "return" || key.name === "enter") {
        key.preventDefault()
        const entry = pickerRepos[pickerCursor]
        if (entry) openRepo(entry)
        return
      }
      if (key.name === "r") {
        key.preventDefault()
        void scanPicker()
        return
      }
      return
    }

    if (phase !== "ready") {
      if (key.name === "b") {
        key.preventDefault()
        openPicker()
        return
      }
      if (key.name === "q" || key.name === "escape") {
        key.preventDefault()
        renderer.destroy()
      }
      return
    }

    if (modal.type !== "none") {
      if (modal.type === "commit") return
      if (key.name === "escape" || key.name === "?" || key.name === "q") {
        key.preventDefault()
        setModal({ type: "none" })
        return
      }
      if (key.name === "j" || key.name === "down") {
        key.preventDefault()
        modalScrollRef.current?.scrollBy(1)
        return
      }
      if (key.name === "k" || key.name === "up") {
        key.preventDefault()
        modalScrollRef.current?.scrollBy(-1)
        return
      }
      if (key.name === "pagedown") {
        key.preventDefault()
        modalScrollRef.current?.scrollBy(10)
        return
      }
      if (key.name === "pageup") {
        key.preventDefault()
        modalScrollRef.current?.scrollBy(-10)
        return
      }
      if (key.name === "g") {
        key.preventDefault()
        if (key.shift) modalScrollRef.current?.scrollTo(Number.MAX_SAFE_INTEGER)
        else modalScrollRef.current?.scrollTo(0)
        return
      }
      return
    }

    if (tooSmall) {
      if (key.name === "q") {
        key.preventDefault()
        renderer.destroy()
      }
      return
    }

    if (busyRef.current) return

    if (key.name === "b") {
      key.preventDefault()
      openPicker()
      return
    }
    if (key.name === "q") {
      key.preventDefault()
      renderer.destroy()
      return
    }
    if (key.name === "?") {
      key.preventDefault()
      setModal({ type: "help" })
      return
    }
    if (key.name === "tab") {
      key.preventDefault()
      cycleFocus(key.shift ? -1 : 1)
      return
    }
    if (key.name === "l") {
      key.preventDefault()
      setFocus("commits")
      return
    }
    if (key.name === "c") {
      key.preventDefault()
      openCommit(false)
      return
    }
    if (key.name === "a" && key.shift) {
      key.preventDefault()
      openCommit(true)
      return
    }
    if (key.name === "f") {
      key.preventDefault()
      doFetch()
      return
    }
    if (key.name === "p") {
      key.preventDefault()
      if (key.shift) doPush()
      else doPull()
      return
    }
    if (key.name === "r") {
      key.preventDefault()
      refresh()
      return
    }

    if (focus === "branches") {
      if (key.name === "j" || key.name === "down") {
        key.preventDefault()
        moveBranch(1)
      } else if (key.name === "k" || key.name === "up") {
        key.preventDefault()
        moveBranch(-1)
      } else if (key.name === "g") {
        key.preventDefault()
        jumpBranch(key.shift)
      } else if (key.name === "return") {
        key.preventDefault()
        checkoutSelected()
      }
      return
    }

    if (focus === "changes") {
      if (key.name === "j" || key.name === "down") {
        key.preventDefault()
        moveFile(1)
      } else if (key.name === "k" || key.name === "up") {
        key.preventDefault()
        moveFile(-1)
      } else if (key.name === "g") {
        key.preventDefault()
        jumpFile(key.shift)
      } else if (key.name === "space") {
        key.preventDefault()
        toggleStage()
      } else if (key.name === "a") {
        key.preventDefault()
        stageEverything()
      } else if (key.name === "u") {
        key.preventDefault()
        unstageEverything()
      } else if (key.name === "return") {
        key.preventDefault()
        setFocus("main")
      }
      return
    }

    if (focus === "commits") {
      if (key.name === "j" || key.name === "down") {
        key.preventDefault()
        moveCommit(1)
      } else if (key.name === "k" || key.name === "up") {
        key.preventDefault()
        moveCommit(-1)
      } else if (key.name === "g") {
        key.preventDefault()
        jumpCommit(key.shift)
      } else if (key.name === "return") {
        key.preventDefault()
        setFocus("main")
      }
      return
    }

    if (focus === "main") {
      if (key.name === "j" || key.name === "down") {
        key.preventDefault()
        mainScrollRef.current?.scrollBy(1)
      } else if (key.name === "k" || key.name === "up") {
        key.preventDefault()
        mainScrollRef.current?.scrollBy(-1)
      } else if (key.name === "pagedown") {
        key.preventDefault()
        mainScrollRef.current?.scrollBy(10)
      } else if (key.name === "pageup") {
        key.preventDefault()
        mainScrollRef.current?.scrollBy(-10)
      } else if (key.name === "g") {
        key.preventDefault()
        if (key.shift) mainScrollRef.current?.scrollTo(Number.MAX_SAFE_INTEGER)
        else mainScrollRef.current?.scrollTo(0)
      } else if (key.name === "escape") {
        key.preventDefault()
        setFocus("changes")
      }
    }
  })

  if (screen === "picker") {
    return (
      <RepoPicker
        entries={pickerRepos}
        roots={pickerRoots}
        cursor={pickerCursor}
        loading={pickerLoading}
        error={pickerError}
        canGoBack={!!launchPath || !!root}
        currentRepoPath={root}
        width={width}
      />
    )
  }

  if (phase === "boot") {
    return (
      <box width="100%" height="100%" backgroundColor={theme.bg} alignItems="center" justifyContent="center">
        <box
          border
          borderStyle="rounded"
          borderColor={theme.borderFocus}
          backgroundColor={theme.panel}
          title="gitui"
          width={Math.min(Math.max(40, width - 8), 78)}
          height={7}
          padding={1}
          flexDirection="column"
        >
          <text fg={theme.accent}>Opening repository…</text>
          <box height={1} />
          <text fg={theme.muted}>{truncateRight(launchPath ?? "", Math.max(20, width - 14))}</text>
          <text fg={theme.dim}>b repositories · q quit</text>
        </box>
      </box>
    )
  }

  if (phase === "error") {
    const body = startupError?.body ?? "Unknown error"
    const errorHeight = Math.min(Math.max(10, body.split("\n").length + 8), Math.max(10, height - 4))
    return (
      <box width="100%" height="100%" backgroundColor={theme.bg} alignItems="center" justifyContent="center">
        <box
          border
          borderStyle="rounded"
          borderColor={theme.red}
          backgroundColor={theme.panel}
          title={startupError?.title ?? "Cannot open repository"}
          titleColor={theme.red}
          width={Math.min(Math.max(46, width - 8), 100)}
          height={errorHeight}
          padding={1}
          flexDirection="column"
        >
          <scrollbox focusable={false} width="100%" flexGrow={1}>
            <box width="100%">
              <text content={body} fg={theme.text} wrapMode="word" />
            </box>
          </scrollbox>
          <box height={1} flexShrink={0}>
            <text fg={theme.muted}>b repositories · q / esc quit</text>
          </box>
        </box>
      </box>
    )
  }

  if (tooSmall) {
    return (
      <box width="100%" height="100%" backgroundColor={theme.bg} alignItems="center" justifyContent="center">
        <box
          border
          borderStyle="rounded"
          borderColor={theme.yellow}
          backgroundColor={theme.panel}
          title="Terminal too small"
          titleColor={theme.yellow}
          width={Math.min(Math.max(40, width - 4), 70)}
          height={7}
          padding={1}
          flexDirection="column"
        >
          <text fg={theme.text}>
            Current size: {width}×{height}. Please resize to at least 70×20.
          </text>
          <box height={1} />
          <text fg={theme.muted}>q quit</text>
        </box>
      </box>
    )
  }

  const previewTitle = !preview
    ? "Preview"
    : preview.kind === "commit"
      ? `Commit · ${preview.shortHash}`
      : `Diff · ${preview.section === "staged" ? "staged" : preview.section === "conflicted" ? "conflict" : "unstaged"} · ${preview.path}`

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={theme.bg}>
      <Header
        root={root ?? launchPath ?? ""}
        status={status}
        width={width}
        busy={activity}
        message={message}
        operation={operation}
      />

      <box flexDirection="row" flexGrow={1} minHeight={0}>
        <box flexDirection="column" width={leftWidth} flexShrink={0} minHeight={0}>
          <BranchPanel
            branches={branches}
            currentBranch={currentBranch}
            selectedBranch={historyBranch}
            focused={focus === "branches"}
            width={leftWidth}
            detached={!!status?.detached}
          />
          <ChangesPanel
            rows={fileRows}
            selectedIndex={fileCursor}
            focused={focus === "changes"}
            width={leftWidth}
          />
          <CommitsPanel
            commits={commits}
            selectedIndex={commitCursor}
            focused={focus === "commits"}
            loading={commitsLoading}
            error={commitsError}
            width={leftWidth}
            label={historyLabel}
          />
        </box>

        <MainPane
          title={previewTitle}
          preview={preview}
          data={previewData}
          loading={previewLoading}
          focused={focus === "main"}
          scrollRef={mainScrollRef}
        />
      </box>

      <Footer focus={focus} width={width} busy={activity} />

      {modal.type === "commit" ? (
        <CommitModal
          initial={modal.initial}
          amend={modal.amend}
          width={commitWidth}
          height={commitHeight}
          busy={busy !== null}
          actionError={commitError}
          onSubmit={(text) => void submitCommit(text)}
          onCancel={() => {
            setModal({ type: "none" })
            setCommitError(null)
          }}
        />
      ) : null}

      {modal.type === "help" ? (
        <TextModal
          title="Help"
          body={HELP_TEXT}
          width={modalWidth}
          height={modalHeight}
          scrollRef={modalScrollRef}
          footer="esc close · j/k scroll"
        />
      ) : null}

      {modal.type === "error" ? (
        <TextModal
          title={modal.title}
          body={modal.body}
          width={modalWidth}
          height={errorModalHeight}
          scrollRef={modalScrollRef}
          footer="esc / q close · j/k scroll"
          color={theme.text}
        />
      ) : null}

      {modal.type === "conflicts" ? (
        <ModalFrame
          title="Unresolved conflicts"
          width={modalWidth}
          height={errorModalHeight}
          footer="esc close · stage files individually to mark them resolved"
        >
          <scrollbox ref={modalScrollRef} focusable={false} width="100%" height="100%">
            <box width="100%">
              <text content={conflictsBody(modal.paths, operation)} fg={theme.text} wrapMode="word" />
            </box>
          </scrollbox>
        </ModalFrame>
      ) : null}
    </box>
  )
}
