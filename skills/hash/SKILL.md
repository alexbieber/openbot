---
name: hash
description: "Compute cryptographic hashes (MD5, SHA-1, SHA-256, SHA-512, BLAKE2), HMAC, and checksum files"
version: 1.0.0
tools:
  - name: hash
    description: Hash text or file contents
    parameters:
      action:
        type: string
        enum: [hash, hmac, compare, file]
        default: hash
      input:
        type: string
        description: Text to hash
      algorithm:
        type: string
        enum: [md5, sha1, sha256, sha512, sha3-256, sha3-512]
        default: sha256
      key:
        type: string
        description: HMAC secret key
      filePath:
        type: string
        description: File path to hash
      compareWith:
        type: string
        description: Hash string to compare result against
---
