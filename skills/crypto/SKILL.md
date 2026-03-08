---
name: crypto
description: Get real-time cryptocurrency prices, market data, and trends for Bitcoin, Ethereum, and thousands of other coins. Use when user asks about crypto prices, market cap, coin info, or portfolio tracking.
inputSchema:
  type: object
  properties:
    action:
      type: string
      enum: [price, top, search, info]
      description: "price: get price for specific coin(s). top: top N coins by market cap. search: find a coin. info: detailed coin info"
    coins:
      type: string
      description: Coin symbol(s) comma-separated (e.g. "BTC,ETH,SOL") or name
    count:
      type: number
      description: Number of top coins to show (for top action, default 10)
    currency:
      type: string
      description: Display currency (default usd)
  required:
    - action
---
# Crypto Skill
Real-time crypto data via CoinGecko API (free, no key needed).
