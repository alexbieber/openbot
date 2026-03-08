/**
 * WeChat Official Account channel adapter
 * Uses WeChat MP (公众号) messaging API with XML webhook verification.
 *
 * Required env vars:
 *   WECHAT_APP_ID       — WeChat AppID
 *   WECHAT_APP_SECRET   — WeChat AppSecret
 *   WECHAT_TOKEN        — Webhook verification token
 *   WECHAT_ENCODING_KEY — AES encoding key (optional, for encrypted mode)
 *
 * Setup:
 *   1. Register a WeChat Official Account at mp.weixin.qq.com
 *   2. Set server URL to: https://your-domain.com/channels/wechat/webhook
 *   3. Set Token to match WECHAT_TOKEN
 */

import { createHash, createHmac } from 'crypto';

const APPID = process.env.WECHAT_APP_ID;
const SECRET = process.env.WECHAT_APP_SECRET;
const TOKEN = process.env.WECHAT_TOKEN || 'openbot_wechat_token';
const BASE_URL = 'https://api.weixin.qq.com/cgi-bin';

let _accessToken = null;
let _tokenExpiry = 0;

async function getAccessToken() {
  if (_accessToken && Date.now() < _tokenExpiry) return _accessToken;
  if (!APPID || !SECRET) throw new Error('WECHAT_APP_ID and WECHAT_APP_SECRET required');
  const res = await fetch(`${BASE_URL}/token?grant_type=client_credential&appid=${APPID}&secret=${SECRET}`);
  const data = await res.json();
  if (!data.access_token) throw new Error(`WeChat token error: ${JSON.stringify(data)}`);
  _accessToken = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return _accessToken;
}

function verifySignature(token, timestamp, nonce, signature) {
  const arr = [token, timestamp, nonce].sort();
  const hash = createHash('sha1').update(arr.join('')).digest('hex');
  return hash === signature;
}

function parseXML(xml) {
  const result = {};
  const matches = xml.matchAll(/<(\w+)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/\1>/g);
  for (const [, key, value] of matches) result[key] = value;
  return result;
}

function buildXML(fields) {
  const content = Object.entries(fields).map(([k, v]) => `<${k}><![CDATA[${v}]]></${k}>`).join('');
  return `<xml>${content}</xml>`;
}

async function sendTextMessage(toUser, fromUser, text) {
  return buildXML({
    ToUserName: toUser,
    FromUserName: fromUser,
    CreateTime: Math.floor(Date.now() / 1000),
    MsgType: 'text',
    Content: text,
  });
}

async function sendActiveMessage(openId, text) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}/message/custom/send?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      touser: openId,
      msgtype: 'text',
      text: { content: text },
    }),
  });
  return res.json();
}

export function registerWeChatWebhook(app, onMessage) {
  if (!APPID) {
    console.log('[WeChat] Skipped — WECHAT_APP_ID not set');
    return;
  }

  // Verification GET
  app.get('/channels/wechat/webhook', (req, res) => {
    const { signature, timestamp, nonce, echostr } = req.query;
    if (verifySignature(TOKEN, timestamp, nonce, signature)) {
      res.send(echostr);
    } else {
      res.status(403).send('Forbidden');
    }
  });

  // Message POST
  app.post('/channels/wechat/webhook', async (req, res) => {
    const { signature, timestamp, nonce } = req.query;
    if (!verifySignature(TOKEN, timestamp, nonce, signature)) {
      return res.status(403).send('Forbidden');
    }

    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      try {
        const msg = parseXML(body);
        const { MsgType, Content, FromUserName, ToUserName, Event, EventKey } = msg;

        // Event messages (subscribe, unsubscribe, menu click)
        if (MsgType === 'event') {
          if (Event === 'subscribe') {
            const reply = await sendTextMessage(FromUserName, ToUserName, 'Welcome! I\'m OpenBot. Send me a message to get started.');
            res.set('Content-Type', 'application/xml').send(reply);
          } else if (Event === 'CLICK') {
            const text = `Menu: ${EventKey}`;
            const reply = await sendTextMessage(FromUserName, ToUserName, text);
            res.set('Content-Type', 'application/xml').send(reply);
          } else {
            res.send('success');
          }
          return;
        }

        // Text message
        if (MsgType === 'text' && Content) {
          // Respond with processing indicator
          res.set('Content-Type', 'application/xml').send(
            await sendTextMessage(FromUserName, ToUserName, '⏳ Processing...')
          );

          // Process message async
          const response = await onMessage({
            channel: 'wechat',
            userId: FromUserName,
            peerId: FromUserName,
            content: Content,
            messageId: msg.MsgId,
          }).catch(() => null);

          if (response?.content) {
            await sendActiveMessage(FromUserName, response.content).catch(() => {});
          }
          return;
        }

        // Voice message — transcribe if possible
        if (MsgType === 'voice') {
          res.set('Content-Type', 'application/xml').send(
            await sendTextMessage(FromUserName, ToUserName, '[Voice messages not supported yet. Please send text.]')
          );
          return;
        }

        res.send('success');
      } catch (err) {
        console.error('[WeChat] Error:', err.message);
        res.send('success');
      }
    });
  });

  // API endpoint to send message to a WeChat user
  app.post('/channels/wechat/send', async (req, res) => {
    try {
      const { openId, text } = req.body;
      const result = await sendActiveMessage(openId, text);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  console.log('[WeChat] Webhook registered at /channels/wechat/webhook');
}
