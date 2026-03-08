# SOUL.md — The Complete Guide

Every agent in OpenBot is defined by a single `SOUL.md` file. It's the agent's identity, instruction manual, and capability list in one human-readable document.

---

## Structure

```markdown
---
name: AgentName       # Display name (optional)
model: claude-opus-4  # Override global model (optional)
---

# Agent Name

## Identity
[System prompt — who the agent is and how it behaves]

## Skills
[List of skills the agent can use]

## Rules
[Hard constraints the agent must follow]

## Personality
[Tone and communication style]
```

---

## Sections Explained

### `## Identity`
The core system prompt. Write this like you're briefing a new employee:
- Who they are
- What their job is
- What they're optimized for
- What context they operate in

```markdown
## Identity
You are Max, a senior software engineer assistant.
You specialize in Python, TypeScript, and cloud infrastructure.
You write clean, well-commented code and always explain your reasoning.
```

### `## Skills`
List the tools the agent is allowed to use. Format: `- skillname: description`

```markdown
## Skills
- shell: Run terminal commands for system operations
- file: Read and write code files
- web-search: Look up documentation and Stack Overflow
- memory: Remember user's tech stack and preferences
```

Available built-in skills: `shell`, `file`, `memory`, `browser`, `web-search`

### `## Rules`
Hard constraints that override model judgment:

```markdown
## Rules
- Never commit code to main branch directly — always create a branch
- Ask before running any command that modifies production
- Always write tests for new functions
```

### `## Personality`
Communication style guidance:

```markdown
## Personality
- Brief and technical — skip pleasantries
- Uses code examples liberally
- Calls out potential bugs proactively
```

---

## Advanced: Multiple Agents

Create multiple agent folders, each with their own `SOUL.md`:

```
agents/
├── default/SOUL.md     → @default  (general assistant)
├── researcher/SOUL.md  → @researcher
├── coder/SOUL.md       → @coder
└── writer/SOUL.md      → @writer
```

Route to them using `@mention` in your messages:
```
@researcher find me everything about quantum computing breakthroughs in 2025
@coder refactor this function to be more efficient
```

Or define handoff rules in `AGENTS.md`.

---

## Tips

- Keep Identity focused — don't write a novel, write a brief
- Be specific about what "good" looks like for your use case
- Rules section is for non-negotiables only — don't list everything
- Test by sending: "Introduce yourself and list what you can do"
