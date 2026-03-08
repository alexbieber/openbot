---
name: pdf
description: Read text content from PDF files, or convert text/markdown to a PDF. Use when user wants to read a PDF, extract text from a PDF, or create/generate a PDF document.
inputSchema:
  type: object
  properties:
    action:
      type: string
      enum: [read, create]
      description: "read: extract text from PDF. create: generate PDF from text"
    path:
      type: string
      description: Path to PDF file (for read) or output path (for create)
    content:
      type: string
      description: Text or markdown content to convert to PDF (for create)
    title:
      type: string
      description: Document title (for create)
  required:
    - action
---
# PDF Skill
Read PDF files or create PDFs from text content.
