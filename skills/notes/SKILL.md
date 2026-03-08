---
name: notes
description: Create, read, list, search, and delete personal notes stored locally. Use when user wants to save a note, take notes, recall notes, jot something down, or manage their notes.
inputSchema:
  type: object
  properties:
    action:
      type: string
      enum: [add, list, read, search, delete, edit]
      description: Note action to perform
    title:
      type: string
      description: Note title (for add/edit/read/delete)
    content:
      type: string
      description: Note content (for add/edit)
    query:
      type: string
      description: Search query (for search)
    tags:
      type: string
      description: Comma-separated tags (for add)
  required:
    - action
---
# Notes Skill
Local markdown-based notes manager. Notes stored in ~/.openbot/notes/
No API key needed.
