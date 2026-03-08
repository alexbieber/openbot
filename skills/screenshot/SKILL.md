---
name: screenshot
description: "Take a screenshot of a URL or web page, returns base64 PNG. Requires Puppeteer or Playwright."
version: 1.0.0
tools:
  - name: screenshot
    description: Capture a screenshot of a web page
    parameters:
      url:
        type: string
        description: URL to screenshot
      width:
        type: number
        description: Viewport width in pixels (default 1280)
      height:
        type: number
        description: Viewport height in pixels (default 800)
      fullPage:
        type: boolean
        description: Capture full scrollable page (default false)
      outputPath:
        type: string
        description: Save to file path instead of returning base64
      waitMs:
        type: number
        description: Extra wait after page load in ms (default 500)
---
