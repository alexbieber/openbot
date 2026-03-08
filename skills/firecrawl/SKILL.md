---
name: firecrawl
description: Scrape and crawl websites deeply. Converts any URL to clean markdown, extracts structured data, crawls multi-page sites. Use when you need full page content, not just a snippet.
inputSchema:
  type: object
  properties:
    url:
      type: string
      description: URL to scrape or crawl
    mode:
      type: string
      enum: [scrape, crawl, extract]
      description: "scrape: single page markdown. crawl: follow links up to maxPages. extract: structured data"
    maxPages:
      type: integer
      description: Max pages to crawl (mode=crawl only). Default 5
    schema:
      type: object
      description: JSON schema for structured extraction (mode=extract)
  required: [url]
---
# Firecrawl Skill

Deep web scraping that returns clean, AI-ready markdown.

## Setup
Set `FIRECRAWL_API_KEY` (firecrawl.dev — has free tier)
Falls back to basic HTML fetch + markdown conversion if no key.

## Usage
- `scrape`: get full page as markdown (best for articles, docs, single pages)
- `crawl`: follow links and scrape multiple pages (best for documentation sites)
- `extract`: extract structured JSON data using a schema
