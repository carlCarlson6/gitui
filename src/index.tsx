import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./app"
import { theme } from "./theme"

const startPath = process.argv.slice(2).find((arg) => !arg.startsWith("-")) ?? null

const renderer = await createCliRenderer({
  backgroundColor: theme.bg,
  exitOnCtrlC: true,
  autoFocus: false,
  targetFps: 30,
})

try {
  createRoot(renderer).render(<App startPath={startPath} />)
  await renderer.closed
} finally {
  renderer.destroy()
}
