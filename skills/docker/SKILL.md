---
name: docker
description: "Docker management: ps, images, logs, run, stop, rm, pull, inspect, exec"
version: 1.0.0
tools:
  - name: docker
    description: Manage Docker containers and images
    parameters:
      action:
        type: string
        enum: [ps, images, logs, run, stop, start, rm, rmi, pull, inspect, exec, stats, build, compose]
        description: Docker action
      target:
        type: string
        description: Container/image name or ID
      args:
        type: string
        description: Additional arguments
---

## Docker Skill

Manage Docker containers, images, and networks. Destructive operations require confirmation.
