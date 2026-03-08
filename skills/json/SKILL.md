---
name: json
description: "Parse, format, query (jq-style), validate, diff, and transform JSON data"
version: 1.0.0
tools:
  - name: json
    description: Parse, format, query or transform JSON
    parameters:
      action:
        type: string
        enum: [parse, format, query, validate, minify, keys, values, flatten, diff]
        description: Operation to perform
      input:
        type: string
        description: JSON string or stringified object to process
      query:
        type: string
        description: "Dot-notation path or jq-style query (e.g. 'user.name', '.items[0].id')"
      compare:
        type: string
        description: Second JSON string for diff operation
---
