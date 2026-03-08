---
name: stocks
description: Get real-time stock prices, company info, and market data for any stock ticker. Use when user asks about stocks, share prices, company financials, or market data.
inputSchema:
  type: object
  properties:
    action:
      type: string
      enum: [price, info, search]
      description: "price: get current price(s). info: detailed stock info. search: find a stock by company name"
    symbols:
      type: string
      description: Ticker symbol(s) comma-separated (e.g. "AAPL,MSFT,TSLA")
    query:
      type: string
      description: Company name to search for
  required:
    - action
---
# Stocks Skill
Real-time stock data via Yahoo Finance (no API key needed).
