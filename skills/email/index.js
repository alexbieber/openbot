/**
 * Email Skill
 * Gmail read/send/search via Gmail REST API with OAuth2.
 */

import axios from 'axios';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function getAccessToken() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN');
  }

  const res = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  return res.data.access_token;
}

function gmailHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function makeEmailRaw({ to, subject, body, inReplyTo, references }) {
  const lines = [
    `To: ${to}`,
    `Subject: ${subject || '(no subject)'}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
  ];
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) lines.push(`References: ${references}`);
  lines.push('', body || '');
  return Buffer.from(lines.join('\r\n')).toString('base64url');
}

function parseMessage(msg) {
  const headers = msg.payload?.headers || [];
  const get = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

  let body = '';
  const parts = msg.payload?.parts || [msg.payload];
  for (const part of parts) {
    if (part?.mimeType === 'text/plain' && part.body?.data) {
      body = Buffer.from(part.body.data, 'base64url').toString('utf-8');
      break;
    }
  }

  return {
    id: msg.id,
    from: get('from'),
    to: get('to'),
    subject: get('subject'),
    date: get('date'),
    snippet: msg.snippet,
    body: body.substring(0, 2000),
  };
}

export default async function execute({ action, to, subject, body, query, message_id, max_results = 10 }) {
  const token = await getAccessToken();

  switch (action) {
    case 'list': {
      const res = await axios.get(`${GMAIL_BASE}/messages`, {
        headers: gmailHeaders(token),
        params: { maxResults: max_results, labelIds: 'INBOX' },
      });
      const messages = res.data.messages || [];
      if (!messages.length) return 'Inbox is empty.';

      const details = await Promise.all(
        messages.slice(0, 5).map(m =>
          axios.get(`${GMAIL_BASE}/messages/${m.id}`, {
            headers: gmailHeaders(token),
            params: { format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] },
          }).then(r => parseMessage(r.data))
        )
      );

      return `Inbox (${details.length} of ${messages.length} shown):\n\n` +
        details.map((m, i) => `${i + 1}. From: ${m.from}\n   Subject: ${m.subject}\n   ${m.snippet}`).join('\n\n');
    }

    case 'search': {
      if (!query) throw new Error('query is required for search');
      const res = await axios.get(`${GMAIL_BASE}/messages`, {
        headers: gmailHeaders(token),
        params: { q: query, maxResults: max_results },
      });
      const messages = res.data.messages || [];
      if (!messages.length) return `No emails found for: "${query}"`;

      const details = await Promise.all(
        messages.slice(0, 5).map(m =>
          axios.get(`${GMAIL_BASE}/messages/${m.id}`, {
            headers: gmailHeaders(token),
            params: { format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] },
          }).then(r => parseMessage(r.data))
        )
      );

      return `Search results for "${query}":\n\n` +
        details.map((m, i) => `${i + 1}. From: ${m.from}\n   Subject: ${m.subject}\n   ${m.snippet}`).join('\n\n');
    }

    case 'read': {
      if (!message_id) throw new Error('message_id is required for read');
      const res = await axios.get(`${GMAIL_BASE}/messages/${message_id}`, {
        headers: gmailHeaders(token),
        params: { format: 'full' },
      });
      const msg = parseMessage(res.data);
      return `From: ${msg.from}\nTo: ${msg.to}\nDate: ${msg.date}\nSubject: ${msg.subject}\n\n${msg.body}`;
    }

    case 'send': {
      if (!to) throw new Error('to is required for send');
      const raw = makeEmailRaw({ to, subject, body });
      await axios.post(`${GMAIL_BASE}/messages/send`, { raw }, { headers: gmailHeaders(token) });
      return `✅ Email sent to ${to} — Subject: "${subject}"`;
    }

    case 'reply': {
      if (!message_id || !body) throw new Error('message_id and body are required for reply');
      const orig = await axios.get(`${GMAIL_BASE}/messages/${message_id}`, {
        headers: gmailHeaders(token),
        params: { format: 'metadata', metadataHeaders: ['From', 'Subject', 'Message-ID'] },
      });
      const headers = orig.data.payload?.headers || [];
      const origFrom = headers.find(h => h.name === 'From')?.value || '';
      const origSubject = headers.find(h => h.name === 'Subject')?.value || '';
      const msgId = headers.find(h => h.name === 'Message-ID')?.value || '';

      const raw = makeEmailRaw({
        to: origFrom,
        subject: origSubject.startsWith('Re:') ? origSubject : `Re: ${origSubject}`,
        body,
        inReplyTo: msgId,
        references: msgId,
      });

      await axios.post(`${GMAIL_BASE}/messages/send`, { raw, threadId: orig.data.threadId }, { headers: gmailHeaders(token) });
      return `✅ Reply sent to ${origFrom}`;
    }

    default:
      throw new Error(`Unknown action: ${action}. Use: list, search, read, send, reply`);
  }
}
