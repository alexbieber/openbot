---
name: browser
description: "Full browser automation with Playwright: navigate, snapshot, click, type, extract, screenshot, CDP, remote Browserless"
version: 2.0.0
tools:
  - name: browser_navigate
    description: Navigate to a URL and return a page snapshot
    parameters:
      url: { type: string, description: URL to navigate to }
      waitUntil: { type: string, enum: [load, domcontentloaded, networkidle], default: load }
      profile: { type: string, description: "Browser profile: 'default' or 'chrome' (use host Chrome)", default: default }

  - name: browser_snapshot
    description: "Get current page snapshot with aria-refs for interaction (refs=aria for aria-ref IDs)"
    parameters:
      refs: { type: string, enum: [aria, full], default: aria }
      maxLength: { type: number, description: Max chars of snapshot, default: 8000 }

  - name: browser_act
    description: Interact with an element by aria-ref or CSS selector
    parameters:
      action: { type: string, enum: [click, type, hover, focus, select, check, scroll, press, fill, clear] }
      ref: { type: string, description: "aria-ref ID from snapshot (e.g. 'ref=12'), or CSS selector" }
      text: { type: string, description: Text to type or fill }
      key: { type: string, description: Keyboard key (for press action) }

  - name: browser_extract
    description: Extract structured data from current page
    parameters:
      selector: { type: string, description: CSS selector or 'body' for full page }
      format: { type: string, enum: [text, html, links, table, markdown], default: text }
      schema: { type: object, description: "JSON schema for structured extraction" }

  - name: browser_tabs
    description: Manage browser tabs
    parameters:
      action: { type: string, enum: [list, new, close, switch, screenshot] }
      tabId: { type: number, description: Tab index to switch/close }
      url: { type: string, description: URL for new tab }

  - name: browser_wait
    description: Wait for an element, URL change, or time
    parameters:
      for: { type: string, enum: [selector, url, text, time, network] }
      value: { type: string, description: "Selector, URL pattern, text content, or ms" }
      timeout: { type: number, default: 10000 }

  - name: browser_script
    description: Execute JavaScript in the browser context
    parameters:
      code: { type: string, description: JavaScript to execute }
      returnValue: { type: boolean, default: true }

  - name: browser_upload
    description: Upload a file to a file input
    parameters:
      selector: { type: string }
      filePath: { type: string }

  - name: browser_pdf
    description: Save current page as PDF
    parameters:
      outputPath: { type: string }
      format: { type: string, enum: [A4, Letter], default: A4 }
---

## Browser Skill v2

Full Playwright-powered browser automation. Supports local Chromium, host Chrome profile, and remote CDP/Browserless.

### Connection modes
- `profile="default"` — launches managed Chromium (headless)
- `profile="chrome"` — attaches to your running Chrome
- Set `BROWSERLESS_URL=wss://...` for remote Browserless

### Workflow
1. `browser_navigate` → go to page
2. `browser_snapshot` → get structure with aria-refs
3. `browser_act` with `ref=<id>` → interact
4. Repeat until done
