---
name: email
description: Read, send, and search emails via Gmail API. Use for checking inbox, sending messages, searching for emails, and managing email threads.
inputSchema:
  type: object
  properties:
    action:
      type: string
      enum: [send, read, search, list, reply]
      description: Email action to perform
    to:
      type: string
      description: Recipient email address (for send/reply)
    subject:
      type: string
      description: Email subject (for send)
    body:
      type: string
      description: Email body text (for send/reply)
    query:
      type: string
      description: Search query (for search, e.g. "from:boss@company.com subject:invoice")
    message_id:
      type: string
      description: Gmail message ID (for read/reply)
    max_results:
      type: number
      description: Max emails to return (default 10)
  required:
    - action
---

# Email Skill

Read and send emails via Gmail API.

## Setup
1. Go to Google Cloud Console → Gmail API → Enable
2. Create OAuth2 credentials
3. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN

## Examples
- "Check my inbox" → list
- "Search for emails from john@example.com" → search
- "Send email to sarah about project update" → send
