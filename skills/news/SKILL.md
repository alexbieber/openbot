---
name: news
description: Get latest news headlines on any topic, from specific sources, or top news from any country. Use when user asks about news, current events, what's happening, or recent developments.
inputSchema:
  type: object
  properties:
    query:
      type: string
      description: Topic to search news for (e.g. "AI", "stock market", "sports")
    category:
      type: string
      enum: [general, business, entertainment, health, science, sports, technology]
      description: News category
    country:
      type: string
      description: Country code (e.g. us, gb, au). Default us
    count:
      type: number
      description: Number of articles to return (default 5, max 10)
  required: []
---
# News Skill
Get latest news via NewsAPI (newsapi.org) or RSS fallback.
## Setup
Set NEWS_API_KEY (free tier at newsapi.org)
Falls back to public RSS feeds if not set.
