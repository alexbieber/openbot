---
name: system
description: Monitor system resources — CPU usage, memory (RAM), disk space, running processes, network stats, and system info. Use when user asks about system performance, what's running, disk space, or computer specs.
inputSchema:
  type: object
  properties:
    action:
      type: string
      enum: [cpu, memory, disk, processes, network, info, all]
      description: "cpu: CPU usage. memory: RAM. disk: disk space. processes: top processes. network: network stats. info: OS info. all: full report"
  required:
    - action
---
# System Monitor Skill
Real-time system resource monitoring using Node.js built-ins.
No API key needed — reads directly from OS.
