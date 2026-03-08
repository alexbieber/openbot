/**
 * Smart Home Skill
 * Unified interface for HomeKit, Google Home, Alexa, SmartThings, IFTTT, Tuya, Philips Hue.
 */

// ── Philips Hue ───────────────────────────────────────────────────────────────
async function hueApi(path, method = 'GET', body = null) {
  const ip = process.env.HUE_BRIDGE_IP;
  const key = process.env.HUE_API_KEY;
  if (!ip || !key) throw new Error('HUE_BRIDGE_IP and HUE_API_KEY required');
  const opts = { method, headers: { 'Content-Type': 'application/json', 'hue-application-key': key } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`https://${ip}/clip/v2${path}`, opts);
  return res.json();
}

// ── SmartThings ────────────────────────────────────────────────────────────────
async function stApi(path, method = 'GET', body = null) {
  const token = process.env.SMARTTHINGS_TOKEN;
  if (!token) throw new Error('SMARTTHINGS_TOKEN required');
  const opts = { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`https://api.smartthings.com/v1${path}`, opts);
  return res.json();
}

// ── IFTTT ──────────────────────────────────────────────────────────────────────
async function iftttTrigger(event, value1, value2, value3) {
  const key = process.env.IFTTT_KEY;
  if (!key) throw new Error('IFTTT_KEY required');
  const body = { value1, value2, value3 };
  const res = await fetch(`https://maker.ifttt.com/trigger/${event}/json/with/key/${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return res.text();
}

// ── Tuya Cloud API ─────────────────────────────────────────────────────────────
async function tuyaToken() {
  const cid = process.env.TUYA_CLIENT_ID;
  const secret = process.env.TUYA_CLIENT_SECRET;
  if (!cid || !secret) throw new Error('TUYA_CLIENT_ID and TUYA_CLIENT_SECRET required');
  const ts = Date.now().toString();
  const { createHmac } = await import('crypto');
  const sign = createHmac('sha256', secret).update(`${cid}${ts}`).digest('hex').toUpperCase();
  const res = await fetch('https://openapi.tuyaeu.com/v1.0/token?grant_type=1', {
    headers: { client_id: cid, sign, t: ts, sign_method: 'HMAC-SHA256' },
  });
  const data = await res.json();
  return data.result?.access_token;
}

async function tuyaCommand(deviceId, commands) {
  const cid = process.env.TUYA_CLIENT_ID;
  const secret = process.env.TUYA_CLIENT_SECRET;
  if (!cid || !secret) throw new Error('TUYA_CLIENT_ID and TUYA_CLIENT_SECRET required');
  const token = await tuyaToken();
  const ts = Date.now().toString();
  const { createHmac } = await import('crypto');
  const sign = createHmac('sha256', secret).update(`${cid}${token}${ts}`).digest('hex').toUpperCase();
  const res = await fetch(`https://openapi.tuyaeu.com/v1.0/devices/${deviceId}/commands`, {
    method: 'POST',
    headers: { client_id: cid, access_token: token, sign, t: ts, 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands }),
  });
  return res.json();
}

// ── Google Home (via Smart Device Management API) ──────────────────────────────
let _googleHomeToken = null;
let _googleTokenExpiry = 0;

async function googleHomeRefresh() {
  if (_googleHomeToken && Date.now() < _googleTokenExpiry) return _googleHomeToken;
  const cid = process.env.GOOGLE_HOME_CLIENT_ID;
  const secret = process.env.GOOGLE_HOME_CLIENT_SECRET;
  const refresh = process.env.GOOGLE_HOME_REFRESH_TOKEN;
  if (!cid || !refresh) throw new Error('GOOGLE_HOME_CLIENT_ID and GOOGLE_HOME_REFRESH_TOKEN required');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cid, client_secret: secret || '', refresh_token: refresh, grant_type: 'refresh_token' }),
  });
  const data = await res.json();
  _googleHomeToken = data.access_token;
  _googleTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return _googleHomeToken;
}

