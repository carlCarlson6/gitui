import type { ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import type { FileRow } from "../types"
import { theme } from "../theme"
import { statusCodeColor, truncateLeft } from "../lib/format"
import { displayPath, groupRows } from "../git/status"

type Props = {
  rows: FileRow[]
  selectedIndex: number
  focused: boolean
  width: number
}

export function ChangesPanel({ rows, selectedIndex, focused, width }: Props) {
  const scrollRef = useRef<ScrollBoxRenderable>(null)
  const grouped = groupRows(rows)
  const contentWidth = Math.max(8, width - 6)
  const indexByKey = new Map(rows.map((row, index) => [row.key, index]))
  const conflictCount = grouped.conflicted.length

  useEffect(() => {
    if (selectedIndex >= 0) scrollRef.current?.scrollChildIntoView(`change-row-${selectedIndex}`)
  }, [selectedIndex, rows.length, focused])

  const renderRow = (row: FileRow) => {
    const index = indexByKey.get(row.key) ?? -1
    const selected = index === selectedIndex
    const path = truncateLeft(displayPath(row), Math.max(6, contentWidth - 3))
    return (
      <box
        id={`change-row-${index}`}
        key={row.key}
        height={1}
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={selected ? theme.selectedBg : undefined}
        width="100%"
      >
        <text fg={selected ? theme.selectedFg : theme.text} wrapMode="none">
          <span fg={statusCodeColor(row.code, row.section)}>{row.code.padEnd(2)}</span>
          <span> {path}</span>
        </text>
      </box>
    )
  }

  const sections = [
    {
      title: `Conflicts (${grouped.conflicted.length})`,
      color: theme.red,
      rows: grouped.conflicted,
    },
    {
      title: `Staged (${grouped.staged.length})`,
      color: theme.green,
      rows: grouped.staged,
    },
    {
      title: `Unstaged (${grouped.unstaged.length})`,
      color: theme.yellow,
      rows: grouped.unstaged,
    },
  ].filter((section) => section.rows.length > 0)

  return (
    <box
      title={`Changes (${rows.length})`}
      titleColor={focused ? (conflictCount ? theme.red : theme.accent) : conflictCount ? theme.red : theme.muted}
      border
      borderStyle="rounded"
      borderColor={focused ? (conflictCount ? theme.red : theme.borderFocus) : conflictCount ? theme.red : theme.border}
      backgroundColor={theme.panel}
      flexDirection="column"
      flexGrow={2}
      minHeight={5}
      flexShrink={1}
      width="100%"
    >
      <scrollbox ref={scrollRef} focusable={false} width="100%" height="100%">
        {rows.length === 0 ? (
          <box height={1} paddingLeft={1}>
            <text fg={theme.muted} wrapMode="none">
              Working tree clean
            </text>
          </box>
        ) : (
          sections.map((section) => (
            <box key={section.title} flexDirection="column" width="100%">
              <box height={1} paddingLeft={1} backgroundColor={theme.header} width="100%">
                <text fg={section.color} wrapMode="none">
                  {section.title}
                </text>
              </box>
              {section.rows.map(renderRow)}
            </box>
          ))
        )}
      </scrollbox>
    </box>
  )
}
