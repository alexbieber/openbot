---
name: ocr
description: "Extract text from images using OCR (Tesseract). Supports JPEG, PNG, WEBP, BMP."
version: 1.0.0
tools:
  - name: ocr
    description: Extract text from an image file
    parameters:
      imagePath:
        type: string
        description: Path to the image file to process
      language:
        type: string
        description: "OCR language code (default 'eng'). Multiple: 'eng+fra'"
      outputFormat:
        type: string
        enum: [text, hocr, tsv]
        default: text
---

## OCR Skill

Uses Tesseract (must be installed: `brew install tesseract` or `apt install tesseract-ocr`) to extract text from images.
