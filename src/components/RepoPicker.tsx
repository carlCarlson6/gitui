import type { ScrollBoxRenderable } from "@opentui/core"
import { homedir } from "node:os"
import { basename } from "node:path"
import { useEffect, useMemo, useRef } from "react"
import type { RepoEntry } from "../types"
import { theme } from "../theme"
import { truncateRight } from "../lib/format"

type Props = {
  entries: RepoEntry[]
  roots: string[]
  cursor: number
  loading: boolean
  error: string | null
  canGoBack: boolean
  currentRepoPath: string | null
  width: number
}

function prettyPath(path: string): string {
  const home = homedir()
  if (path === home) return "~"
  if (path.startsWith(`${home}/`)) return `~${path.slice(home.length)}`
  return path
}

export function RepoPicker({ entries, roots, cursor, loading, error, canGoBack, currentRepoPath, width }: Props) {
  const scrollRef = useRef<ScrollBoxRenderable>(null)
  const contentWidth = Math.max(20, width - 6)
  const branchWidth = Math.min(28, Math.max(10, Math.floor(contentWidth * 0.32)))
  const pathWidth = Math.max(10, contentWidth - branchWidth - 4)

  const groups = useMemo(
    () =>
      roots
        .map((root) => ({
          root,
          label: basename(root) || root,
          entries: entries.filter((entry) => entry.root === root),
        }))
        .filter((group) => group.entries.length > 0),
    [roots, entries],
  )

  const indexByPath = useMemo(() => new Map(entries.map((entry, index) => [entry.path, index])), [entries])
  const selected = entries[cursor]

  useEffect(() => {
    if (selected) scrollRef.current?.scrollChildIntoView(`repo-row-${indexByPath.get(selected.path)}`)
  }, [selected, indexByPath, entries.length])

  const rootsLabel = roots.map(prettyPath).join(" and ")
  const rightStatus = loading ? "Scanning…" : `${entries.length} found`
  const footerHint = loading
    ? "scanning repositories…"
    : canGoBack
      ? "j/k move · enter open · r rescan · esc back · q quit"
      : "j/k move · enter open · r rescan · q quit"

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={theme.bg}>
      <box
        height={1}
        flexDirection="row"
        justifyContent="space-between"
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={theme.header}
        flexShrink={0}
      >
        <text wrapMode="none">
          <span fg={theme.accent}>gitui</span>
          <span fg={theme.dim}> · </span>
          <span fg={theme.text}>repositories</span>
        </text>
        <text fg={loading ? theme.yellow : theme.muted} wrapMode="none">
          {rightStatus}
        </text>
      </box>

      <box
        title={loading && entries.length === 0 ? "Scanning repositories" : `Repositories (${entries.length})`}
        titleColor={theme.accent}
        border
        borderStyle="rounded"
        borderColor={theme.borderFocus}
        backgroundColor={theme.panel}
        flexDirection="column"
        flexGrow={1}
        minHeight={0}
        marginLeft={1}
        marginRight={1}
        marginTop={1}
        marginBottom={1}
      >
        <scrollbox ref={scrollRef} focusable={false} width="100%" height="100%">
          {error ? (
            <box paddingLeft={1} paddingRight={1} paddingTop={1} width="100%">
              <text fg={theme.red} wrapMode="word">
                {error}
              </text>
            </box>
          ) : entries.length === 0 ? (
            <box flexDirection="column" paddingLeft={1} paddingRight={1} paddingTop={1} width="100%">
              <text fg={theme.text} wrapMode="word">
                {loading ? `Scanning ${rootsLabel}…` : `No git repositories found under ${rootsLabel}.`}
              </text>
              {loading ? null : (
                <text fg={theme.muted} wrapMode="word">
                  Press r to rescan, or launch gitui with an explicit repository path.
                </text>
              )}
            </box>
          ) : (
            groups.map((group) => (
              <box key={group.root} flexDirection="column" width="100%">
                <box height={1} paddingLeft={1} backgroundColor={theme.header} width="100%">
                  <text fg={theme.muted} wrapMode="none">
                    {group.label} ({group.entries.length})
                  </text>
                </box>
                {group.entries.map((entry) => {
                  const index = indexByPath.get(entry.path) ?? -1
                  const active = index === cursor
                  const current = entry.path === currentRepoPath
                  const pathText = truncateRight(entry.relativePath, pathWidth).padEnd(pathWidth)
                  const branchText = truncateRight(entry.branch ?? "", branchWidth)
                  return (
                    <box
                      id={`repo-row-${index}`}
                      key={entry.path}
                      height={1}
                      paddingLeft={1}
                      paddingRight={1}
                      width="100%"
                      backgroundColor={active ? theme.selectedBg : undefined}
                    >
                      <text fg={active ? theme.selectedFg : theme.text} wrapMode="none">
                        <span fg={current ? theme.green : theme.dim}>{current ? "*" : " "}</span>
                        <span> {pathText}</span>
                        <span fg={active ? theme.selectedFg : theme.cyan}>{branchText}</span>
                      </text>
                    </box>
                  )
                })}
              </box>
            ))
          )}
        </scrollbox>
      </box>

      <box flexDirection="column" height={2} flexShrink={0} paddingLeft={1} paddingRight={1}>
        <text fg={theme.muted} wrapMode="none">
          {truncateRight(
            selected ? `${prettyPath(selected.path)}${selected.branch ? ` · ${selected.branch}` : ""}` : rootsLabel,
            Math.max(10, width - 2),
          )}
        </text>
        <text fg={theme.dim} wrapMode="none">
          {truncateRight(footerHint, Math.max(10, width - 2))}
        </text>
      </box>
    </box>
  )
}
