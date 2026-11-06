import type { TextareaRenderable } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import { useRef, useState } from "react"
import { theme } from "../theme"
import { ModalFrame } from "./Modal"

type Props = {
  initial: string
  amend: boolean
  width: number
  height: number
  busy: boolean
  actionError: string | null
  onSubmit: (message: string) => void
  onCancel: () => void
}

export function CommitModal({ initial, amend, width, height, busy, actionError, onSubmit, onCancel }: Props) {
  const textareaRef = useRef<TextareaRenderable>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const error = localError ?? actionError
  const textareaHeight = Math.max(3, height - 12)

  const submit = () => {
    if (busy) return
    const message = textareaRef.current?.plainText ?? ""
    if (!message.trim()) {
      setLocalError("A commit message is required.")
      return
    }
    setLocalError(null)
    onSubmit(message.trim())
  }

  useKeyboard((key) => {
    if (key.name === "escape") {
      key.preventDefault()
      if (!busy) onCancel()
      return
    }
    if (key.ctrl && key.name === "s") {
      key.preventDefault()
      submit()
    }
  })

  return (
    <ModalFrame
      title={amend ? "Amend last commit" : "Commit staged changes"}
      width={width}
      height={height}
      footer={busy ? "Committing…" : "ctrl+s commit · esc cancel"}
    >
      <box flexDirection="column" width="100%" height="100%">
        <box height={1} width="100%">
          <text fg={theme.muted} wrapMode="none">
            {amend
              ? "Amend the last commit; staged changes are included."
              : "Only staged changes are included."}
          </text>
        </box>
        <box
          border
          borderStyle="rounded"
          borderColor={theme.border}
          backgroundColor={theme.bg}
          width="100%"
          height={textareaHeight}
          flexShrink={0}
          marginTop={1}
        >
          <textarea
            ref={textareaRef}
            initialValue={initial}
            focused={true}
            placeholder="Write a commit message…"
            width="100%"
            height="100%"
            textColor={theme.text}
            backgroundColor={theme.bg}
            focusedBackgroundColor={theme.bg}
            focusedTextColor={theme.text}
            placeholderColor={theme.muted}
            cursorColor={theme.accent}
            wrapMode="word"
          />
        </box>
        <box height={5} width="100%" marginTop={1} flexShrink={0}>
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
