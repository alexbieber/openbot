---
name: weather
description: Get current weather conditions and forecasts for any city or location. Use when user asks about weather, temperature, rain, forecast, or climate conditions.
inputSchema:
  type: object
  properties:
    location:
      type: string
      description: City name or location (e.g. "New York", "London, UK", "Tokyo")
    type:
      type: string
      enum: [current, forecast, hourly]
      description: "current: right now. forecast: 5-day. hourly: next 24h"
    units:
      type: string
      enum: [metric, imperial]
      description: metric (°C) or imperial (°F). Default metric
  required:
    - location
---
# Weather Skill
Get real-time weather data via OpenWeatherMap API.
## Setup
Set OPENWEATHER_API_KEY (free at openweathermap.org)
Falls back to wttr.in (no key needed) if not set.
