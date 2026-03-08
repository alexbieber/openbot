---
name: regex
description: "Test, match, extract, replace, or explain regular expressions"
version: 1.0.0
tools:
  - name: regex
    description: Work with regular expressions
    parameters:
      action:
        type: string
        enum: [test, match, extract, replace, explain, validate]
        default: test
      pattern:
        type: string
        description: Regular expression pattern
      flags:
        type: string
        description: Regex flags (e.g. 'gi', 'im')
        default: ""
      input:
        type: string
        description: Text to test/match/replace
      replacement:
        type: string
        description: Replacement string for replace action
---
