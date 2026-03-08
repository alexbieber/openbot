# Security

## Reporting a vulnerability

If you believe you have found a security vulnerability, please report it responsibly:

- **Do not** open a public GitHub issue.
- Email the maintainers (see [GitHub repository](https://github.com/openbot/openbot) for contact options) or open a **private security advisory** on GitHub: [OpenBot → Security → Advisories](https://github.com/openbot/openbot/security/advisories).

Include a clear description, steps to reproduce, and impact. We will respond as quickly as we can.

## Self-hosted deployment

OpenBot is designed to run on **your** infrastructure. You are responsible for:

- **Secrets** — Keep `.env` and API keys out of version control (`.env` is in `.gitignore`). Use environment variables or a secrets manager in production.
- **Network** — Do not expose the gateway (default port 18789) to the public internet without protection. Use a reverse proxy (e.g. nginx, Caddy) with TLS and authentication, or restrict access with a firewall.
- **Config** — The `/config` and `/secrets` API endpoints return or modify sensitive data. When the gateway is bound to `0.0.0.0` (e.g. for mobile on the same LAN), ensure untrusted users cannot reach it.

Thank you for helping keep OpenBot and its users safe.
