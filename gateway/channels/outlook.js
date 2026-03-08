/**
 * Outlook / Microsoft 365 channel adapter
 * Uses Microsoft Graph API for reading and sending emails.
 * Supports Outlook.com and Microsoft 365 accounts.
 *
 * Required env vars:
 *   OUTLOOK_CLIENT_ID     — Azure App Registration Client ID
 *   OUTLOOK_CLIENT_SECRET — Azure App Registration Client Secret
 *   OUTLOOK_TENANT_ID     — Azure Tenant ID (use 'common' for personal accounts)
 *   OUTLOOK_REFRESH_TOKEN — OAuth2 refresh token (get via CLI: openbot auth login outlook)
 *
 * Webhook mode (push notifications):
 *   Requires a public HTTPS endpoint at /channels/outlook/webhook
 *   Register with: openbot channels outlook subscribe
 *
 * Polling mode (fallback):
 *   Polls inbox every OUTLOOK_POLL_INTERVAL seconds (default: 30)
 *
 * Setup steps:
 *   1. Register app at portal.azure.com → App Registrations
 *   2. Add permissions: Mail.ReadWrite, Mail.Send (Delegated)
 *   3. Get refresh token: openbot auth login outlook
 *   4. Set env vars above
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TOKEN_URL = 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token';
const SCOPES = 'Mail.ReadWrite Mail.Send offline_access';

let _accessToken = null;
let _tokenExpiry = 0;

async function getAccessToken() {
  if (_accessToken && Date.now() < _tokenExpiry) return _accessToken;

  const clientId = process.env.OUTLOOK_CLIENT_ID;
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;
  const tenant = process.env.OUTLOOK_TENANT_ID || 'common';
  const refreshToken = process.env.OUTLOOK_REFRESH_TOKEN;

  if (!clientId || !refreshToken) throw new Error('OUTLOOK_CLIENT_ID and OUTLOOK_REFRESH_TOKEN required');

  const url = TOKEN_URL.replace('{tenant}', tenant);
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret || '',
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: SCOPES,
  });

  const res = await fetch(url, { method: 'POST', body: params, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Outlook token refresh failed: ${JSON.stringify(data)}`);

  _accessToken = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;

  // Update stored refresh token if it rotated
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    process.env.OUTLOOK_REFRESH_TOKEN = data.refresh_token;
  }

  return _accessToken;
}

async function graphRequest(path, opts = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  });
  if (!res.ok) throw new Error(`Graph API ${opts.method || 'GET'} ${path}: ${res.status} ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

// ── Unread email polling ───────────────────────────────────────────────────

let _pollTimer = null;
let _lastPollTime = new Date().toISOString();
let _processedIds = new Set();

async function pollUnreadEmails(onMessage) {
  try {
    const since = _lastPollTime;
    _lastPollTime = new Date().toISOString();

    const data = await graphRequest(
      `/me/mailFolders/Inbox/messages?$filter=isRead eq false and receivedDateTime gt ${since}&$top=10&$orderby=receivedDateTime asc&$select=id,subject,from,bodyPreview,receivedDateTime,body`
    );

    for (const email of (data?.value || [])) {
      if (_processedIds.has(email.id)) continue;
      _processedIds.add(email.id);

      // Clean HTML body
      let content = email.bodyPreview || '';
      if (email.body?.contentType === 'html') {
        content = email.body.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
      } else if (email.body?.content) {
        content = email.body.content.slice(0, 2000);
      }

      const msg = {
        channel: 'outlook',
        userId: email.from?.emailAddress?.address || 'unknown',
        displayName: email.from?.emailAddress?.name,
        content: `📧 **${email.subject}**\nFrom: ${email.from?.emailAddress?.address}\n\n${content}`,
        messageId: email.id,
        subject: email.subject,
        metadata: { emailId: email.id, receivedAt: email.receivedDateTime },
      };

      const response = await onMessage(msg);

      // Reply if we got a response
      if (response?.content) {
        await replyToEmail(email.id, response.content, email.subject).catch(() => {});
        // Mark as read
        await graphRequest(`/me/messages/${email.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isRead: true }),
        }).catch(() => {});
      }
    }

    // Clean up old processed IDs (keep last 1000)
    if (_processedIds.size > 1000) {
      _processedIds = new Set([..._processedIds].slice(-500));
    }
  } catch (err) {
    console.error('[Outlook] Poll error:', err.message);
  }
}

async function replyToEmail(emailId, replyText, originalSubject) {
  return graphRequest(`/me/messages/${emailId}/reply`, {
    method: 'POST',
    body: JSON.stringify({
      message: {
        body: { contentType: 'Text', content: replyText },
      },
      comment: replyText,
    }),
  });
}

export async function sendOutlookEmail({ to, subject, body, cc, isHtml = false }) {
  return graphRequest('/me/sendMail', {
    method: 'POST',
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: isHtml ? 'HTML' : 'Text', content: body },
        toRecipients: to.split(',').map(e => ({ emailAddress: { address: e.trim() } })),
        ...(cc ? { ccRecipients: cc.split(',').map(e => ({ emailAddress: { address: e.trim() } })) } : {}),
      },
      saveToSentItems: true,
    }),
  });
}

// ── Graph webhook (push notifications) ────────────────────────────────────

export function registerOutlookWebhook(app, onMessage) {
  if (!process.env.OUTLOOK_CLIENT_ID) {
    console.log('[Outlook] Skipped — OUTLOOK_CLIENT_ID not set');
    return;
  }

  // Webhook validation (Microsoft sends a validationToken on subscription)
  app.post('/channels/outlook/webhook', async (req, res) => {
    if (req.query.validationToken) {
      return res.set('Content-Type', 'text/plain').send(req.query.validationToken);
    }

    try {
      const notifications = req.body?.value || [];
      for (const notification of notifications) {
        const emailId = notification.resourceData?.id;
        if (!emailId || _processedIds.has(emailId)) continue;
        _processedIds.add(emailId);

        try {
          const email = await graphRequest(`/me/messages/${emailId}?$select=id,subject,from,bodyPreview,body`);
          if (!email || email.isRead) continue;

          let content = email.bodyPreview || '';
          if (email.body?.content) {
            content = email.body.contentType === 'html'
              ? email.body.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000)
              : email.body.content.slice(0, 2000);
          }

          const msg = {
            channel: 'outlook',
            userId: email.from?.emailAddress?.address || 'unknown',
            displayName: email.from?.emailAddress?.name,
            content: `📧 **${email.subject}**\nFrom: ${email.from?.emailAddress?.address}\n\n${content}`,
            messageId: emailId,
            subject: email.subject,
          };

          const response = await onMessage(msg);
          if (response?.content) {
            await replyToEmail(emailId, response.content, email.subject).catch(() => {});
            await graphRequest(`/me/messages/${emailId}`, {
              method: 'PATCH',
              body: JSON.stringify({ isRead: true }),
            }).catch(() => {});
          }
        } catch {}
      }
      res.status(202).send();
    } catch (err) {
      console.error('[Outlook] Webhook error:', err.message);
      res.status(200).send(); // always 200 to avoid Microsoft retrying
    }
  });

  // Subscribe endpoint
  app.post('/channels/outlook/subscribe', async (req, res) => {
    try {
      const { notificationUrl } = req.body;
      const expiry = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days
      const sub = await graphRequest('/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          changeType: 'created',
          notificationUrl: notificationUrl || `${req.protocol}://${req.hostname}/channels/outlook/webhook`,
          resource: '/me/mailFolders/Inbox/messages',
          expirationDateTime: expiry.toISOString(),
          clientState: 'openbot-outlook',
        }),
      });
      res.json(sub);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Send email API
  app.post('/channels/outlook/send', async (req, res) => {
    try {
      await sendOutlookEmail(req.body);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Start polling fallback
  const pollInterval = (parseInt(process.env.OUTLOOK_POLL_INTERVAL) || 30) * 1000;
  _pollTimer = setInterval(() => pollUnreadEmails(onMessage), pollInterval);
  console.log(`[Outlook] Started (polling every ${pollInterval / 1000}s + webhook at /channels/outlook/webhook)`);
}

export function stopOutlookPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}
