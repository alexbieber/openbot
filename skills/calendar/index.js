/**
 * Calendar Skill
 * Google Calendar read/write via REST API with OAuth2.
 */

import axios from 'axios';

const CAL_BASE = 'https://www.googleapis.com/calendar/v3';

async function getAccessToken(context) {
  const clientId = process.env.GOOGLE_CLIENT_ID || context.config?.skills?.googleClientId;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || context.config?.skills?.googleClientSecret;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN || context.config?.skills?.googleRefreshToken;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google Calendar not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN');
  }

  const res = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  return res.data.access_token;
}

function calHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

function formatEvent(e) {
  const start = e.start?.dateTime || e.start?.date || 'unknown';
  const end = e.end?.dateTime || e.end?.date || '';
  const when = start.includes('T')
    ? new Date(start).toLocaleString()
    : start;
  return `📅 ${e.summary || '(untitled)'}\n   When: ${when}\n   ${e.location ? `Where: ${e.location}\n   ` : ''}${e.description ? `Notes: ${e.description.substring(0, 100)}` : ''}`.trim();
}

export default async function execute({ action, title, start, end, description, location, days = 7, query, event_id, calendar_id = 'primary' }, context = {}) {
  const token = await getAccessToken(context);
  const headers = calHeaders(token);

  switch (action) {
    case 'today': {
      const now = new Date();
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59);

      const res = await axios.get(`${CAL_BASE}/calendars/${calendar_id}/events`, {
        headers,
        params: {
          timeMin: now.toISOString(),
          timeMax: endOfDay.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
        },
      });

      const events = res.data.items || [];
      if (!events.length) return "You have no more events today.";
      return `Today's remaining events (${events.length}):\n\n` + events.map(formatEvent).join('\n\n');
    }

    case 'list': {
      const now = new Date();
      const future = new Date(now.getTime() + days * 86400000);

      const res = await axios.get(`${CAL_BASE}/calendars/${calendar_id}/events`, {
        headers,
        params: {
          timeMin: now.toISOString(),
          timeMax: future.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 20,
        },
      });

      const events = res.data.items || [];
      if (!events.length) return `No events in the next ${days} days.`;
      return `Upcoming events (next ${days} days):\n\n` + events.map(formatEvent).join('\n\n');
    }

    case 'search': {
      if (!query) throw new Error('query is required for search');
      const res = await axios.get(`${CAL_BASE}/calendars/${calendar_id}/events`, {
        headers,
        params: { q: query, singleEvents: true, maxResults: 10 },
      });
      const events = res.data.items || [];
      if (!events.length) return `No events found for: "${query}"`;
      return `Events matching "${query}":\n\n` + events.map(formatEvent).join('\n\n');
    }

    case 'create': {
      if (!title || !start) throw new Error('title and start are required for create');

      const startDt = new Date(start);
      const endDt = end ? new Date(end) : new Date(startDt.getTime() + 3600000); // default 1hr

      const body = {
        summary: title,
        description,
        location,
        start: { dateTime: startDt.toISOString() },
        end: { dateTime: endDt.toISOString() },
      };

      const res = await axios.post(`${CAL_BASE}/calendars/${calendar_id}/events`, body, { headers });
      return `✅ Event created: "${title}"\nWhen: ${new Date(start).toLocaleString()}\nID: ${res.data.id}`;
    }

    case 'delete': {
      if (!event_id) throw new Error('event_id is required for delete');
      await axios.delete(`${CAL_BASE}/calendars/${calendar_id}/events/${event_id}`, { headers });
      return `🗑️ Event deleted: ${event_id}`;
    }

    default:
      throw new Error(`Unknown action: ${action}. Use: today, list, search, create, delete`);
  }
}
