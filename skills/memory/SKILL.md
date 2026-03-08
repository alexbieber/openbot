---
name: memory
description: Store and retrieve long-term memories across conversations. Use to remember user preferences, important facts, ongoing projects, and personal details.
inputSchema:
  type: object
  properties:
    action:
      type: string
      enum: [save, search, list, delete]
      description: Memory operation
    content:
      type: string
      description: Memory content to save
    query:
      type: string
      description: Search query to find relevant memories
    id:
      type: string
      description: Memory ID to delete
    tags:
      type: array
      items:
        type: string
      description: Tags for organizing memories
  required:
    - action
---

# Memory Skill

Persistent long-term memory across all conversations.
Memories are stored as Markdown files in `~/.openbot/memory/`.
