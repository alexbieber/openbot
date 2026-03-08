---
name: api_monitor
description: Monitor API health, check uptime, and track response times for any URL or endpoint. Set up continuous monitoring or run a one-time health check. Use when user wants to monitor a service, check if a site is down, or track API availability.
inputSchema:
  type: object
  properties:
    action:
      type: string
      enum: [check, start, stop, status, list]
      description: "check: one-time check. start: begin monitoring. stop: stop monitor. status: show monitor results. list: show active monitors"
    url:
      type: string
      description: URL or endpoint to check
    name:
      type: string
      description: Monitor name (for start/stop/status)
    interval:
      type: number
      description: Check interval in minutes (for start, default 5)
    expected_status:
      type: number
      description: Expected HTTP status code (default 200)
    timeout:
      type: number
      description: Request timeout in ms (default 5000)
  required:
    - action
---
# API Monitor Skill
Monitor API endpoints and web services for uptime and performance.
Monitor results stored in ~/.openbot/monitors/
