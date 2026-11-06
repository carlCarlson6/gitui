import type { ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import type { Commit } from "../types"
import { theme } from "../theme"
import { truncateRight } from "../lib/format"

type Props = {
  commits: Commit[]
  selectedIndex: number
  focused: boolean
  loading: boolean
  error: string | null
  width: number
  label: string
}

export function CommitsPanel({ commits, selectedIndex, focused, loading, error, width, label }: Props) {
  const scrollRef = useRef<ScrollBoxRenderable>(null)
  const contentWidth = Math.max(8, width - 6)

  useEffect(() => {
    if (selectedIndex >= 0) scrollRef.current?.scrollChildIntoView(`commit-row-${selectedIndex}`)
  }, [selectedIndex, commits.length, focused])

  return (
    <box
      title={`Commits · ${label}`}
      titleColor={focused ? theme.accent : theme.muted}
      border
      borderStyle="rounded"
      borderColor={focused ? theme.borderFocus : theme.border}
      backgroundColor={theme.panel}
      flexDirection="column"
      flexGrow={2}
      minHeight={5}
      flexShrink={1}
      width="100%"
    >
      <scrollbox ref={scrollRef} focusable={false} width="100%" height="100%">
        {error ? (
          <box height={3} paddingLeft={1} paddingRight={1}>
            <text fg={theme.red} wrapMode="word">
              {truncateRight(error, Math.max(10, contentWidth * 2))}
            </text>
          </box>
        ) : commits.length === 0 ? (
          <box height={1} paddingLeft={1}>
            <text fg={theme.muted} wrapMode="none">
              {loading ? "Loading…" : "No commits yet"}
            </text>
          </box>
        ) : (
          commits.map((commit, index) => {
            const selected = index === selectedIndex
            const subject = truncateRight(commit.subject, Math.max(4, contentWidth - commit.shortHash.length - 1))
            return (
              <box
                id={`commit-row-${index}`}
                key={commit.hash}
                height={1}
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={selected ? theme.selectedBg : undefined}
                width="100%"
              >
                <text fg={selected ? theme.selectedFg : theme.text} wrapMode="none">
                  <span fg={selected ? theme.selectedFg : theme.cyan}>{commit.shortHash}</span>
                  <span> {subject}</span>
                </text>
              </box>
            )
          })
        )}
      </scrollbox>
    </box>
  )
}
