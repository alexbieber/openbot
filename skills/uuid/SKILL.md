---
name: uuid
description: "Generate UUIDs (v1, v4, v5, v7), validate UUIDs, parse UUID components"
version: 1.0.0
tools:
  - name: uuid
    description: Generate or validate UUIDs
    parameters:
      action:
        type: string
        enum: [generate, validate, parse, nil]
        default: generate
      version:
        type: number
        enum: [1, 4, 5, 7]
        default: 4
      count:
        type: number
        description: Number of UUIDs to generate (default 1, max 20)
      namespace:
        type: string
        description: Namespace UUID for v5 (e.g. DNS='6ba7b810-9dad-11d1-80b4-00c04fd430c8')
      name:
        type: string
        description: Name string for v5
      value:
        type: string
        description: UUID string to validate or parse
---
