---
name: code_review
description: Review code files or GitHub pull requests for bugs, security issues, style problems, and improvements. Provides detailed feedback with suggested fixes. Use when user asks to review code, check a PR, audit code quality, or find bugs.
inputSchema:
  type: object
  properties:
    action:
      type: string
      enum: [review_file, review_pr, review_text]
      description: "review_file: analyze a local file. review_pr: analyze a GitHub PR. review_text: analyze pasted code"
    path:
      type: string
      description: Local file path (for review_file)
    repo:
      type: string
      description: GitHub repo in owner/repo format (for review_pr)
    pr_number:
      type: number
      description: PR number (for review_pr)
    code:
      type: string
      description: Code text to review (for review_text)
    language:
      type: string
      description: Programming language (optional, auto-detected)
    focus:
      type: string
      description: What to focus on (e.g. "security", "performance", "style", "bugs")
  required:
    - action
---
# Code Review Skill
AI-powered code review for files, PRs, and code snippets.
Checks for: bugs, security vulnerabilities, performance issues, code style, best practices.
