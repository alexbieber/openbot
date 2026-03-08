---
name: file
description: Read, write, list, and manage files and directories on the local machine. Use for reading documents, saving output, organizing files, and accessing local data.
inputSchema:
  type: object
  properties:
    action:
      type: string
      enum: [read, write, append, list, exists, delete, mkdir]
      description: The file operation to perform
    path:
      type: string
      description: File or directory path
    content:
      type: string
      description: Content to write (for write/append actions)
    encoding:
      type: string
      description: File encoding (default utf-8)
  required:
    - action
    - path
---

# File Skill

Read and write files on the local machine.
