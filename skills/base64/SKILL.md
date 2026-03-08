---
name: base64
description: "Encode and decode Base64 and Base64URL strings, or encode/decode files"
version: 1.0.0
tools:
  - name: base64
    description: Encode or decode Base64 data
    parameters:
      action:
        type: string
        enum: [encode, decode, encode_url, decode_url, encode_file]
        default: encode
      input:
        type: string
        description: Text or Base64 string to process
      filePath:
        type: string
        description: File path to encode
---
