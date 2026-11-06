import type { ScrollBoxRenderable } from "@opentui/core"
import type { RefObject } from "react"
import type { BranchGraphData, Commit, CommitDetail, Preview, PreviewData } from "../types"
import { theme } from "../theme"

type TextSegment = {
  text: string
  fg: string
}

function truncateSegments(segments: TextSegment[], width: number): TextSegment[] {
  const total = segments.reduce((sum, segment) => sum + segment.text.length, 0)
  if (total <= width) return segments
  if (width <= 0) return []
  if (width === 1) return [{ text: "…", fg: segments[0]?.fg ?? theme.text }]

  const kept: TextSegment[] = []
  let remaining = width - 1
  for (const segment of segments) {
    if (remaining <= 0) break
    if (segment.text.length <= remaining) {
      kept.push(segment)
      remaining -= segment.text.length
    } else {
      kept.push({ ...segment, text: segment.text.slice(0, remaining) })
      break
    }
  }
  kept.push({ text: "…", fg: kept.at(-1)?.fg ?? theme.text })
  return kept
}

export type MainContent =
  | {
      kind: "graph"
      data: BranchGraphData | null
      loading: boolean
      error: string | null
    }
  | {
      kind: "commit"
      commit: Commit | null
      data: CommitDetail | null
      loading: boolean
      error: string | null
    }
  | {
      kind: "diff"
      preview: Preview | null
      data: PreviewData | null
      loading: boolean
    }

type Props = {
  title: string
  width: number
  content: MainContent
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

function CommitDetailView({ detail }: { detail: CommitDetail }) {
  return (
    <box flexDirection="column" width="100%">
      <text fg={theme.accent} wrapMode="word">
        {detail.subject}
      </text>
      <text fg={theme.text} wrapMode="word">
        {detail.shortHash} · {detail.author}
      </text>
      <text fg={theme.muted} wrapMode="none">
        {detail.date}
      </text>
      {detail.merge ? (
        <text fg={theme.yellow}>Merge commit — showing the diff against its first parent.</text>
      ) : null}
      {detail.truncated ? <text fg={theme.yellow}>Preview truncated.</text> : null}
      {detail.body ? (
        <box marginTop={1} width="100%">
          <text content={detail.body} fg={theme.text} wrapMode="word" />
        </box>
      ) : null}
      {detail.stat ? (
        <box marginTop={1} width="100%">
          <text content={detail.stat} fg={theme.muted} wrapMode="word" />
        </box>
      ) : null}
      <box marginTop={1} flexDirection="column" width="100%">
        {detail.files.length > 0 ? (
          detail.files.map((file, index) => (
            <box
              key={`${file.path}:${index}`}
              marginTop={index === 0 ? 0 : 1}
              flexDirection="column"
              width="100%"
            >
              <text fg={theme.cyan} wrapMode="none">
                {file.path}
              </text>
              <DiffView patch={file.patch} />
            </box>
          ))
        ) : (
          <text fg={theme.muted}>No file changes.</text>
        )}
      </box>
    </box>
  )
}

function DiffContent({
  preview,
  data,
  loading,
}: {
  preview: Preview | null
  data: PreviewData | null
  loading: boolean
}) {
  if (loading) return <text fg={theme.muted}>Loading…</text>
  if (!preview) return <text fg={theme.muted}>Select a file to preview its diff.</text>
  if (!data) return <text fg={theme.muted}>Nothing to show.</text>
  if (data.kind === "error") {
    return (
      <text fg={theme.red} wrapMode="word">
        {data.message}
      </text>
    )
  }

  if (data.kind === "file") {
    return (
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
    )
  }

  return <CommitDetailView detail={data.data} />
}

function GraphContent({
  data,
  loading,
  error,
  width,
}: {
  data: BranchGraphData | null
  loading: boolean
  error: string | null
  width: number
}) {
  if (loading && !data) return <text fg={theme.muted}>Loading branch graph…</text>
  if (error) {
    return (
      <text fg={theme.red} wrapMode="word">
        {error}
      </text>
    )
  }
  if (!data || data.rows.length === 0) {
    return <text fg={theme.muted}>No commits yet.</text>
  }

  return (
    <box flexDirection="column" width="100%">
      {data.rows.map((row, index) => {
        const segments: TextSegment[] = [{ text: row.graph, fg: theme.cyan }]
        if (row.commit) {
          segments.push(
            { text: row.commit.shortHash, fg: theme.yellow },
            ...(row.commit.decorations
              ? [{ text: ` (${row.commit.decorations})`, fg: theme.green }]
              : []),
            { text: ` ${row.commit.subject}`, fg: theme.text },
            { text: ` (${row.commit.date})`, fg: theme.muted },
          )
        }
        return (
          <box key={index} height={1} width="100%">
            <text wrapMode="none">
              {truncateSegments(segments, width).map((segment, segmentIndex) => (
                <span key={segmentIndex} fg={segment.fg}>
                  {segment.text}
                </span>
              ))}
            </text>
          </box>
        )
      })}
      {data.truncated ? (
        <box marginTop={1} width="100%">
          <text fg={theme.yellow}>Older commits are hidden.</text>
        </box>
      ) : null}
    </box>
  )
}

function CommitContent({
  commit,
  data,
  loading,
  error,
}: {
  commit: Commit | null
  data: CommitDetail | null
  loading: boolean
  error: string | null
}) {
  if (error) {
    return (
      <text fg={theme.red} wrapMode="word">
        {error}
      </text>
    )
  }
  if (!commit) {
    return <text fg={theme.muted}>{loading ? "Loading history…" : "No commits yet."}</text>
  }
  if (!data) {
    return (
      <box flexDirection="column" width="100%">
        <text fg={theme.accent} wrapMode="word">
          {commit.subject}
        </text>
        <text fg={theme.text} wrapMode="word">
          {commit.shortHash} · {commit.author}
        </text>
        <text fg={theme.muted} wrapMode="none">
          {commit.date}
        </text>
        <box height={1} />
        <text fg={theme.muted}>{loading ? "Loading diff…" : "No diff available."}</text>
      </box>
    )
  }

  return <CommitDetailView detail={data} />
}

export function MainPane({ title, width, content, focused, scrollRef }: Props) {
  const contentWidth = Math.max(1, width - 4)

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
          {content.kind === "diff" ? (
            <DiffContent preview={content.preview} data={content.data} loading={content.loading} />
          ) : content.kind === "graph" ? (
            <GraphContent
              data={content.data}
              loading={content.loading}
              error={content.error}
              width={contentWidth}
            />
          ) : (
            <CommitContent
              commit={content.commit}
              data={content.data}
              loading={content.loading}
              error={content.error}
            />
          )}
        </box>
      </scrollbox>
    </box>
  )
}
