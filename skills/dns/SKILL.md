---
name: dns
description: "DNS lookups: A, AAAA, CNAME, MX, TXT, NS, SOA records for any domain"
version: 1.0.0
tools:
  - name: dns
    description: Look up DNS records for a domain
    parameters:
      domain:
        type: string
        description: Domain to look up
      type:
        type: string
        enum: [A, AAAA, CNAME, MX, TXT, NS, SOA, PTR, all]
        default: A
---
