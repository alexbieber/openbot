---
name: cron-expression
description: "Parse, explain, validate, and generate cron expressions. Show next run times."
version: 1.0.0
tools:
  - name: cron_expression
    description: Work with cron schedule expressions
    parameters:
      action:
        type: string
        enum: [explain, validate, next, generate, parse]
        default: explain
      expression:
        type: string
        description: "Cron expression to parse (e.g. '0 9 * * 1-5' = weekdays 9am)"
      description:
        type: string
        description: Natural language schedule description for 'generate' action
      count:
        type: number
        description: Number of next run times to show (default 5)
---
