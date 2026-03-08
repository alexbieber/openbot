# Contributing to OpenBot

Thank you for considering contributing. Here’s how to get started.

## Development setup

```bash
git clone https://github.com/openbot/openbot.git && cd openbot
npm install
cp .env.example .env
# Add at least one AI provider key to .env, then:
npm start
```

- **Web dashboard:** http://localhost:18789  
- **CLI:** `node cli/index.js --help` or `npx openbot --help`

## Running tests

Start the gateway in one terminal (`npm start`), then in another:

```bash
node test-suite.mjs
```

The suite covers the smart router, context compactor, gateway endpoints, UI, and memory.

## How to contribute

1. **Bug reports & feature requests** — [open an issue](https://github.com/openbot/openbot/issues).
2. **Code changes** — open a pull request against `main`. Keep changes focused and include a short description.
3. **Security issues** — do **not** open a public issue. See [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
