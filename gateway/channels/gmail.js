/**
 * Gmail PubSub channel — receives Gmail notifications via Google Cloud Pub/Sub push.
 * Setup:
 *   1. Enable Gmail API + Cloud Pub/Sub in GCP console
 *   2. Create a Pub/Sub topic and subscription (push to /channels/gmail/webhook)
 *   3. Grant gmail-api-push@system.gserviceaccount.com roles/pubsub.publisher
 *   4. Call gmail.users.watch({ topicName, labelIds: ['INBOX'] }) to subscribe
 *
 * Required env vars:
 *   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
 *   GMAIL_PUBSUB_TOPIC (e.g. projects/my-proj/topics/gmail)
 *   GMAIL_WEBHOOK_SECRET (optional HMAC secret for validation)
 */

import express from 'express';
import { createHmac } from 'crypto';

const router = express.Router();

// ── Google OAuth2 token refresh ───────────────────────────────────────────────
let _accessToken = null;
let _tokenExpiry = 0;

async function getAccessToken() {
  if (_accessToken && Date.now() < _tokenExpiry) return _accessToken;
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
  if (!GMAIL_CLIENT_ID) throw new Error('Gmail OAuth not configured');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Gmail token error: ${data.error_description || data.error}`);
  _accessToken = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return _accessToken;
}

// ── Fetch a message from Gmail API ───────────────────────────────────────────
async function fetchMessage(userId, messageId) {
  const token = await getAccessToken();
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${userId}/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return res.json();
}

function extractBody(payload) {
  if (!payload) return '';
  if (payload.body?.data) return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  for (const part of (payload.parts || [])) {
    if (part.mimeType === 'text/plain') return Buffer.from(part.body?.data || '', 'base64url').toString('utf-8');
  }
  for (const part of (payload.parts || [])) {
    if (part.mimeType === 'text/html') return Buffer.from(part.body?.data || '', 'base64url').toString('utf-8').replace(/<[^>]+>/g, '');
  }
  return '';
}

function getHeader(headers, name) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

// ── Pub/Sub push webhook ───────────────────────────────────────────────────────
export function registerGmailWebhook(app, onMessage) {
  app.post('/channels/gmail/webhook', express.json(), async (req, res) => {
    res.sendStatus(204); // Acknowledge immediately

    // Optional HMAC validation
    const secret = process.env.GMAIL_WEBHOOK_SECRET;
    if (secret) {
      const sig = req.headers['x-goog-signature'] || '';
      const expected = createHmac('sha1', secret).update(JSON.stringify(req.body)).digest('base64');
      if (sig !== expected) return;
    }

    try {
      const envelope = req.body?.message;
      if (!envelope) return;
      const data = JSON.parse(Buffer.from(envelope.data, 'base64').toString('utf-8'));
      const userId = data.emailAddress;
      const historyId = data.historyId;

      // Use history API to find new messages since last historyId
      const token = await getAccessToken();
      const lastHistoryId = globalThis._gmailLastHistoryId?.[userId] || historyId;
      globalThis._gmailLastHistoryId = globalThis._gmailLastHistoryId || {};
      globalThis._gmailLastHistoryId[userId] = historyId;

      const histRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/${userId}/history?startHistoryId=${lastHistoryId}&historyTypes=messageAdded&labelId=INBOX`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const hist = await histRes.json();
      const added = (hist.history || []).flatMap(h => h.messagesAdded || []);

      for (const { message } of added) {
        const full = await fetchMessage(userId, message.id).catch(() => null);
        if (!full) continue;
        const subject = getHeader(full.payload?.headers, 'Subject');
        const from = getHeader(full.payload?.headers, 'From');
        const body = extractBody(full.payload).slice(0, 2000);
        const labels = full.labelIds || [];
        if (labels.includes('SENT')) continue; // Skip sent mail

        onMessage({
          channel: 'gmail',
          userId,
          peerId: from,
          messageId: full.id,
          content: `📧 **Email from** ${from}\n**Subject:** ${subject}\n\n${body}`,
          metadata: { subject, from, labels, historyId },
        });
      }
    } catch (err) {
      console.error('[Gmail] Webhook error:', err.message);
    }
  });

  // Setup endpoint: re-subscribe to Gmail watch
  app.post('/channels/gmail/watch', async (req, res) => {
    try {
      const topic = process.env.GMAIL_PUBSUB_TOPIC;
      if (!topic) return res.status(400).json({ error: 'GMAIL_PUBSUB_TOPIC not set' });
      const token = await getAccessToken();
      const userId = req.body?.userId || 'me';
      const watchRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/${userId}/watch`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ topicName: topic, labelIds: ['INBOX'] }),
        },
      );
      const watchData = await watchRes.json();
      res.json(watchData);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  console.log('[Gmail] Pub/Sub webhook registered at POST /channels/gmail/webhook');
}
