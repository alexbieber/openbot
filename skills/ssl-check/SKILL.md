---
name: ssl-check
description: "Check SSL/TLS certificate validity, expiry, chain, and security grade for any domain"
version: 1.0.0
tools:
  - name: ssl_check
    description: Check SSL certificate details for a domain
    parameters:
      domain:
        type: string
        description: Domain to check (e.g. 'example.com')
      port:
        type: number
        description: Port to check (default 443)
---
