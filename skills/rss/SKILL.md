---
name: rss
description: Read and monitor RSS/Atom feeds. Fetch latest posts from any RSS feed URL, subscribe to feeds, or get updates from blogs, podcasts, and news sites.
inputSchema:
  type: object
  properties:
    action:
      type: string
      enum: [fetch, subscribe, list, unsubscribe]
      description: "fetch: get items from URL. subscribe: save feed. list: show subscribed feeds. unsubscribe: remove feed"
    url:
      type: string
      description: RSS/Atom feed URL
    count:
      type: number
      description: Number of items to return (default 5)
    name:
      type: string
      description: Feed name for subscribe/unsubscribe
  required:
    - action
---
# RSS Skill
Read RSS and Atom feeds. No API key needed.
Subscriptions stored in ~/.openbot/rss-feeds.json
