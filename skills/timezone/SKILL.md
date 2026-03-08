---
name: timezone
description: "Convert times between timezones, list timezone info, find current time in any city"
version: 1.0.0
tools:
  - name: timezone
    description: Convert or query times across timezones
    parameters:
      action:
        type: string
        enum: [convert, now, list, offset, dst]
        default: now
      timezone:
        type: string
        description: "IANA timezone name (e.g. 'America/New_York', 'Asia/Tokyo', 'Europe/London')"
      datetime:
        type: string
        description: ISO datetime string to convert (defaults to now)
      toTimezone:
        type: string
        description: Target timezone for conversion
---
