---
name: translate
description: Translate text between languages. Supports 100+ languages. Use when user wants to translate, convert, or understand text in a different language.
inputSchema:
  type: object
  properties:
    text:
      type: string
      description: Text to translate
    target:
      type: string
      description: Target language code or name (e.g. "es", "french", "Japanese", "zh")
    source:
      type: string
      description: Source language (optional, auto-detected if not set)
  required:
    - text
    - target
---
# Translate Skill
Translate text using MyMemory API (free, no key needed) or DeepL (set DEEPL_API_KEY for better quality).
