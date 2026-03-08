export default {
  name: 'home-assistant',
  async run({ action, entityId, service, serviceData = {}, domain, eventType, eventData = {} }) {
    const haUrl = (process.env.HOMEASSISTANT_URL || '').replace(/\/$/, '');
    const token = process.env.HOMEASSISTANT_TOKEN;
    if (!haUrl || !token) return { ok: false, error: 'HOMEASSISTANT_URL and HOMEASSISTANT_TOKEN required' };

    const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const api = (path, opts = {}) => fetch(`${haUrl}/api${path}`, { headers: h, ...opts }).then(async r => {
      if (!r.ok) throw new Error(`HA API ${r.status}: ${await r.text()}`);
      const text = await r.text();
      return text ? JSON.parse(text) : { ok: true };
    });

    switch (action) {
      case 'get_state':
        if (!entityId) return { ok: false, error: 'entityId required' };
        return { ok: true, ...(await api(`/states/${entityId}`)) };

      case 'list_entities': {
        const states = await api('/states');
        const filtered = domain ? states.filter(s => s.entity_id.startsWith(domain + '.')) : states;
        return { ok: true, count: filtered.length, entities: filtered.map(s => ({ entityId: s.entity_id, state: s.state, attributes: s.attributes })) };
      }

      case 'list_areas':
        return { ok: true, areas: await api('/config/area_registry/list') };

      case 'set_state':
        if (!entityId) return { ok: false, error: 'entityId required' };
        return { ok: true, ...(await api(`/states/${entityId}`, { method: 'POST', body: JSON.stringify({ state: serviceData.state || 'on', attributes: serviceData.attributes || {} }) })) };

      case 'toggle': {
        if (!entityId) return { ok: false, error: 'entityId required' };
        const d = entityId.split('.')[0];
        return { ok: true, ...(await api(`/services/${d}/toggle`, { method: 'POST', body: JSON.stringify({ entity_id: entityId }) })) };
      }

      case 'call_service': {
        if (!service) return { ok: false, error: 'service required (e.g. "light.turn_on")' };
        const [svcDomain, svcName] = service.split('.');
        const body = { ...serviceData };
        if (entityId) body.entity_id = entityId;
        return { ok: true, result: await api(`/services/${svcDomain}/${svcName}`, { method: 'POST', body: JSON.stringify(body) }) };
      }

      case 'run_script':
        if (!entityId) return { ok: false, error: 'entityId required (e.g. script.my_script)' };
        return { ok: true, result: await api(`/services/script/${entityId.replace('script.', '')}`, { method: 'POST', body: '{}' }) };

      case 'run_automation':
        if (!entityId) return { ok: false, error: 'entityId required (e.g. automation.morning_routine)' };
        return { ok: true, result: await api('/services/automation/trigger', { method: 'POST', body: JSON.stringify({ entity_id: entityId }) }) };

      case 'fire_event':
        if (!eventType) return { ok: false, error: 'eventType required' };
        return { ok: true, result: await api(`/events/${eventType}`, { method: 'POST', body: JSON.stringify(eventData) }) };

      case 'get_history': {
        if (!entityId) return { ok: false, error: 'entityId required' };
        const since = new Date(Date.now() - 86400000).toISOString();
        const history = await api(`/history/period/${since}?filter_entity_id=${entityId}`);
        return { ok: true, history: history[0] || [] };
      }

      default:
        return { ok: false, error: `Unknown action: ${action}` };
    }
  },
};
