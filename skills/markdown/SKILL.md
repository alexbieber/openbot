---
name: markdown
description: "Convert Markdown to HTML, plain text, or PDF. Also convert HTML to Markdown."
version: 1.0.0
tools:
  - name: markdown
    description: Convert or render Markdown content
    parameters:
      action:
        type: string
        enum: [to_html, to_text, to_pdf, from_html, toc]
        description: Conversion action
      content:
        type: string
        description: Markdown or HTML content to convert
      outputPath:
        type: string
        description: File path to save output (optional)
---