async function googleHomeApi(path, method = 'GET', body = null) {
  const token = await googleHomeRefresh();
  const projectId = process.env.GOOGLE_HOME_PROJECT_ID;
  if (!projectId) throw new Error('GOOGLE_HOME_PROJECT_ID required');
  const base = `https://smartdevicemanagement.googleapis.com/v1/enterprises/${projectId}`;
  const opts = { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${base}${path}`, opts);
  return res.json();
}

// ── Alexa Smart Home (via Alexa Remote Control or Skills API) ─────────────────
async function alexaRefresh() {
  const cid = process.env.ALEXA_CLIENT_ID;
  const secret = process.env.ALEXA_CLIENT_SECRET;
  const refresh = process.env.ALEXA_REFRESH_TOKEN;
  if (!cid || !refresh) throw new Error('ALEXA_CLIENT_ID and ALEXA_REFRESH_TOKEN required');
  const res = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cid, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }),
  });
  const data = await res.json();
  return data.access_token;
}

async function alexaApi(path, method = 'GET', body = null) {
  const token = await alexaRefresh();
  const opts = { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`https://api.amazonalexa.com${path}`, opts);
  return res.json();
}

// ── Philips Hue helpers ───────────────────────────────────────────────────────
async function hueGetAllLights() {
  const data = await hueApi('/resource/light');
  return (data.data || []).map(l => ({ id: l.id, name: l.metadata?.name, on: l.on?.on, brightness: l.dimming?.brightness }));
}

async function hueSetLight(id, { on, brightness, color }) {
  const body = {};
  if (on !== undefined) body.on = { on };
  if (brightness !== undefined) body.dimming = { brightness: Math.min(100, Math.max(0, brightness)) };
  if (color) body.color = { xy: hexToXY(color) };
  return hueApi(`/resource/light/${id}`, 'PUT', body);
}

function hexToXY(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const X = r * 0.664511 + g * 0.154324 + b * 0.162028;
  const Y = r * 0.283881 + g * 0.668433 + b * 0.047685;
  const Z = r * 0.000088 + g * 0.072310 + b * 0.986039;
  const sum = X + Y + Z;
  return sum === 0 ? { x: 0, y: 0 } : { x: X / sum, y: Y / sum };
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function smartHome({ platform, action, deviceId, value, scene, room }, ctx) {
  platform = (platform || 'auto').toLowerCase();

  // Auto-detect platform from env
  if (platform === 'auto') {
    if (process.env.HUE_BRIDGE_IP) platform = 'philips-hue';
    else if (process.env.SMARTTHINGS_TOKEN) platform = 'smartthings';
    else if (process.env.GOOGLE_HOME_CLIENT_ID) platform = 'google-home';
    else if (process.env.ALEXA_CLIENT_ID) platform = 'alexa';
    else if (process.env.TUYA_CLIENT_ID) platform = 'tuya';
    else if (process.env.IFTTT_KEY) platform = 'ifttt';
    else throw new Error('No smart home platform configured. Set HUE_BRIDGE_IP, SMARTTHINGS_TOKEN, GOOGLE_HOME_CLIENT_ID, ALEXA_CLIENT_ID, TUYA_CLIENT_ID, or IFTTT_KEY');
  }

  switch (platform) {
    // ── Philips Hue ───────────────────────────────────────────────────────────
    case 'philips-hue':
    case 'hue': {
      switch (action) {
        case 'get_devices': case 'list_devices':
          return { ok: true, devices: await hueGetAllLights() };
        case 'turn_on':
          return { ok: true, result: await hueSetLight(deviceId, { on: true }) };
        case 'turn_off':
          return { ok: true, result: await hueSetLight(deviceId, { on: false }) };
        case 'toggle': {
          const lights = await hueGetAllLights();
          const light = lights.find(l => l.id === deviceId || l.name?.toLowerCase() === deviceId?.toLowerCase());
          if (!light) throw new Error(`Light not found: ${deviceId}`);
          return { ok: true, result: await hueSetLight(light.id, { on: !light.on }) };
        }
        case 'set_brightness':
          return { ok: true, result: await hueSetLight(deviceId, { brightness: Number(value) }) };
        case 'set_color':
          return { ok: true, result: await hueSetLight(deviceId, { color: value }) };
        case 'get_status': {
          const lights = await hueGetAllLights();
          return { ok: true, lights };
        }
        case 'run_scene': {
          const scenes = await hueApi('/resource/scene');
          const s = (scenes.data || []).find(sc => sc.metadata?.name?.toLowerCase() === scene?.toLowerCase());
          if (!s) throw new Error(`Scene not found: ${scene}`);
          return { ok: true, result: await hueApi(`/resource/scene/${s.id}`, 'PUT', { recall: { action: 'active' } }) };
        }
        default:
          throw new Error(`Unknown Hue action: ${action}`);
      }
    }

    // ── SmartThings ───────────────────────────────────────────────────────────
    case 'smartthings': {
      switch (action) {
        case 'get_devices': case 'list_devices': {
          const data = await stApi('/devices');
          return { ok: true, devices: (data.items || []).map(d => ({ id: d.deviceId, name: d.label, type: d.deviceTypeName })) };
        }
        case 'get_device': {
          const data = await stApi(`/devices/${deviceId}/status`);
          return { ok: true, status: data.components };
        }
        case 'turn_on':
          return { ok: true, result: await stApi(`/devices/${deviceId}/commands`, 'POST', { commands: [{ component: 'main', capability: 'switch', command: 'on' }] }) };
        case 'turn_off':
          return { ok: true, result: await stApi(`/devices/${deviceId}/commands`, 'POST', { commands: [{ component: 'main', capability: 'switch', command: 'off' }] }) };
        case 'set_brightness':
          return { ok: true, result: await stApi(`/devices/${deviceId}/commands`, 'POST', { commands: [{ component: 'main', capability: 'switchLevel', command: 'setLevel', arguments: [Number(value)] }] }) };
        case 'lock':
          return { ok: true, result: await stApi(`/devices/${deviceId}/commands`, 'POST', { commands: [{ component: 'main', capability: 'lock', command: 'lock' }] }) };
        case 'unlock':
          return { ok: true, result: await stApi(`/devices/${deviceId}/commands`, 'POST', { commands: [{ component: 'main', capability: 'lock', command: 'unlock' }] }) };
        case 'run_scene':
          return { ok: true, result: await stApi(`/scenes/${scene}/execute`, 'POST') };
        default:
          throw new Error(`Unknown SmartThings action: ${action}`);
      }
    }

    // ── Google Home (Nest) ────────────────────────────────────────────────────
    case 'google-home':
    case 'google': {
      switch (action) {
        case 'get_devices': {
          const data = await googleHomeApi('/devices');
          return { ok: true, devices: (data.devices || []).map(d => ({ id: d.name, type: d.type, traits: Object.keys(d.traits || {}) })) };
        }
        case 'get_device': {
          const data = await googleHomeApi(`/devices/${deviceId}`);
          return { ok: true, device: data };
        }
        case 'set_temperature': {
          const thermostatId = deviceId;
          return { ok: true, result: await googleHomeApi(`/devices/${thermostatId}:executeCommand`, 'POST', {
            command: 'sdm.devices.commands.ThermostatTemperatureSetpoint.SetHeat',
            params: { heatCelsius: Number(value) },
          }) };
        }
        case 'get_status': {
          const data = await googleHomeApi('/devices');
          return { ok: true, devices: data.devices || [] };
        }
        default:
          throw new Error(`Google Home action '${action}' not yet implemented. Supported: get_devices, get_device, set_temperature, get_status`);
      }
    }

    // ── Amazon Alexa ──────────────────────────────────────────────────────────
    case 'alexa': {
      switch (action) {
        case 'get_devices': {
          const data = await alexaApi('/v2/endpoints');
          return { ok: true, devices: (data.endpoints || []).map(e => ({ id: e.endpointId, name: e.friendlyName, category: e.displayCategories?.[0] })) };
        }
        case 'turn_on': case 'turn_off': {
          const power = action === 'turn_on' ? 'On' : 'Off';
          return { ok: true, result: await alexaApi(`/v3/endpoints/${deviceId}/capabilities/Alexa.PowerController/directives`, 'POST', {
            directive: { header: { name: 'TurnOn' }, endpoint: { endpointId: deviceId } },
          }) };
        }
        case 'set_brightness':
          return { ok: true, result: await alexaApi(`/v3/endpoints/${deviceId}/capabilities/Alexa.BrightnessController/directives`, 'POST', {
            directive: { header: { name: 'SetBrightness' }, payload: { brightness: Number(value) }, endpoint: { endpointId: deviceId } },
          }) };
        default:
          throw new Error(`Alexa action '${action}' not yet implemented. Supported: get_devices, turn_on, turn_off, set_brightness`);
      }
    }

    // ── IFTTT ─────────────────────────────────────────────────────────────────
    case 'ifttt': {
      switch (action) {
        case 'trigger_webhook':
        case 'run_routine':
        case 'run_scene': {
          const event = scene || deviceId || action;
          const result = await iftttTrigger(event, String(value || ''), '', '');
          return { ok: true, result, event };
        }
        default:
          return { ok: true, result: await iftttTrigger(action, String(deviceId || ''), String(value || ''), '') };
      }
    }

    // ── Tuya ──────────────────────────────────────────────────────────────────
    case 'tuya': {
      switch (action) {
        case 'turn_on':
          return { ok: true, result: await tuyaCommand(deviceId, [{ code: 'switch_led', value: true }]) };
        case 'turn_off':
          return { ok: true, result: await tuyaCommand(deviceId, [{ code: 'switch_led', value: false }]) };
        case 'set_brightness':
          return { ok: true, result: await tuyaCommand(deviceId, [{ code: 'bright_value_v2', value: Math.round(Number(value) * 10) }]) };
        case 'set_color':
          return { ok: true, result: await tuyaCommand(deviceId, [{ code: 'colour_data_v2', value: { h: 0, s: 1000, v: 1000 } }]) };
        default:
          return { ok: true, result: await tuyaCommand(deviceId, [{ code: action, value: value }]) };
      }
    }

    default:
      throw new Error(`Unknown smart home platform: ${platform}. Supported: philips-hue, smartthings, google-home, alexa, ifttt, tuya`);
  }
}
