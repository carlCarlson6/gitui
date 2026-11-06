import type { Panel } from "../types"
import { theme } from "../theme"
import { truncateRight } from "../lib/format"

const HINTS: Record<Panel, string> = {
  branches:
    "j/k select · enter checkout · d delete · D delete+remote · right: branch graph · tab next · c commit · esc repos · ? help · q quit",
  changes:
    "space stage/unstage · u stage file · A stage all · U unstage all · d/D undo · right: file diff · tab next · c commit · esc repos · ? help",
  commits:
    "j/k select commit · g/G top/bottom · enter scroll diff · right: commit diff · tab next · esc repos · ? help · q quit",
  main: "j/k scroll · PgUp/PgDn · g/G top/bottom · tab next · esc repos · ? help · q quit",
}

type Props = {
  focus: Panel
  width: number
  busy: string | null
}

export function Footer({ focus, width, busy }: Props) {
  const text = busy ? `${busy}… keys are locked until the command finishes` : HINTS[focus]
  return (
    <box height={1} paddingLeft={1} paddingRight={1} backgroundColor={theme.footer} flexShrink={0}>
      <text fg={busy ? theme.yellow : theme.muted} wrapMode="none">
        {truncateRight(text, Math.max(10, width - 2))}
      </text>
    </box>
  )
}
