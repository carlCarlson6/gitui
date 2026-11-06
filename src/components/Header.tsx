import { useAnimationTick } from "@opentui/react"
import { useState } from "react"
import type { StatusSnapshot } from "../types"
import type { Operation } from "../git/repo"
import { theme } from "../theme"
import { formatSync, repoName, truncateRight } from "../lib/format"

type Props = {
  root: string
  status: StatusSnapshot | null
  width: number
  busy: string | null
  message: string
  operation: Operation
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

export function Header({ root, status, width, busy, message, operation }: Props) {
  const [tick, setTick] = useState(0)
  useAnimationTick(busy ? 12 : undefined, () => setTick((value) => (value + 1) % SPINNER.length))

  const branch = status?.detached ? "detached HEAD" : (status?.head ?? "HEAD")
  const sync = status ? formatSync(status.ahead, status.behind, !!status.upstream) : ""
  const right = busy ? `${SPINNER[tick]} ${busy}…` : message
  const rightWidth = Math.min(right.length, Math.max(12, Math.floor(width * 0.42)))
  const leftBudget = Math.max(12, width - rightWidth - 5)

  const name = truncateRight(repoName(root), Math.max(6, Math.floor(leftBudget * 0.4)))
  const operationLabel = operation ? operation.toUpperCase() : ""
  const branchBudget = Math.max(6, leftBudget - name.length - sync.length - operationLabel.length - 10)
  const branchLabel = truncateRight(branch, branchBudget)

  return (
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
        <span fg={theme.text}>{name}</span>
        <span fg={theme.dim}> · </span>
        <span fg={status?.detached ? theme.red : theme.purple}>{branchLabel}</span>
        {sync ? <span fg={theme.yellow}> {sync}</span> : null}
        {operationLabel ? <span fg={theme.red}> · {operationLabel}</span> : null}
      </text>
      <text fg={busy ? theme.yellow : theme.muted} wrapMode="none">
        {truncateRight(right, rightWidth)}
      </text>
    </box>
  )
}
