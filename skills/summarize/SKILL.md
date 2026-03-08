---
name: summarize
description: Summarize long text, documents, URLs, or files into concise key points. Use when user wants to summarize, condense, TL;DR, or extract key information from any content.
inputSchema:
  type: object
  properties:
    content:
      type: string
      description: Text content to summarize
    url:
      type: string
      description: URL to fetch and summarize
    path:
      type: string
      description: Local file path to summarize
    style:
      type: string
      enum: [bullets, paragraph, executive, tldr]
      description: "bullets: bullet points. paragraph: prose. executive: executive summary. tldr: one line"
    length:
      type: string
      enum: [short, medium, long]
      description: Summary length (default medium)
  required: []
---
# Summarize Skill
Condense any content — text, URLs, or files — into clear summaries.
