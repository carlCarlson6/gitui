import type { ScrollBoxRenderable } from "@opentui/core"
import type { RefObject } from "react"
import type { Preview, PreviewData } from "../types"
import { theme } from "../theme"

type Props = {
  title: string
  preview: Preview | null
  data: PreviewData | null
  loading: boolean
  focused: boolean
  scrollRef: RefObject<ScrollBoxRenderable | null>
}

function DiffView({ patch }: { patch: string }) {
  return (
    <diff
      diff={patch}
      view="unified"
      showLineNumbers={true}
      wrapMode="word"
      fg={theme.text}
      addedBg={theme.diffAddedBg}
      removedBg={theme.diffRemovedBg}
      contextBg={theme.diffContextBg}
      addedContentBg={theme.diffAddedContentBg}
      removedContentBg={theme.diffRemovedContentBg}
      contextContentBg={theme.diffContextContentBg}
      addedSignColor={theme.green}
      removedSignColor={theme.red}
      lineNumberFg={theme.muted}
      lineNumberBg={theme.diffContextBg}
    />
  )
}

export function MainPane({ title, preview, data, loading, focused, scrollRef }: Props) {
  return (
    <box
      title={title}
      titleColor={focused ? theme.accent : theme.muted}
      border
      borderStyle="rounded"
      borderColor={focused ? theme.borderFocus : theme.border}
      backgroundColor={theme.panel}
      flexDirection="column"
      flexGrow={1}
      minWidth={20}
      flexShrink={1}
    >
      <scrollbox ref={scrollRef} focusable={false} width="100%" height="100%" scrollX={false}>
        <box flexDirection="column" paddingLeft={1} paddingRight={1} paddingTop={1} paddingBottom={1} width="100%">
          {loading ? (
            <text fg={theme.muted}>Loading…</text>
          ) : !preview ? (
            <text fg={theme.muted}>Select a file or commit to preview it.</text>
          ) : !data ? (
            <text fg={theme.muted}>Nothing to show.</text>
          ) : data.kind === "error" ? (
            <text fg={theme.red} wrapMode="word">
              {data.message}
            </text>
          ) : data.kind === "file" ? (
            <box flexDirection="column" width="100%">
              {data.data.note ? (
                <text
                  fg={preview.kind === "file" && preview.section === "conflicted" ? theme.red : theme.yellow}
                  wrapMode="word"
                >
                  {data.data.note}
                </text>
              ) : null}
              {data.data.truncated ? (
                <text fg={theme.yellow}>Preview truncated. Use the terminal for the full diff.</text>
              ) : null}
              {data.data.note ? <box height={1} /> : null}
              {data.data.text ? (
                data.data.mode === "content" ? (
                  <text content={data.data.text} fg={theme.text} wrapMode="char" />
                ) : (
                  <DiffView patch={data.data.text} />
                )
              ) : data.data.note ? null : (
                <text fg={theme.muted}>No changes.</text>
              )}
            </box>
          ) : (
            <box flexDirection="column" width="100%">
              <text fg={theme.accent} wrapMode="word">
                {data.data.subject}
              </text>
              <text fg={theme.text} wrapMode="word">
                {data.data.shortHash} · {data.data.author}
              </text>
              <text fg={theme.muted} wrapMode="word">
                &lt;{data.data.email}&gt; · {data.data.date}
              </text>
              {data.data.merge ? (
                <text fg={theme.yellow}>Merge commit — showing the diff against its first parent.</text>
              ) : null}
              {data.data.truncated ? <text fg={theme.yellow}>Preview truncated.</text> : null}
              {data.data.body ? (
                <box marginTop={1} width="100%">
                  <text content={data.data.body} fg={theme.text} wrapMode="word" />
                </box>
              ) : null}
              {data.data.stat ? (
                <box marginTop={1} width="100%">
                  <text content={data.data.stat} fg={theme.muted} wrapMode="none" />
                </box>
              ) : null}
              <box marginTop={1} width="100%">
                {data.data.patch ? (
                  <DiffView patch={data.data.patch} />
                ) : (
                  <text fg={theme.muted}>No file changes.</text>
                )}
              </box>
            </box>
          )}
        </box>
      </scrollbox>
    </box>
  )
}
