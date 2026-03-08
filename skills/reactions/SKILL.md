---
name: reactions
description: Add emoji reactions to messages in Telegram, Discord, or Slack. Use to acknowledge a message, express sentiment, or signal status without sending a full reply.
inputSchema:
  type: object
  properties:
    channel:
      type: string
      enum: [telegram, discord, slack]
      description: Which channel to react in
    messageId:
      type: string
      description: Message ID to react to
    emoji:
      type: string
      description: "Emoji to react with. Telegram: unicode emoji. Discord: emoji name or id. Slack: emoji name without colons"
    remove:
      type: boolean
      description: Remove the reaction instead of adding it
  required: [channel, messageId, emoji]
---
# Reactions Skill

Add or remove emoji reactions to messages.

## Supported Channels
- **Telegram**: unicode emoji reactions (👍 ❤️ 🔥 etc.)
- **Discord**: emoji name or custom emoji `name:id`
- **Slack**: emoji name (without colons, e.g. `thumbsup`)
