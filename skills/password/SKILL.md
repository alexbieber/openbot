---
name: password
description: "Generate strong passwords, passphrases, PINs. Check password strength."
version: 1.0.0
tools:
  - name: password
    description: Generate or analyze passwords
    parameters:
      action:
        type: string
        enum: [generate, passphrase, pin, strength]
        default: generate
      length:
        type: number
        description: Password length (default 20)
      count:
        type: number
        description: Number of passwords to generate (default 1, max 10)
      charset:
        type: string
        enum: [all, alphanumeric, alpha, numeric, hex, symbols]
        default: all
      words:
        type: number
        description: Number of words in passphrase (default 4)
      password:
        type: string
        description: Password to check strength for
---
