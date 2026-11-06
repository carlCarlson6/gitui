export type CappedText = {
  text: string
  truncated: boolean
}

export function capText(text: string, maxChars = 512 * 1024, maxLines = 2500): CappedText {
  let truncated = false
  let result = text

  if (result.length > maxChars) {
    result = result.slice(0, maxChars)
    const lastNewline = result.lastIndexOf("\n")
    if (lastNewline > 0) result = result.slice(0, lastNewline)
    truncated = true
  }

  const lines = result.split("\n")
  if (lines.length > maxLines) {
    result = lines.slice(0, maxLines).join("\n")
    truncated = true
  }

  return { text: result, truncated }
}

export function looksBinary(text: string): boolean {
  return text.slice(0, 8192).includes("\0")
}
