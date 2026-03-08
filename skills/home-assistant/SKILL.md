---
name: home-assistant
description: "Smart home control via Home Assistant REST API: lights, switches, climate, sensors, automations, scripts"
version: 1.0.0
tools:
  - name: ha
    description: Control Home Assistant devices and automations
    parameters:
      action:
        type: string
        enum: [get_state, set_state, toggle, call_service, list_entities, list_areas, fire_event, get_history, run_script, run_automation]
        description: Action to perform
      entityId:
        type: string
        description: "Entity ID (e.g. 'light.living_room', 'switch.fan', 'climate.bedroom')"
      service:
        type: string
        description: "HA service (e.g. 'light.turn_on', 'climate.set_temperature')"
      serviceData:
        type: object
        description: "Service call data (e.g. { brightness: 128, color_temp: 4000 })"
      domain:
        type: string
        description: "Entity domain filter (e.g. 'light', 'switch', 'sensor', 'climate')"
      eventType:
        type: string
        description: Event type to fire
      eventData:
        type: object
---

## Home Assistant Skill

Requires:
- `HOMEASSISTANT_URL` — e.g. `http://homeassistant.local:8123`
- `HOMEASSISTANT_TOKEN` — Long-lived access token from HA Profile

### Example actions
- `get_state` + `entityId: "light.living_room"` → current state and attributes
- `call_service` + `service: "light.turn_on"` + `serviceData: { entity_id: "light.all", brightness: 200 }`
- `list_entities` + `domain: "climate"` → all thermostats
- `run_automation` + `entityId: "automation.morning_routine"`
