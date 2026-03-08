---
name: github
description: Interact with GitHub — review pull requests, list issues, create issues, read file contents from repos, and check CI/CD status. Use for code review, project management, and repository operations.
inputSchema:
  type: object
  properties:
    action:
      type: string
      enum: [list_prs, review_pr, list_issues, create_issue, read_file, pr_diff, repo_info]
      description: GitHub action to perform
    repo:
      type: string
      description: "Repository in format owner/repo (e.g. openai/openai-python)"
    pr_number:
      type: number
      description: Pull request number
    issue_title:
      type: string
      description: Issue title (for create_issue)
    issue_body:
      type: string
      description: Issue body (for create_issue)
    file_path:
      type: string
      description: File path within repo (for read_file)
    branch:
      type: string
      description: Branch name (defaults to main)
    review_body:
      type: string
      description: Review comment to post on a PR
    review_event:
      type: string
      enum: [APPROVE, REQUEST_CHANGES, COMMENT]
      description: Review decision
  required:
    - action
    - repo
---

# GitHub Skill

Review PRs, manage issues, and interact with repositories.

## Setup
Set GITHUB_TOKEN with a Personal Access Token (repo scope).

## Examples
- "Review my open PRs in myorg/myrepo" → list_prs
- "What's in PR #42?" → review_pr
- "Create an issue about the login bug" → create_issue
