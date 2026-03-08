---
name: ip-lookup
description: "IP geolocation, WHOIS, ASN lookup, reverse DNS for any IPv4/IPv6 address or domain"
version: 1.0.0
tools:
  - name: ip_lookup
    description: Look up geolocation and network info for an IP address or domain
    parameters:
      target:
        type: string
        description: IP address, domain, or 'me' for your public IP
      type:
        type: string
        enum: [geo, whois, rdns, asn, all]
        default: all
---
