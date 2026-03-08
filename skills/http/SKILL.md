---
name: http
description: "Make HTTP requests: GET, POST, PUT, DELETE, PATCH. Returns status, headers, body."
version: 1.0.0
tools:
  - name: http
    description: Make an HTTP request to any URL
    parameters:
      method:
        type: string
        enum: [GET, POST, PUT, DELETE, PATCH, HEAD]
        default: GET
      url:
        type: string
        description: Full URL to request
      headers:
        type: object
        description: Request headers
      body:
        type: string
        description: Request body (for POST/PUT/PATCH)
      timeout:
        type: number
        description: Timeout in milliseconds (default 10000)
---

## HTTP Skill

Make ad-hoc HTTP requests to any API endpoint. Returns status code, response headers, and body.
Automatically parses JSON responses.
