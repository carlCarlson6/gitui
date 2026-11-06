import type { Panel } from "../types"
import { theme } from "../theme"
import { truncateRight } from "../lib/format"

const HINTS: Record<Panel, string> = {
  branches:
    "j/k move · enter checkout · tab next · c commit · f fetch · p pull · P push · b repos · ? help · q quit",
  changes:
    "space stage/unstage · a stage all · u unstage all · enter scroll diff · tab next · c commit · b repos · ? help",
  commits:
    "j/k preview commit · g/G top/bottom · enter scroll diff · tab next · c commit · b repos · ? help · q quit",
  main: "j/k scroll · PgUp/PgDn · g/G top/bottom · tab next · esc changes · b repos · ? help · q quit",
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
