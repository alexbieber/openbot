---
name: ping
description: "Ping a host or IP to check connectivity, measure latency, and packet loss"
version: 1.0.0
tools:
  - name: ping
    description: Ping a host and report latency
    parameters:
      host:
        type: string
        description: Hostname or IP to ping
      count:
        type: number
        description: Number of pings (default 4, max 10)
      timeout:
        type: number
        description: Timeout per ping in ms (default 3000)
---
