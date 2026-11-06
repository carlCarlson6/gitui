import type { InputRenderable, SubmitEvent } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import { useRef, useState } from "react"
import { normalizeRepoName, repoNameProblem } from "../git/create"
import { prettyPath } from "../lib/format"
import { theme } from "../theme"
import { ModalFrame } from "./Modal"

type Props = {
  root: string
  width: number
  height: number
  busy: boolean
  actionError: string | null
  onSubmit: (name: string) => void
  onCancel: () => void
}

export function NewRepoModal({ root, width, height, busy, actionError, onSubmit, onCancel }: Props) {
  const inputRef = useRef<InputRenderable>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const error = localError ?? actionError

  const submit = (value: string | SubmitEvent) => {
    if (busy) return
    const raw = typeof value === "string" ? value : (inputRef.current?.value ?? "")
    const name = normalizeRepoName(raw)
    const problem = repoNameProblem(name)
    if (problem) {
      setLocalError(problem)
      return
    }
    setLocalError(null)
    onSubmit(name)
  }

  useKeyboard((key) => {
    if (key.name === "escape") {
      key.preventDefault()
      if (!busy) onCancel()
    }
  })

  return (
    <ModalFrame
      title="New repository"
      width={width}
      height={height}
      footer={busy ? "Creating repository and GitHub project…" : "enter create · esc cancel"}
    >
      <box flexDirection="column" width="100%" height="100%">
        <box height={1} width="100%" flexShrink={0}>
          <text fg={theme.muted} wrapMode="none">
            Creates a public GitHub repo in {prettyPath(root)}.
          </text>
        </box>
        <box
          border
          borderStyle="rounded"
          borderColor={theme.border}
          backgroundColor={theme.bg}
          width="100%"
          height={3}
          flexShrink={0}
          marginTop={1}
        >
          <input
            ref={inputRef}
            focused={true}
            placeholder="Repository name…"
            width="100%"
            textColor={theme.text}
            backgroundColor={theme.bg}
            focusedBackgroundColor={theme.bg}
            focusedTextColor={theme.text}
            placeholderColor={theme.muted}
            cursorColor={theme.accent}
            onInput={(value) => {
              if (value.includes(" ") && inputRef.current) {
                inputRef.current.value = value.replaceAll(" ", "-")
              }
              if (localError) setLocalError(null)
            }}
            onSubmit={submit}
          />
        </box>
        <box flexGrow={1} minHeight={0} width="100%" marginTop={1}>
          {error ? (
            <text fg={theme.red} wrapMode="word">
              {error.slice(0, 4000)}
            </text>
          ) : null}
        </box>
      </box>
    </ModalFrame>
  )
}
