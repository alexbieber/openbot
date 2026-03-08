---
name: port-scan
description: "Check if TCP ports are open on a host. Scan common ports or a custom range."
version: 1.0.0
tools:
  - name: port_scan
    description: Check open ports on a host
    parameters:
      host:
        type: string
        description: Hostname or IP to scan
      ports:
        type: string
        description: "Comma-separated ports or range (e.g. '80,443,8080' or '1-1024'). Default: common ports"
      timeout:
        type: number
        description: Timeout per port in ms (default 1000)
---
