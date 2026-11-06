import type { ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import type { Branch } from "../types"
import { theme } from "../theme"
import { truncateRight } from "../lib/format"

type Props = {
  branches: Branch[]
  currentBranch: string | null
  selectedBranch: string | null
  focused: boolean
  width: number
  detached: boolean
}

export function BranchPanel({ branches, currentBranch, selectedBranch, focused, width, detached }: Props) {
  const scrollRef = useRef<ScrollBoxRenderable>(null)
  const selectedIndex = branches.findIndex((branch) => branch.name === selectedBranch)
  const contentWidth = Math.max(8, width - 6)

  useEffect(() => {
    if (selectedIndex >= 0) scrollRef.current?.scrollChildIntoView(`branch-row-${selectedIndex}`)
  }, [selectedIndex, branches.length, focused])

  return (
    <box
      title={`Branches (${branches.length})`}
      titleColor={focused ? theme.accent : theme.muted}
      border
      borderStyle="rounded"
      borderColor={focused ? theme.borderFocus : theme.border}
      backgroundColor={theme.panel}
      flexDirection="column"
      flexGrow={1}
      minHeight={4}
      flexShrink={1}
      width="100%"
    >
      <scrollbox ref={scrollRef} focusable={false} width="100%" height="100%">
        {detached ? (
          <box height={1} paddingLeft={1}>
            <text fg={theme.red} wrapMode="none">
              HEAD is detached
            </text>
          </box>
        ) : null}
        {branches.length === 0 ? (
          <box height={1} paddingLeft={1}>
            <text fg={theme.muted} wrapMode="none">
              No local branches
            </text>
          </box>
        ) : (
          branches.map((branch, index) => {
            const selected = branch.name === selectedBranch
            const current = branch.name === currentBranch
            const label = truncateRight(branch.name, Math.max(4, contentWidth - 2))
            return (
              <box
                id={`branch-row-${index}`}
                key={branch.name}
                height={1}
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={selected ? theme.selectedBg : undefined}
                width="100%"
              >
                <text fg={selected ? theme.selectedFg : theme.text} wrapMode="none">
                  <span fg={selected ? theme.selectedFg : current ? theme.green : theme.dim}>
                    {current ? "*" : " "}
                  </span>
                  <span> {label}</span>
                </text>
              </box>
            )
          })
        )}
      </scrollbox>
    </box>
  )
}
