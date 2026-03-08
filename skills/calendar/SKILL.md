---
name: calendar
description: Manage Google Calendar — list upcoming events, create events, search events, and delete events. Use for scheduling, reminders, and checking your agenda.
inputSchema:
  type: object
  properties:
    action:
      type: string
      enum: [list, create, search, delete, today]
      description: Calendar action to perform
    title:
      type: string
      description: Event title (for create)
    start:
      type: string
      description: "Event start datetime ISO 8601 (e.g. 2026-03-10T14:00:00)"
    end:
      type: string
      description: "Event end datetime ISO 8601 (e.g. 2026-03-10T15:00:00)"
    description:
      type: string
      description: Event description
    location:
      type: string
      description: Event location
    days:
      type: number
      description: Number of days to look ahead (for list, default 7)
    query:
      type: string
      description: Search query (for search)
    event_id:
      type: string
      description: Event ID (for delete)
    calendar_id:
      type: string
      description: Calendar ID (defaults to primary)
  required:
    - action
---

# Calendar Skill

Manage your Google Calendar.

## Setup
Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN

## Examples
- "What's on my calendar today?" → today
- "Schedule a meeting with John tomorrow at 2pm" → create
- "Search for dentist appointment" → search
