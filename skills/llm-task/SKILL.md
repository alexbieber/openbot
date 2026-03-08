---
name: llm-task
description: "Spawn a sub-LLM call for a focused sub-task without cluttering the main session. Use for summarization, extraction, classification, rewriting, translation, code review, or any isolated reasoning task."
inputSchema:
  type: object
  properties:
    prompt:
      type: string
      description: Task prompt for the sub-LLM
    input:
      type: string
      description: Input data/text to process
    model:
      type: string
      description: Model to use (defaults to a fast model). e.g. gpt-4o-mini, claude-haiku
    maxTokens:
      type: integer
      description: Max output tokens (default 1000)
    temperature:
      type: number
      description: Temperature 0-1 (default 0.3 for focused tasks)
  required: [prompt]
---
# LLM Task Skill

Run a focused sub-task in a separate LLM call. Great for processing large text blocks,
sub-agent delegation, or tasks that need isolation from the main conversation.

## When to use
- Summarizing a large document before including it in context
- Extracting structured data from unstructured text
- Classifying or labeling content
- Parallel sub-tasks
