import type { ScrollBoxRenderable } from "@opentui/core"
import type { ReactNode, RefObject } from "react"
import { theme } from "../theme"

type FrameProps = {
  title: string
  width: number
  height: number
  footer?: string
  children: ReactNode
}

export function ModalFrame({ title, width, height, footer, children }: FrameProps) {
  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      zIndex={100}
      alignItems="center"
      justifyContent="center"
      focusable={false}
    >
      <box
        title={title}
        titleColor={theme.accent}
        border
        borderStyle="rounded"
        borderColor={theme.borderFocus}
        backgroundColor={theme.panel}
        width={width}
        height={height}
        flexDirection="column"
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        paddingBottom={1}
      >
        <box flexGrow={1} flexDirection="column" width="100%" minHeight={0}>
          {children}
        </box>
        {footer ? (
          <box height={1} flexShrink={0} width="100%">
            <text fg={theme.muted} wrapMode="none">
              {footer}
            </text>
          </box>
        ) : null}
      </box>
    </box>
  )
}

type TextModalProps = {
  title: string
  body: string
  width: number
  height: number
  scrollRef: RefObject<ScrollBoxRenderable | null>
  footer?: string
  color?: string
}

export function TextModal({ title, body, width, height, scrollRef, footer, color }: TextModalProps) {
  return (
    <ModalFrame title={title} width={width} height={height} footer={footer ?? "esc close · j/k scroll"}>
      <scrollbox ref={scrollRef} focusable={false} width="100%" height="100%" scrollX={false}>
        <box width="100%">
          <text content={body || "No details."} fg={color ?? theme.text} wrapMode="word" />
        </box>
      </scrollbox>
    </ModalFrame>
  )
}
