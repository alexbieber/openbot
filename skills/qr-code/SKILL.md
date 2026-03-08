---
name: qr-code
description: "Generate QR codes from any text or URL, returns as a base64 PNG data URL"
version: 1.0.0
tools:
  - name: qr_code
    description: Generate a QR code image from text or URL
    parameters:
      text:
        type: string
        description: Text or URL to encode
      size:
        type: number
        description: Size in pixels (default 256)
      errorLevel:
        type: string
        enum: [L, M, Q, H]
        default: M
---

## QR Code Skill

Generate QR codes for any text or URL. Returns a base64 PNG data URL that can be embedded in messages.
