---
name: reminders
description: Set, list, and manage reminders that trigger at a specific time. The agent will message you when the reminder fires. Use when user wants to be reminded, set a timer, or schedule an alert.
inputSchema:
  type: object
  properties:
    action:
      type: string
      enum: [set, list, delete, clear]
      description: "set: create reminder. list: show all. delete: remove one. clear: remove all"
    message:
      type: string
      description: Reminder message text
    time:
      type: string
      description: When to fire (e.g. "in 10 minutes", "at 3:30pm", "tomorrow at 9am", ISO datetime)
    id:
      type: string
      description: Reminder ID (for delete)
  required:
    - action
---
# Reminders Skill
Schedule reminders that message you via the gateway.
Reminders persist in ~/.openbot/reminders.json
