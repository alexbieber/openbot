---
name: diffs
description: Generate, display, or apply unified diffs between text versions. Use to show before/after changes, compare files, or produce a patch file.
inputSchema:
  type: object
  properties:
    action:
      type: string
      enum: [create, apply, compare]
      description: "create: produce a unified diff. apply: apply a patch string. compare: show side-by-side"
    original:
      type: string
      description: Original text or file path
    modified:
      type: string
      description: Modified text or file path
    patch:
      type: string
      description: Unified diff patch to apply (for action=apply)
    target:
      type: string
      description: File path to apply patch to (for action=apply)
    context:
      type: integer
      description: Context lines in diff output (default 3)
  required: [action]
---
# Diffs Skill

Create and apply unified diffs / patches between text versions.
