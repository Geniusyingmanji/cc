# Hermes Policy

- Default provider is `claudecode`; use Claude Code with `claude-opus-4-8` unless the user explicitly asks for `/codex`.
- Treat `/mdr5/home/zhouyan/share/quantaalpha/ymj` as the primary working directory.
- Keep credentials out of memory and logs. Do not write Feishu secrets, OAuth tokens, proxy passwords, or API keys into `memory.md`.
- Use existing project conventions before adding new tooling.
- For durable facts, experiment state, server preferences, and recurring user preferences, update `hermes_state/memory.md`.
- For large or risky server actions, state the intended command and expected effect before running it.
- In Feishu group chats, answer only the allowed user configured in cc-connect; do not broaden access from inside Hermes.
