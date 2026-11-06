# gitui

A small, keyboard-driven git client built with [OpenTUI](https://opentui.com) and React.

It is intentionally narrow: one repository at a time, creating new public GitHub repositories in `~/DEV`, local branches, file-level staging, commits, fetch/pull/push, branch history and commit diff previews, and a confirmed undo for unstaged changes.

By default it opens a repository picker that scans `~/DEV` and `~/FIT` for git working trees. Each entry shows the checked-out branch and a yellow `●` when that branch has uncommitted changes. You can also launch straight into a repository.

While the cursor is on an entry from the `DEV` section, press `n` to create a new repository. Gitui asks for a name, creates the folder under `~/DEV`, runs `git init`, and uses the authenticated [GitHub CLI](https://cli.github.com) to create a matching **public** repository with `origin` configured. This shortcut is only available for the `DEV` section.

## Requirements

- [Bun](https://bun.sh) 1.3.14 or newer
- `git` on your `PATH`
- `gh` on your `PATH`, authenticated with `gh auth login` (for creating new GitHub repositories)
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

- **Repositories** — scans `~/DEV` and `~/FIT`, shows each repo's branch and whether it has uncommitted changes. With the cursor on a repo in the `DEV` section, `n` creates a folder, initializes git, and creates a public GitHub repository.
- **Branches** — local branches, current branch marked with `*`. Branches is selected when a repository opens. Selecting a branch previews its last 100 commits without checking it out. While Branches is focused, the right pane shows a graph of all local and remote branches. `Enter` checks the selected branch out. `a` creates a new branch from the selected branch and checks it out. `d` deletes the local branch; `D` deletes it together with its upstream remote branch after a confirmation prompt.
- **Changes** — staged, unstaged, untracked and conflicted files. File-level stage/unstage, stage all, unstage all, and undo the selected unstaged change or all unstaged changes. Undo restores tracked files from the index (staged changes are kept) and deletes selected untracked files after a confirmation prompt. While Changes is focused, the right pane shows the selected file's diff.
- **Commits** — the selected branch's last 100 commits. While Commits is focused, the right pane shows the selected commit's metadata, stat and full diff across every changed file.
- **Commit** — multi-line message modal, `Ctrl+S` to commit. `Ctrl+A` amends the last commit and prefills its message. Commits always apply to the checked-out branch; previewing a different branch blocks committing until you check it out.
- **Fetch / pull / push** — `fetch --all --prune`, `pull` with your git config, and `push` with automatic upstream setup.
- **Conflicts** — detected and surfaced. The app blocks commit, checkout, pull and push while the index has unmerged entries. Resolve files in your editor and stage them individually here to mark them resolved.
- **Multi-step operations** — merge, rebase, cherry-pick and revert are detected. A merge can be finished by committing from the app; rebase/cherry-pick/revert must be finished with `git <operation> --continue`.

## Keys

| Key | Action |
| --- | --- |
| `Tab` / `Shift+Tab` | cycle Branches → Changes → Commits → right pane |
| `l` | jump to Commits |
| `j` / `k`, arrows | move selection / scroll |
| `g` / `G` | top / bottom |
| `Enter` | checkout branch / focus right pane |
| `a` | Branches: create a branch from the selected branch and check it out |
| `space` | stage or unstage selected file |
| `u` | stage the selected unstaged file |
| `A` | stage all changes |
| `U` | unstage all changes |
| `d` | Branches: delete the local branch · Changes: undo the selected unstaged change |
| `D` | Branches: delete the local and upstream remote branch (confirmed) · Changes: undo all unstaged changes |
| `c` | commit staged changes |
| `Ctrl+A` | amend the last commit |
| `f` | fetch all remotes (`--prune`) |
| `p` / `P` | pull / push |
| `r` | refresh |
| `n` | picker: create a public GitHub repo in the `DEV` section |
| `b` | switch repository |
| `?` | help |
| `q` | quit |
| `Esc` | close modal / toggle the repository list |

Repository picker: `j`/`k` move, `g`/`G` top/bottom, `Enter` open, `n` new repository (DEV only), `r` rescan, `Esc` return to the last open repo, `q` quit.

## Deliberate limitations

- No hunk or line staging or discarding
- No in-app conflict resolver; no editor launching
- No stash, rebase UI, cherry-pick, revert, reset, or force push
- No remote-branch list or worktree switching inside a repo
- Branch deletion uses `git branch -d`, so unmerged branches are refused
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
