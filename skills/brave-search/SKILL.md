---
name: brave-search
description: Search the web using Brave Search API. Returns high-quality, privacy-respecting results without tracking. Use for current events, facts, research, news, or any web query.
inputSchema:
  type: object
  properties:
    query:
      type: string
      description: Search query
    count:
      type: integer
      description: Number of results (1-20). Default 5
    freshness:
      type: string
      enum: [pd, pw, pm, py]
      description: "Freshness filter: pd=past day, pw=past week, pm=past month, py=past year"
    country:
      type: string
      description: Country code (e.g. US, GB, DE)
  required: [query]
---
# Brave Search Skill

Privacy-respecting web search via the Brave Search API.

## Setup
Set `BRAVE_SEARCH_API_KEY` (free tier: 2000 queries/month at brave.com/search/api)

## Usage
- Returns titles, URLs, descriptions
- Supports freshness filtering for recent content
- Falls back to DuckDuckGo scraping if no key set
