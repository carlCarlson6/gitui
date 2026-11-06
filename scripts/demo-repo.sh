#!/usr/bin/env bash
set -euo pipefail

TMPBASE="${TMPDIR:-/tmp}"
TMPBASE="${TMPBASE%/}"
ROOT="${1:-$(mktemp -d "$TMPBASE/gitui-demo.XXXXXX")}"
REMOTE="$ROOT/remote.git"
REPO="$ROOT/repo"

git init -q --bare "$REMOTE"
git init -q -b main "$REPO"
git -C "$REPO" config user.name "Demo User"
git -C "$REPO" config user.email "demo@example.com"
git -C "$REPO" remote add origin "$REMOTE"

cd "$REPO"

cat > app.ts <<'EOF'
export function greet(name: string) {
  return `hello, ${name}`
}
EOF

cat > README.md <<'EOF'
# Demo repository

Created by gitui/scripts/demo-repo.sh
EOF

git add .
git commit -qm "initial commit"
git push -q -u origin main

git switch -qc feature/login
cat > login.ts <<'EOF'
export function login(user: string) {
  return { user, token: "demo" }
}
EOF
git add .
git commit -qm "add login helper"
git push -q -u origin feature/login

git switch -q main

# A file with both staged and unstaged changes.
cat > app.ts <<'EOF'
export function greet(name: string) {
  return `hello, ${name}!`
}
EOF
git add app.ts
cat >> app.ts <<'EOF'

export const version = 2
EOF

# An untracked file.
printf 'remember to try the commit view\n' > notes.txt

echo
echo "Demo repository: $REPO"
echo "Bare remote:     $REMOTE"
echo
echo "Run: bun run dev $REPO"
