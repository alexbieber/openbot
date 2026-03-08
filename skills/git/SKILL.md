---
name: git
description: "Git operations: clone, status, diff, log, commit, push, pull, branch, stash"
version: 1.0.0
tools:
  - name: git
    description: Run a git operation in a repository
    parameters:
      action:
        type: string
        enum: [status, diff, log, add, commit, push, pull, clone, branch, checkout, stash, reset, init, show]
        description: Git action to perform
      repo:
        type: string
        description: Repository path or URL (for clone)
      args:
        type: string
        description: Additional arguments (e.g. commit message, branch name, file path)
      cwd:
        type: string
        description: Working directory (defaults to current dir)
---

## Git Skill

Run git operations safely. For destructive operations (force push, reset --hard), confirm first.

### Examples
- `/git status` — show working tree status
- `/git log --oneline -10` — recent commits
- `/git diff HEAD` — show unstaged changes
