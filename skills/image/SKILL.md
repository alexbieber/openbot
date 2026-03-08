---
name: image
description: Generate images with DALL-E, analyze/describe images with GPT-4 Vision, or extract text from images (OCR). Use for creating visuals, understanding image contents, or reading text in images.
inputSchema:
  type: object
  properties:
    action:
      type: string
      enum: [generate, analyze, ocr]
      description: "generate: text → image. analyze: image → description. ocr: image → text"
    prompt:
      type: string
      description: Image generation prompt (for generate)
    url:
      type: string
      description: Image URL to analyze (for analyze/ocr)
    path:
      type: string
      description: Local image file path (for analyze/ocr)
    size:
      type: string
      enum: ["1024x1024", "1792x1024", "1024x1792"]
      description: Image size for generation (default 1024x1024)
    quality:
      type: string
      enum: [standard, hd]
      description: Image quality (default standard)
    output_path:
      type: string
      description: Where to save generated image
  required:
    - action
---

# Image Skill

Generate, analyze, and extract text from images.

## Requirements
- OPENAI_API_KEY (for generate, analyze, ocr)

## Examples
- "Generate a logo for a tech startup" → generate
- "What's in this image?" → analyze
- "Read the text in this screenshot" → ocr
