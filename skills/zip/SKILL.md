---
name: zip
description: Compress files/folders into a zip archive, or extract/list contents of a zip file. Use when user wants to zip, compress, pack, unzip, extract, or decompress files.
inputSchema:
  type: object
  properties:
    action:
      type: string
      enum: [create, extract, list]
      description: "create: compress files. extract: unzip archive. list: show contents"
    source:
      type: string
      description: Source file or directory (for create), or zip file path (for extract/list)
    output:
      type: string
      description: Output zip file path (for create) or extraction directory (for extract)
    exclude:
      type: array
      items:
        type: string
      description: Patterns to exclude (for create, e.g. ["node_modules", ".git"])
  required:
    - action
    - source
---
# Zip Skill
Compress and decompress files using archiver and unzipper libraries.
