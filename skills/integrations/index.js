/**
 * 50+ integrations — unified service interaction layer
 */

async function apiCall(url, { method = 'GET', headers = {}, body, params } = {}) {
  let fullUrl = url;
  if (params) { const q = new URLSearchParams(params); fullUrl += '?' + q.toString(); }
  const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(fullUrl, opts);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${typeof data === 'string' ? data.slice(0,200) : JSON.stringify(data).slice(0,200)}`);
  return data;
}

// ── Google OAuth token refresh ─────────────────────────────────────────────────
let _googleToken = null, _googleExpiry = 0;
async function googleToken() {
  if (_googleToken && Date.now() < _googleExpiry) return _googleToken;
  const { GOOGLE_CLIENT_ID: cid, GOOGLE_CLIENT_SECRET: cs, GOOGLE_REFRESH_TOKEN: rt } = process.env;
  if (!rt) throw new Error('GOOGLE_REFRESH_TOKEN not set');
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({grant_type:'refresh_token',client_id:cid,client_secret:cs,refresh_token:rt}) });
  const d = await res.json(); _googleToken = d.access_token; _googleExpiry = Date.now() + (d.expires_in-60)*1000; return _googleToken;
}

// ── Spotify token refresh ──────────────────────────────────────────────────────
let _spotifyToken = null, _spotifyExpiry = 0;
async function spotifyToken() {
  if (_spotifyToken && Date.now() < _spotifyExpiry) return _spotifyToken;
  const { SPOTIFY_CLIENT_ID: cid, SPOTIFY_CLIENT_SECRET: cs, SPOTIFY_REFRESH_TOKEN: rt } = process.env;
  if (!rt) throw new Error('SPOTIFY_REFRESH_TOKEN not set');
  const res = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded','Authorization':'Basic '+Buffer.from(`${cid}:${cs}`).toString('base64')}, body: new URLSearchParams({grant_type:'refresh_token',refresh_token:rt}) });
  const d = await res.json(); _spotifyToken = d.access_token; _spotifyExpiry = Date.now() + (d.expires_in-60)*1000; return _spotifyToken;
}

// ── Service handlers ───────────────────────────────────────────────────────────
const SERVICES = {

  // Google Calendar
  google_calendar: async (action, p) => {
    const tok = await googleToken();
    const h = { Authorization: `Bearer ${tok}` };
    const cal = p.calendarId || 'primary';
    if (action === 'list_events') return apiCall(`https://www.googleapis.com/calendar/v3/calendars/${cal}/events`, { headers: h, params: { maxResults: p.limit||10, timeMin: p.from||new Date().toISOString(), orderBy:'startTime', singleEvents:'true' } });
    if (action === 'create_event') return apiCall(`https://www.googleapis.com/calendar/v3/calendars/${cal}/events`, { method:'POST', headers:h, body:{ summary:p.title, description:p.description, start:{ dateTime:p.start, timeZone:p.timezone||'UTC' }, end:{ dateTime:p.end, timeZone:p.timezone||'UTC' }, attendees:(p.attendees||[]).map(e=>({email:e})) } });
    if (action === 'delete_event') return apiCall(`https://www.googleapis.com/calendar/v3/calendars/${cal}/events/${p.eventId}`, { method:'DELETE', headers:h });
    if (action === 'update_event') return apiCall(`https://www.googleapis.com/calendar/v3/calendars/${cal}/events/${p.eventId}`, { method:'PATCH', headers:h, body:p.updates });
    if (action === 'list_calendars') return apiCall('https://www.googleapis.com/calendar/v3/users/me/calendarList', { headers:h });
    throw new Error(`Unknown action: ${action}`);
  },

  // Spotify
  spotify: async (action, p) => {
    const tok = await spotifyToken();
    const h = { Authorization: `Bearer ${tok}` };
    if (action === 'now_playing') return apiCall('https://api.spotify.com/v1/me/player/currently-playing', { headers:h });
    if (action === 'play') return apiCall('https://api.spotify.com/v1/me/player/play', { method:'PUT', headers:h, body: p.uri ? { uris:[p.uri] } : p.contextUri ? { context_uri:p.contextUri } : undefined });
    if (action === 'pause') return apiCall('https://api.spotify.com/v1/me/player/pause', { method:'PUT', headers:h });
    if (action === 'next') return apiCall('https://api.spotify.com/v1/me/player/next', { method:'POST', headers:h });
    if (action === 'previous') return apiCall('https://api.spotify.com/v1/me/player/previous', { method:'POST', headers:h });
    if (action === 'volume') return apiCall(`https://api.spotify.com/v1/me/player/volume?volume_percent=${p.volume}`, { method:'PUT', headers:h });
    if (action === 'search') return apiCall('https://api.spotify.com/v1/search', { headers:h, params:{ q:p.query, type:p.type||'track,artist', limit:p.limit||10 } });
    if (action === 'playlists') return apiCall('https://api.spotify.com/v1/me/playlists', { headers:h, params:{ limit:p.limit||20 } });
    if (action === 'queue') return apiCall('https://api.spotify.com/v1/me/player/queue', { headers:h });
    throw new Error(`Unknown action: ${action}`);
  },

  // Notion
  notion: async (action, p) => {
    const tok = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
    if (!tok) throw new Error('NOTION_TOKEN not set');
    const h = { Authorization: `Bearer ${tok}`, 'Notion-Version': '2022-06-28' };
    if (action === 'search') return apiCall('https://api.notion.com/v1/search', { method:'POST', headers:h, body:{ query:p.query, filter:p.filter } });
    if (action === 'get_page') return apiCall(`https://api.notion.com/v1/pages/${p.pageId}`, { headers:h });
    if (action === 'get_block_children') return apiCall(`https://api.notion.com/v1/blocks/${p.blockId}/children`, { headers:h });
    if (action === 'create_page') return apiCall('https://api.notion.com/v1/pages', { method:'POST', headers:h, body:{ parent:p.parent, properties:p.properties, children:p.children } });
    if (action === 'update_page') return apiCall(`https://api.notion.com/v1/pages/${p.pageId}`, { method:'PATCH', headers:h, body:{ properties:p.properties } });
    if (action === 'append_blocks') return apiCall(`https://api.notion.com/v1/blocks/${p.blockId}/children`, { method:'PATCH', headers:h, body:{ children:p.blocks } });
    if (action === 'query_database') return apiCall(`https://api.notion.com/v1/databases/${p.databaseId}/query`, { method:'POST', headers:h, body:{ filter:p.filter, sorts:p.sorts, page_size:p.limit||20 } });
    if (action === 'list_databases') return apiCall('https://api.notion.com/v1/search', { method:'POST', headers:h, body:{ filter:{ property:'object', value:'database' } } });
    throw new Error(`Unknown action: ${action}`);
  },

  // GitHub
  github: async (action, p) => {
    const tok = process.env.GITHUB_TOKEN;
    if (!tok) throw new Error('GITHUB_TOKEN not set');
    const h = { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github.v3+json' };
    const base = 'https://api.github.com';
    if (action === 'get_repo') return apiCall(`${base}/repos/${p.owner}/${p.repo}`, { headers:h });
    if (action === 'list_issues') return apiCall(`${base}/repos/${p.owner}/${p.repo}/issues`, { headers:h, params:{ state:p.state||'open', per_page:p.limit||20 } });
    if (action === 'create_issue') return apiCall(`${base}/repos/${p.owner}/${p.repo}/issues`, { method:'POST', headers:h, body:{ title:p.title, body:p.body, labels:p.labels, assignees:p.assignees } });
    if (action === 'close_issue') return apiCall(`${base}/repos/${p.owner}/${p.repo}/issues/${p.number}`, { method:'PATCH', headers:h, body:{ state:'closed' } });
    if (action === 'create_pr') return apiCall(`${base}/repos/${p.owner}/${p.repo}/pulls`, { method:'POST', headers:h, body:{ title:p.title, body:p.body, head:p.head, base:p.base||'main' } });
    if (action === 'list_prs') return apiCall(`${base}/repos/${p.owner}/${p.repo}/pulls`, { headers:h, params:{ state:p.state||'open', per_page:p.limit||20 } });
    if (action === 'get_file') return apiCall(`${base}/repos/${p.owner}/${p.repo}/contents/${p.path}`, { headers:h, params:{ ref:p.ref||'main' } });
    if (action === 'search_code') return apiCall(`${base}/search/code?q=${encodeURIComponent(p.query)}`, { headers:h });
    if (action === 'list_workflows') return apiCall(`${base}/repos/${p.owner}/${p.repo}/actions/workflows`, { headers:h });
    if (action === 'trigger_workflow') return apiCall(`${base}/repos/${p.owner}/${p.repo}/actions/workflows/${p.workflowId}/dispatches`, { method:'POST', headers:h, body:{ ref:p.ref||'main', inputs:p.inputs||{} } });
    if (action === 'list_releases') return apiCall(`${base}/repos/${p.owner}/${p.repo}/releases`, { headers:h });
    if (action === 'user') return apiCall(`${base}/user`, { headers:h });
    throw new Error(`Unknown action: ${action}`);
  },

  // Jira
  jira: async (action, p) => {
    const url = process.env.JIRA_URL, email = process.env.JIRA_EMAIL, tok = process.env.JIRA_API_TOKEN;
    if (!url || !tok) throw new Error('JIRA_URL and JIRA_API_TOKEN required');
    const h = { Authorization: `Basic ${Buffer.from(`${email}:${tok}`).toString('base64')}`, Accept: 'application/json' };
    if (action === 'search') return apiCall(`${url}/rest/api/3/search`, { headers:h, params:{ jql:p.jql||'project='+p.project, maxResults:p.limit||20 } });
    if (action === 'get_issue') return apiCall(`${url}/rest/api/3/issue/${p.issueKey}`, { headers:h });
    if (action === 'create_issue') return apiCall(`${url}/rest/api/3/issue`, { method:'POST', headers:{...h,'Content-Type':'application/json'}, body:{ fields:{ project:{key:p.project}, summary:p.title, description:{ type:'doc', version:1, content:[{ type:'paragraph', content:[{ type:'text', text:p.body||'' }] }] }, issuetype:{ name:p.type||'Task' } } } });
    if (action === 'transition') return apiCall(`${url}/rest/api/3/issue/${p.issueKey}/transitions`, { method:'POST', headers:{...h,'Content-Type':'application/json'}, body:{ transition:{ id:p.transitionId } } });
    if (action === 'list_projects') return apiCall(`${url}/rest/api/3/project`, { headers:h });
    throw new Error(`Unknown action: ${action}`);
  },

  // Linear
  linear: async (action, p) => {
    const tok = process.env.LINEAR_API_KEY;
    if (!tok) throw new Error('LINEAR_API_KEY not set');
    const gql = (q, v = {}) => apiCall('https://api.linear.app/graphql', { method:'POST', headers:{ Authorization:tok, 'Content-Type':'application/json' }, body:{ query:q, variables:v } });
    if (action === 'list_issues') return gql(`query($teamId:String){issues(filter:{team:{id:{eq:$teamId}}},first:20){nodes{id title state{name}assignee{name}priority}}}`, { teamId:p.teamId });
    if (action === 'create_issue') return gql(`mutation($title:String!,$teamId:String!,$description:String){issueCreate(input:{title:$title,teamId:$teamId,description:$description}){issue{id title url}}}`, p);
    if (action === 'update_issue') return gql(`mutation($id:String!,$stateId:String,$assigneeId:String){issueUpdate(id:$id,input:{stateId:$stateId,assigneeId:$assigneeId}){issue{id title}}}`, p);
    if (action === 'list_teams') return gql(`{teams{nodes{id name key}}}`);
    throw new Error(`Unknown action: ${action}`);
  },

  // Stripe
  stripe: async (action, p) => {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY not set');
    const h = { Authorization: `Bearer ${key}` };
    const base = 'https://api.stripe.com/v1';
    if (action === 'list_charges') return apiCall(`${base}/charges`, { headers:h, params:{ limit:p.limit||10 } });
    if (action === 'list_customers') return apiCall(`${base}/customers`, { headers:h, params:{ limit:p.limit||10, email:p.email } });
    if (action === 'get_balance') return apiCall(`${base}/balance`, { headers:h });
    if (action === 'list_subscriptions') return apiCall(`${base}/subscriptions`, { headers:h, params:{ limit:p.limit||10, status:p.status||'active' } });
    if (action === 'create_payment_link') return apiCall(`${base}/payment_links`, { method:'POST', headers:{...h,'Content-Type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({ 'line_items[0][price]':p.priceId, 'line_items[0][quantity]':'1' }) });
    if (action === 'list_invoices') return apiCall(`${base}/invoices`, { headers:h, params:{ limit:p.limit||10, customer:p.customerId } });
    throw new Error(`Unknown action: ${action}`);
  },

  // Airtable
  airtable: async (action, p) => {
    const key = process.env.AIRTABLE_API_KEY;
    if (!key) throw new Error('AIRTABLE_API_KEY not set');
    const h = { Authorization: `Bearer ${key}` };
    const base = `https://api.airtable.com/v0/${p.baseId}/${encodeURIComponent(p.table||'')}`;
    if (action === 'list') return apiCall(base, { headers:h, params:{ maxRecords:p.limit||20, view:p.view, filterByFormula:p.filter } });
    if (action === 'get') return apiCall(`${base}/${p.recordId}`, { headers:h });
    if (action === 'create') return apiCall(base, { method:'POST', headers:{...h,'Content-Type':'application/json'}, body:{ fields:p.fields } });
    if (action === 'update') return apiCall(`${base}/${p.recordId}`, { method:'PATCH', headers:{...h,'Content-Type':'application/json'}, body:{ fields:p.fields } });
    if (action === 'delete') return apiCall(`${base}/${p.recordId}`, { method:'DELETE', headers:h });
    throw new Error(`Unknown action: ${action}`);
  },

  // Todoist
  todoist: async (action, p) => {
    const tok = process.env.TODOIST_API_TOKEN;
    if (!tok) throw new Error('TODOIST_API_TOKEN not set');
    const h = { Authorization: `Bearer ${tok}` };
    const base = 'https://api.todoist.com/rest/v2';
    if (action === 'list_tasks') return apiCall(`${base}/tasks`, { headers:h, params:{ project_id:p.projectId, filter:p.filter } });
    if (action === 'create_task') return apiCall(`${base}/tasks`, { method:'POST', headers:{...h,'Content-Type':'application/json'}, body:{ content:p.title, due_string:p.due, priority:p.priority||1, project_id:p.projectId } });
    if (action === 'close_task') return apiCall(`${base}/tasks/${p.taskId}/close`, { method:'POST', headers:h });
    if (action === 'list_projects') return apiCall(`${base}/projects`, { headers:h });
    if (action === 'create_project') return apiCall(`${base}/projects`, { method:'POST', headers:{...h,'Content-Type':'application/json'}, body:{ name:p.name } });
    throw new Error(`Unknown action: ${action}`);
  },

  // HubSpot
  hubspot: async (action, p) => {
    const tok = process.env.HUBSPOT_ACCESS_TOKEN;
    if (!tok) throw new Error('HUBSPOT_ACCESS_TOKEN not set');
    const h = { Authorization: `Bearer ${tok}` };
    const base = 'https://api.hubapi.com';
    if (action === 'list_contacts') return apiCall(`${base}/crm/v3/objects/contacts`, { headers:h, params:{ limit:p.limit||20 } });
    if (action === 'create_contact') return apiCall(`${base}/crm/v3/objects/contacts`, { method:'POST', headers:{...h,'Content-Type':'application/json'}, body:{ properties:p.properties } });
    if (action === 'list_deals') return apiCall(`${base}/crm/v3/objects/deals`, { headers:h, params:{ limit:p.limit||20 } });
    if (action === 'create_deal') return apiCall(`${base}/crm/v3/objects/deals`, { method:'POST', headers:{...h,'Content-Type':'application/json'}, body:{ properties:p.properties } });
    if (action === 'list_companies') return apiCall(`${base}/crm/v3/objects/companies`, { headers:h });
    throw new Error(`Unknown action: ${action}`);
  },

  // Sentry
  sentry: async (action, p) => {
    const tok = process.env.SENTRY_AUTH_TOKEN, org = process.env.SENTRY_ORG;
    if (!tok) throw new Error('SENTRY_AUTH_TOKEN not set');
    const h = { Authorization: `Bearer ${tok}` };
    const base = `https://sentry.io/api/0/organizations/${org||p.org}`;
    if (action === 'list_issues') return apiCall(`${base}/issues/`, { headers:h, params:{ project:p.project, limit:p.limit||20, query:p.query||'is:unresolved' } });
    if (action === 'resolve_issue') return apiCall(`https://sentry.io/api/0/issues/${p.issueId}/`, { method:'PUT', headers:{...h,'Content-Type':'application/json'}, body:{ status:'resolved' } });
    if (action === 'list_projects') return apiCall(`${base}/projects/`, { headers:h });
    if (action === 'list_releases') return apiCall(`${base}/releases/`, { headers:h });
    throw new Error(`Unknown action: ${action}`);
  },

  // PagerDuty
  pagerduty: async (action, p) => {
    const key = process.env.PAGERDUTY_API_KEY;
    if (!key) throw new Error('PAGERDUTY_API_KEY not set');
    const h = { Authorization: `Token token=${key}`, Accept: 'application/vnd.pagerduty+json;version=2' };
    if (action === 'list_incidents') return apiCall('https://api.pagerduty.com/incidents', { headers:h, params:{ statuses:['triggered','acknowledged'], limit:p.limit||20 } });
    if (action === 'acknowledge') return apiCall(`https://api.pagerduty.com/incidents/${p.incidentId}`, { method:'PUT', headers:{...h,'Content-Type':'application/json','From':p.email}, body:{ incident:{ type:'incident_reference', status:'acknowledged' } } });
    if (action === 'resolve') return apiCall(`https://api.pagerduty.com/incidents/${p.incidentId}`, { method:'PUT', headers:{...h,'Content-Type':'application/json','From':p.email}, body:{ incident:{ type:'incident_reference', status:'resolved' } } });
    if (action === 'create_incident') return apiCall('https://api.pagerduty.com/incidents', { method:'POST', headers:{...h,'Content-Type':'application/json','From':p.email}, body:{ incident:{ type:'incident', title:p.title, service:{ id:p.serviceId, type:'service_reference' } } } });
    throw new Error(`Unknown action: ${action}`);
  },

  // Datadog
  datadog: async (action, p) => {
    const api = process.env.DATADOG_API_KEY, app = process.env.DATADOG_APP_KEY;
    if (!api) throw new Error('DATADOG_API_KEY not set');
    const h = { 'DD-API-KEY':api, 'DD-APPLICATION-KEY':app||'', 'Content-Type':'application/json' };
    const base = `https://api.datadoghq.com/api/v1`;
    if (action === 'list_monitors') return apiCall(`${base}/monitor`, { headers:h, params:{ name:p.name } });
    if (action === 'mute_monitor') return apiCall(`${base}/monitor/${p.monitorId}/mute`, { method:'POST', headers:h });
    if (action === 'query_metrics') return apiCall(`${base}/query`, { headers:h, params:{ from:Math.floor(Date.now()/1000)-3600, to:Math.floor(Date.now()/1000), query:p.query } });
    if (action === 'list_events') return apiCall(`${base}/events`, { headers:h, params:{ start:Math.floor(Date.now()/1000)-3600, end:Math.floor(Date.now()/1000) } });
    throw new Error(`Unknown action: ${action}`);
  },

  // Cloudflare
  cloudflare: async (action, p) => {
    const tok = process.env.CLOUDFLARE_API_TOKEN;
    if (!tok) throw new Error('CLOUDFLARE_API_TOKEN not set');
    const h = { Authorization: `Bearer ${tok}` };
    const base = 'https://api.cloudflare.com/client/v4';
    if (action === 'list_zones') return apiCall(`${base}/zones`, { headers:h });
    if (action === 'purge_cache') return apiCall(`${base}/zones/${p.zoneId}/purge_cache`, { method:'POST', headers:{...h,'Content-Type':'application/json'}, body:{ purge_everything:p.all||true } });
    if (action === 'list_workers') return apiCall(`${base}/accounts/${p.accountId}/workers/scripts`, { headers:h });
    if (action === 'list_dns') return apiCall(`${base}/zones/${p.zoneId}/dns_records`, { headers:h, params:{ type:p.type } });
    throw new Error(`Unknown action: ${action}`);
  },

  // Vercel
  vercel: async (action, p) => {
    const tok = process.env.VERCEL_TOKEN;
    if (!tok) throw new Error('VERCEL_TOKEN not set');
    const h = { Authorization: `Bearer ${tok}` };
    const base = 'https://api.vercel.com';
    if (action === 'list_deployments') return apiCall(`${base}/v6/deployments`, { headers:h, params:{ limit:p.limit||10, projectId:p.projectId } });
    if (action === 'list_projects') return apiCall(`${base}/v9/projects`, { headers:h });
    if (action === 'get_deployment') return apiCall(`${base}/v13/deployments/${p.deploymentId}`, { headers:h });
    if (action === 'list_env') return apiCall(`${base}/v9/projects/${p.projectId}/env`, { headers:h });
    throw new Error(`Unknown action: ${action}`);
  },

  // SendGrid
  sendgrid: async (action, p) => {
    const key = process.env.SENDGRID_API_KEY;
    if (!key) throw new Error('SENDGRID_API_KEY not set');
    const h = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    if (action === 'send_email') return apiCall('https://api.sendgrid.com/v3/mail/send', { method:'POST', headers:h, body:{ personalizations:[{ to:[{ email:p.to }] }], from:{ email:p.from||process.env.SENDGRID_FROM }, subject:p.subject, content:[{ type:'text/html', value:p.body }] } });
    if (action === 'list_templates') return apiCall('https://api.sendgrid.com/v3/templates', { headers:h });
    throw new Error(`Unknown action: ${action}`);
  },

  // Twilio
  twilio: async (action, p) => {
    const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM;
    if (!sid) throw new Error('TWILIO_ACCOUNT_SID not set');
    const h = { Authorization: `Basic ${Buffer.from(`${sid}:${tok}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' };
    if (action === 'send_sms') return apiCall(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method:'POST', headers:h, body:new URLSearchParams({ To:p.to, From:p.from||from, Body:p.message }) });
    if (action === 'list_messages') return apiCall(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { headers:h, params:{ To:p.to, PageSize:p.limit||20 } });
    throw new Error(`Unknown action: ${action}`);
  },

  // NASA
  nasa: async (action, p) => {
    const key = process.env.NASA_API_KEY || 'DEMO_KEY';
    if (action === 'apod') return apiCall(`https://api.nasa.gov/planetary/apod`, { params:{ api_key:key, date:p.date, count:p.count } });
    if (action === 'neo') return apiCall(`https://api.nasa.gov/neo/rest/v1/feed`, { params:{ api_key:key, start_date:p.startDate, end_date:p.endDate } });
    if (action === 'mars_photos') return apiCall(`https://api.nasa.gov/mars-photos/api/v1/rovers/${p.rover||'curiosity'}/photos`, { params:{ api_key:key, sol:p.sol||1000, camera:p.camera } });
    throw new Error(`Unknown action: ${action}`);
  },

  // OpenWeatherMap
  openweather: async (action, p) => {
    const key = process.env.OPENWEATHER_API_KEY;
    if (!key) throw new Error('OPENWEATHER_API_KEY not set');
    if (action === 'current') return apiCall('https://api.openweathermap.org/data/2.5/weather', { params:{ q:p.city, lat:p.lat, lon:p.lon, appid:key, units:p.units||'metric' } });
    if (action === 'forecast') return apiCall('https://api.openweathermap.org/data/2.5/forecast', { params:{ q:p.city, appid:key, units:p.units||'metric', cnt:p.days*8||40 } });
    if (action === 'air_quality') return apiCall('https://api.openweathermap.org/data/2.5/air_pollution', { params:{ lat:p.lat, lon:p.lon, appid:key } });
    throw new Error(`Unknown action: ${action}`);
  },

  // NewsAPI
  newsapi: async (action, p) => {
    const key = process.env.NEWS_API_KEY;
    if (!key) throw new Error('NEWS_API_KEY not set');
    if (action === 'top_headlines') return apiCall('https://newsapi.org/v2/top-headlines', { params:{ apiKey:key, q:p.query, country:p.country||'us', category:p.category, pageSize:p.limit||10 } });
    if (action === 'everything') return apiCall('https://newsapi.org/v2/everything', { params:{ apiKey:key, q:p.query, from:p.from, to:p.to, sortBy:p.sort||'publishedAt', pageSize:p.limit||10 } });
    throw new Error(`Unknown action: ${action}`);
  },

  // AWS S3
  aws_s3: async (action, p) => {
    const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3').catch(() => { throw new Error('npm install @aws-sdk/client-s3') });
    const client = new S3Client({ region: p.region || process.env.AWS_DEFAULT_REGION || 'us-east-1' });
    if (action === 'list') return client.send(new ListObjectsV2Command({ Bucket:p.bucket, Prefix:p.prefix, MaxKeys:p.limit||100 }));
    if (action === 'delete') return client.send(new DeleteObjectCommand({ Bucket:p.bucket, Key:p.key }));
    throw new Error(`Unknown action: ${action}`);
  },

  // Shopify
  shopify: async (action, p) => {
    const key = process.env.SHOPIFY_ACCESS_TOKEN, shop = process.env.SHOPIFY_SHOP_DOMAIN;
    if (!key || !shop) throw new Error('SHOPIFY_ACCESS_TOKEN and SHOPIFY_SHOP_DOMAIN required');
    const h = { 'X-Shopify-Access-Token': key };
    const base = `https://${shop}/admin/api/2024-01`;
    if (action === 'list_orders') return apiCall(`${base}/orders.json`, { headers:h, params:{ status:p.status||'any', limit:p.limit||20 } });
    if (action === 'list_products') return apiCall(`${base}/products.json`, { headers:h, params:{ limit:p.limit||20 } });
    if (action === 'get_product') return apiCall(`${base}/products/${p.productId}.json`, { headers:h });
    if (action === 'update_inventory') return apiCall(`${base}/inventory_levels/set.json`, { method:'POST', headers:{...h,'Content-Type':'application/json'}, body:{ location_id:p.locationId, inventory_item_id:p.inventoryItemId, available:p.quantity } });
    throw new Error(`Unknown action: ${action}`);
  },

  // Figma
  figma: async (action, p) => {
    const tok = process.env.FIGMA_ACCESS_TOKEN;
    if (!tok) throw new Error('FIGMA_ACCESS_TOKEN not set');
    const h = { 'X-Figma-Token': tok };
    const base = 'https://api.figma.com/v1';
    if (action === 'get_file') return apiCall(`${base}/files/${p.fileId}`, { headers:h });
    if (action === 'list_files') return apiCall(`${base}/projects/${p.projectId}/files`, { headers:h });
    if (action === 'list_teams') return apiCall(`${base}/me`, { headers:h });
    if (action === 'get_comments') return apiCall(`${base}/files/${p.fileId}/comments`, { headers:h });
    if (action === 'add_comment') return apiCall(`${base}/files/${p.fileId}/comments`, { method:'POST', headers:{...h,'Content-Type':'application/json'}, body:{ message:p.message } });
    throw new Error(`Unknown action: ${action}`);
  },

  // Asana
  asana: async (action, p) => {
    const tok = process.env.ASANA_ACCESS_TOKEN;
    if (!tok) throw new Error('ASANA_ACCESS_TOKEN not set');
    const h = { Authorization: `Bearer ${tok}` };
    const base = 'https://app.asana.com/api/1.0';
    if (action === 'list_tasks') return apiCall(`${base}/tasks`, { headers:h, params:{ project:p.projectId, limit:p.limit||20 } });
    if (action === 'create_task') return apiCall(`${base}/tasks`, { method:'POST', headers:{...h,'Content-Type':'application/json'}, body:{ data:{ name:p.title, notes:p.body, projects:[p.projectId], due_on:p.due } } });
    if (action === 'complete_task') return apiCall(`${base}/tasks/${p.taskId}`, { method:'PUT', headers:{...h,'Content-Type':'application/json'}, body:{ data:{ completed:true } } });
    if (action === 'list_projects') return apiCall(`${base}/projects`, { headers:h });
    throw new Error(`Unknown action: ${action}`);
  },
};

export default {
  name: 'integrations',
  async run({ tool = 'integration', service, action, params: p = {} }) {
    if (!service) return { ok: false, error: 'service required. Available: ' + Object.keys(SERVICES).join(', ') };
    if (!action) return { ok: false, error: 'action required' };
    const handler = SERVICES[service.toLowerCase()];
    if (!handler) return { ok: false, error: `Unknown service: ${service}. Available: ${Object.keys(SERVICES).join(', ')}` };
    try {
      const result = await handler(action, p);
      return { ok: true, service, action, result };
    } catch (err) {
      return { ok: false, service, action, error: err.message };
    }
  },
};
