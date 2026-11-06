# gitui

A small, keyboard-driven git client built with [OpenTUI](https://opentui.com) and React.

It is intentionally narrow: one repository, local branches, file-level staging, commits, fetch/pull/push, and a branch history preview. Nothing destructive.

## Requirements

- [Bun](https://bun.sh) 1.3.14 or newer
- `git` on your `PATH`
- A terminal at least 70×20
- SSH keys loaded in `ssh-agent` (or HTTPS credentials available through your git credential helper)

Network commands run non-interactively so they can never take over the terminal. If git needs a credential or an editor, the command fails and the error is shown inside the app instead of hanging the TUI.

## Run

```sh
bun install
bun run dev                 # current directory
bun run dev /path/to/repo   # another repository
```

The current directory (or the given path) must be inside a git working tree.

## What it does

- **Branches** — local branches, current branch marked with `*`. Highlighting a branch previews its last 100 commits without checking it out. `Enter` checks it out.
- **Changes** — staged, unstaged, untracked and conflicted files. File-level stage/unstage, stage all, unstage all.
- **Preview** — diff for the selected file, or a commit's metadata, stat and patch. Commit history follows the highlighted branch.
- **Commit** — multi-line message modal, `Ctrl+S` to commit. `A` amends the last commit and prefills its message.
- **Fetch / pull / push** — `fetch --all --prune`, `pull` with your git config, and `push` with automatic upstream setup.
- **Conflicts** — detected and surfaced. The app blocks commit, checkout, pull and push while the index has unmerged entries. Resolve files in your editor and stage them individually here to mark them resolved.
- **Multi-step operations** — merge, rebase, cherry-pick and revert are detected. A merge can be finished by committing from the app; rebase/cherry-pick/revert must be finished with `git <operation> --continue`.

## Keys

| Key | Action |
| --- | --- |
| `Tab` / `Shift+Tab` | cycle Branches → Changes → Commits → Preview |
| `l` | jump to Commits |
| `j` / `k`, arrows | move selection / scroll |
| `g` / `G` | top / bottom |
| `Enter` | checkout branch / focus preview |
| `space` | stage or unstage selected file |
| `a` / `u` | stage all / unstage all |
| `c` | commit staged changes |
| `A` | amend the last commit |
| `f` | fetch all remotes (`--prune`) |
| `p` / `P` | pull / push |
| `r` | refresh |
| `?` | help |
| `q` | quit |
| `Esc` | close modal / return to Changes |

## Deliberate limitations

- No hunk or line staging
- No in-app conflict resolver; no editor launching
- No stash, rebase UI, cherry-pick, revert, reset, discard or force push
- No remote-branch list, branch creation/deletion, or multi-repo picker
- History is capped at the last 100 commits per branch
- No filesystem watcher; refresh after actions with `r`

## Development

```sh
bun run typecheck
bun test
```

`scripts/demo-repo.sh` creates a throwaway repository with branches, a bare remote, and mixed changes:

```sh
./scripts/demo-repo.sh
# then run the command it prints, e.g.:
bun run dev /tmp/gitui-demo-xxxx/repo
```
