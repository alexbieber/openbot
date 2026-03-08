---
name: smart-home
description: Control smart home devices via HomeKit, Google Home, Amazon Alexa, SmartThings, and IFTTT
tools:
  - name: smart_home
    description: Control smart home devices, scenes, routines, and automations
    parameters:
      platform:
        type: string
        enum: [homekit, google-home, alexa, smartthings, ifttt, tuya, philips-hue]
        description: "Smart home platform to use"
      action:
        type: string
        description: "Action: get_devices, get_device, set_state, turn_on, turn_off, toggle, set_brightness, set_color, set_temperature, lock, unlock, run_scene, run_routine, trigger_webhook, list_rooms, get_status"
      deviceId:
        type: string
        description: "Device ID or name (e.g. 'living-room-lights', 'thermostat')"
      value:
        description: "Value to set (brightness 0-100, color hex, temperature in C/F, etc.)"
      scene:
        type: string
        description: "Scene or routine name"
      room:
        type: string
        description: "Room name to filter devices"
---

# Smart Home Skill

Control smart home devices across multiple platforms: HomeKit (Apple), Google Home,
Amazon Alexa, SmartThings, IFTTT, Tuya, and Philips Hue.

## Examples

- "Turn off all lights" → smart_home(platform=homekit, action=turn_off, deviceId=all-lights)
- "Set living room to 50% brightness" → smart_home(platform=google-home, action=set_brightness, deviceId=living-room, value=50)
- "Lock the front door" → smart_home(platform=homekit, action=lock, deviceId=front-door)
- "Run the 'Movie Night' scene" → smart_home(platform=homekit, action=run_scene, scene=Movie Night)
- "What's the temperature at home?" → smart_home(platform=homekit, action=get_device, deviceId=thermostat)
- "Trigger IFTTT webhook 'good_morning'" → smart_home(platform=ifttt, action=trigger_webhook, scene=good_morning)

## Platform Setup

| Platform | Required env vars |
|---|---|
| HomeKit | HAP_HOST, HAP_PORT, HAP_PIN (hap-nodejs bridge) |
| Google Home | GOOGLE_HOME_CLIENT_ID, GOOGLE_HOME_CLIENT_SECRET, GOOGLE_HOME_REFRESH_TOKEN |
| Alexa (Smart Home) | ALEXA_CLIENT_ID, ALEXA_CLIENT_SECRET, ALEXA_REFRESH_TOKEN |
| SmartThings | SMARTTHINGS_TOKEN |
| IFTTT | IFTTT_KEY |
| Tuya | TUYA_CLIENT_ID, TUYA_CLIENT_SECRET, TUYA_USER_ID |
| Philips Hue | HUE_BRIDGE_IP, HUE_API_KEY |
