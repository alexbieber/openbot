# Building Custom Skills

Skills are OpenBot's plugin system. Each skill is a folder with two files:
- `SKILL.md` — Metadata and documentation (the AI reads this to know when/how to use the skill)
- `index.js` — The implementation (what actually runs)

---

## Minimal Skill Example

```
skills/
└── my-skill/
    ├── SKILL.md
    └── index.js
```

### SKILL.md

```markdown
---
name: my-skill
description: What this skill does and when the AI should use it. Be specific.
inputSchema:
  type: object
  properties:
    input:
      type: string
      description: The main input for this skill
    option:
      type: string
      enum: [fast, thorough]
      description: Processing mode
  required:
    - input
---

# My Skill

Longer documentation here. Include examples.

## Examples
- "Check the weather in Paris" → `{ input: "Paris", option: "fast" }`
```

### index.js

```javascript
export default async function execute({ input, option = 'fast' }, context = {}) {
  // context contains: { config, userId, sessionId }
  
  // Do your thing
  const result = await doSomething(input, option);
  
  // Return a string — the AI will read this
  return `Result: ${result}`;
}
```

---

## Real Example: Calendar Skill

```javascript
// skills/calendar/index.js
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

export default async function execute({ action, date, event }, context) {
  switch (action) {
    case 'list': {
      // macOS calendar via AppleScript
      const { stdout } = await execAsync(
        `osascript -e 'tell application "Calendar" to get events of calendar "Home"'`
      );
      return `Upcoming events:\n${stdout}`;
    }
    case 'add': {
      // Add event logic
      return `✅ Event added: ${event} on ${date}`;
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
```

---

## Skill Security Guidelines

1. **Validate inputs** — Never trust raw input
2. **Set timeouts** — Use `AbortSignal.timeout()` for network calls
3. **Limit output size** — Truncate large results before returning
4. **Audit sensitive ops** — Use `context.audit` if available
5. **Declare env requirements** in SKILL.md frontmatter

---

## Publishing to OpenBot Hub

1. Fork [github.com/openbot/openbot](https://github.com/openbot/openbot)
2. Add your skill folder under `skills/your-skill-name/`
3. Submit a Pull Request with:
   - Clear SKILL.md description
   - Working index.js
   - A brief README explaining setup

Community skills live at: https://github.com/openbot/openbot
