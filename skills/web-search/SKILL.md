---
name: web-search
description: Search the web for current information. Uses Brave Search API. Ideal for news, recent events, facts, prices, and anything that may have changed recently.
inputSchema:
  type: object
  properties:
    query:
      type: string
      description: The search query
    count:
      type: number
      description: Number of results to return (default 5)
    freshness:
      type: string
      enum: [day, week, month, year]
      description: Filter results by recency (optional)
  required:
    - query
---

# Web Search Skill

Search the web using Brave Search API.

## Setup

Set `BRAVE_SEARCH_API_KEY` in your config or environment:
```bash
export BRAVE_SEARCH_API_KEY=your_key_here
```

Get a free key at: https://brave.com/search/api/
