---
name: apply-patch
description: Apply a structured multi-file patch to the workspace. Supports creating, modifying, and deleting files atomically. Use for code edits, refactoring, and multi-file changes.
inputSchema:
  type: object
  properties:
    patch:
      type: object
      description: Patch object with files array
      properties:
        files:
          type: array
          items:
            type: object
            properties:
              path:
                type: string
              action:
                type: string
                enum: [create, modify, delete]
              content:
                type: string
              diff:
                type: string
    workspaceOnly:
      type: boolean
      description: Restrict writes to workspace directory (default true)
  required: [patch]
---
# Apply Patch Skill

Apply structured multi-file changes atomically.
Each file entry can create, modify, or delete a file.
