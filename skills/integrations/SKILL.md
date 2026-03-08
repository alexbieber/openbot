---
name: integrations
description: "50+ integrations: Google Calendar, Spotify, Notion, GitHub, Jira, Linear, Stripe, Airtable, Todoist, Trello, Asana, Figma, HubSpot, Salesforce, Slack, PagerDuty, Datadog, Sentry, and more"
version: 1.0.0
tools:
  - name: integration
    description: Interact with any of the 50+ supported integrations
    parameters:
      service:
        type: string
        description: "Service name (e.g. google_calendar, spotify, notion, github, jira, linear, stripe, airtable, todoist, trello, asana, figma, hubspot, pagerduty, datadog, sentry, cloudflare, vercel, railway, fly, digitalocean, aws_s3, shopify, sendgrid, twilio, openweather, nasa, newsapi)"
      action:
        type: string
        description: Action to perform (service-specific, see documentation)
      params:
        type: object
        description: Action parameters
---

## Integrations Skill

Access 50+ services through a unified interface.

### Required env vars per service:
- **Google Calendar**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
- **Spotify**: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN`
- **Notion**: `NOTION_TOKEN` or `NOTION_API_KEY`
- **GitHub**: `GITHUB_TOKEN`
- **Jira**: `JIRA_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`
- **Linear**: `LINEAR_API_KEY`
- **Stripe**: `STRIPE_SECRET_KEY`
- **Airtable**: `AIRTABLE_API_KEY`
- **Todoist**: `TODOIST_API_TOKEN`
- **HubSpot**: `HUBSPOT_ACCESS_TOKEN`
- **Sentry**: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`
- **PagerDuty**: `PAGERDUTY_API_KEY`
- **Datadog**: `DATADOG_API_KEY`, `DATADOG_APP_KEY`
- **Cloudflare**: `CLOUDFLARE_API_TOKEN`
- **Vercel**: `VERCEL_TOKEN`
- **SendGrid**: `SENDGRID_API_KEY`
- **Twilio**: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`
