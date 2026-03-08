---
name: shell
description: Execute terminal/shell commands on the local machine. Use for system tasks, file operations via command line, running scripts, checking system status, and automation.
inputSchema:
  type: object
  properties:
    command:
      type: string
      description: The shell command to execute
    workingDir:
      type: string
      description: Working directory for the command (optional, defaults to home dir)
    timeout:
      type: number
      description: Timeout in milliseconds (default 30000)
  required:
    - command
---

# Shell Skill

Execute terminal commands on the local system.

## Usage

Add `shell` to your SOUL.md skills list:
```
- shell: Execute terminal commands when needed
```

## Security

Commands are sandboxed and subject to permission policy. Destructive commands require confirmation. Every execution is audit-logged.

## Examples

- "List files in my Downloads folder" → `ls ~/Downloads`
- "Check disk space" → `df -h`
- "Run my Python script" → `python3 ~/scripts/process.py`
- "Check what's running on port 3000" → `lsof -i :3000`
