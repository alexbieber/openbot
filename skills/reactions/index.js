import axios from 'axios';

export const skill = {
  name: 'reactions',
  description: 'Add emoji reactions to channel messages',
  async execute({ channel, messageId, emoji, remove = false, chatId }) {
    switch (channel) {
      case 'telegram': {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) return { error: 'TELEGRAM_BOT_TOKEN not set' };
        const method = remove ? 'deleteMessageReaction' : 'setMessageReaction';
        try {
          await axios.post(`https://api.telegram.org/bot${token}/${method}`, {
            chat_id: chatId,
            message_id: parseInt(messageId),
            reaction: remove ? [] : [{ type: 'emoji', emoji }],
          });
          return { ok: true, channel, messageId, emoji };
        } catch (err) { return { error: err.response?.data?.description || err.message }; }
      }

      case 'discord': {
        const token = process.env.DISCORD_BOT_TOKEN;
        if (!token) return { error: 'DISCORD_BOT_TOKEN not set' };
        const encoded = encodeURIComponent(emoji);
        const method = remove ? 'DELETE' : 'PUT';
        const url = `https://discord.com/api/v10/channels/${chatId}/messages/${messageId}/reactions/${encoded}/@me`;
        try {
          await axios({ method, url, headers: { Authorization: `Bot ${token}` } });
          return { ok: true, channel, messageId, emoji };
        } catch (err) { return { error: err.response?.data?.message || err.message }; }
      }

      case 'slack': {
        const token = process.env.SLACK_BOT_TOKEN;
        if (!token) return { error: 'SLACK_BOT_TOKEN not set' };
        const method = remove ? 'reactions.remove' : 'reactions.add';
        try {
          await axios.post(`https://slack.com/api/${method}`,
            { name: emoji.replace(/:/g, ''), timestamp: messageId, channel: chatId },
            { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
          );
          return { ok: true, channel, messageId, emoji };
        } catch (err) { return { error: err.message }; }
      }

      default:
        return { error: `Reactions not supported for channel: ${channel}` };
    }
  },
};

export default skill;
