# gitui

A small, keyboard-driven git client built with [OpenTUI](https://opentui.com) and React.

It is intentionally narrow: one repository at a time, local branches, file-level staging, commits, fetch/pull/push, a branch history preview, and a confirmed undo for unstaged changes.

By default it opens a repository picker that scans `~/DEV` and `~/FIT` for git working trees. Each entry shows the checked-out branch and a yellow `●` when that branch has uncommitted changes. You can also launch straight into a repository.

## Requirements

- [Bun](https://bun.sh) 1.3.14 or newer
- `git` on your `PATH`
- A terminal at least 70×20
- SSH keys loaded in `ssh-agent` (or HTTPS credentials available through your git credential helper)

Network commands run non-interactively so they can never take over the terminal. If git needs a credential or an editor, the command fails and the error is shown inside the app instead of hanging the TUI.

## Run

```sh
bun install
bun run dev                    # repository picker (~/DEV and ~/FIT)
bun run dev /path/to/repo      # open a repository directly
```

The picker scans up to eight directory levels, skips hidden directories and common build/dependency folders, and stops at each repository root. Override the scan roots with a colon-separated list:

```sh
GITUI_REPO_ROOTS="$HOME/DEV:$HOME/FIT" bun run dev
```

In direct mode, the path must be inside a git working tree.

## What it does

- **Branches** — local branches, current branch marked with `*`. Highlighting a branch previews its last 100 commits without checking it out. `Enter` checks it out.
- **Changes** — staged, unstaged, untracked and conflicted files. File-level stage/unstage, stage all, unstage all, and undo the selected unstaged change or all unstaged changes. Undo restores tracked files from the index (staged changes are kept) and deletes selected untracked files after a confirmation prompt.
- **Preview** — diff for the selected file, or a commit's metadata, stat and patch. Commit history follows the highlighted branch.
- **Commit** — multi-line message modal, `Ctrl+S` to commit. `Ctrl+A` amends the last commit and prefills its message. Commits always apply to the checked-out branch; previewing a different branch blocks committing until you check it out.
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
| `u` | stage the selected unstaged file |
| `A` | stage all changes |
| `U` | unstage all changes |
| `d` / `D` | undo the selected unstaged change / all unstaged changes |
| `c` | commit staged changes |
| `Ctrl+A` | amend the last commit |
| `f` | fetch all remotes (`--prune`) |
| `p` / `P` | pull / push |
| `r` | refresh |
| `b` | switch repository |
| `?` | help |
| `q` | quit |
| `Esc` | close modal / toggle the repository list |

Repository picker: `j`/`k` move, `g`/`G` top/bottom, `Enter` open, `r` rescan, `Esc` return to the last open repo, `q` quit.

## Deliberate limitations

- No hunk or line staging or discarding
- No in-app conflict resolver; no editor launching
- No stash, rebase UI, cherry-pick, revert, reset, or force push
- No remote-branch list, branch creation/deletion, or worktree switching inside a repo
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
