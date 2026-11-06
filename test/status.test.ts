import { describe, expect, test } from "bun:test"
import { buildFileRows, groupRows, parseStatus } from "../src/git/status"

function status(records: string[]): string {
  return records.join("\0") + "\0"
}

describe("parseStatus", () => {
  test("parses branch headers, staged, unstaged and untracked files", () => {
    const raw = status([
      "# branch.oid abcdef123456",
      "# branch.head main",
      "# branch.upstream origin/main",
      "# branch.ab +2 -1",
      "1 M. N... 100644 100644 100644 aaaaaaa bbbbbbb src/app.ts",
      "1 .M N... 100644 100644 100644 aaaaaaa aaaaaaa src/other file.ts",
      "? notes.txt",
    ])

    const parsed = parseStatus(raw)
    expect(parsed.head).toBe("main")
    expect(parsed.upstream).toBe("origin/main")
    expect(parsed.ahead).toBe(2)
    expect(parsed.behind).toBe(1)
    expect(parsed.entries).toHaveLength(3)

    const rows = buildFileRows(parsed)
    const grouped = groupRows(rows)
    expect(grouped.staged).toHaveLength(1)
    expect(grouped.unstaged).toHaveLength(2)
    expect(grouped.conflicted).toHaveLength(0)
    expect(grouped.staged[0]?.path).toBe("src/app.ts")
    expect(grouped.unstaged.map((row) => row.path)).toEqual(["src/other file.ts", "notes.txt"])
    expect(grouped.unstaged[1]?.untracked).toBe(true)
  })

  test("parses renames and consumes the original path record", () => {
    const raw = status([
      "# branch.oid abcdef",
      "# branch.head main",
      "2 R. N... 100644 100644 100644 aaaaaaa bbbbbbb R100 new name.ts",
      "old name.ts",
      "1 .M N... 100644 100644 100644 aaaaaaa aaaaaaa after-rename.ts",
    ])

    const parsed = parseStatus(raw)
    expect(parsed.entries).toHaveLength(2)
    expect(parsed.entries[0]).toMatchObject({
      path: "new name.ts",
      origPath: "old name.ts",
      x: "R",
      y: ".",
    })
    expect(parsed.entries[1]?.path).toBe("after-rename.ts")

    const staged = buildFileRows(parsed).filter((row) => row.section === "staged")
    expect(staged[0]?.origPath).toBe("old name.ts")
  })

  test("parses unmerged entries separately", () => {
    const raw = status([
      "# branch.oid abcdef",
      "# branch.head main",
      "u UU N... 100644 100644 100644 100644 aaaaaaa bbbbbbb ccccccc conflict.txt",
      "1 .M N... 100644 100644 100644 aaaaaaa aaaaaaa changed.txt",
    ])

    const parsed = parseStatus(raw)
    const rows = buildFileRows(parsed)
    const grouped = groupRows(rows)
    expect(grouped.conflicted).toHaveLength(1)
    expect(grouped.conflicted[0]?.code).toBe("UU")
    expect(grouped.unstaged).toHaveLength(1)
  })

  test("handles detached HEAD and unborn branches", () => {
    const detached = parseStatus(
      status(["# branch.oid abcdef", "# branch.head (detached)", "1 .M N... 100644 100644 100644 aaaaaaa aaaaaaa a.txt"]),
    )
    expect(detached.detached).toBe(true)
    expect(detached.head).toBeNull()

    const unborn = parseStatus(status(["# branch.oid (initial)", "# branch.head main", "? first.txt"]))
    expect(unborn.unborn).toBe(true)
    expect(unborn.oid).toBeNull()
    expect(unborn.head).toBe("main")
    expect(buildFileRows(unborn)).toHaveLength(1)
  })

  test("keeps empty and trailing-space paths intact", () => {
    const raw = status([
      "# branch.head main",
      "? file with  two spaces.txt",
      "1 .M N... 100644 100644 100644 aaaaaaa aaaaaaa  leading-space.txt",
    ])
    const parsed = parseStatus(raw)
    expect(parsed.entries[0]?.path).toBe("file with  two spaces.txt")
    expect(parsed.entries[1]?.path).toBe(" leading-space.txt")
  })
})
