# Hermes on sufe

This cc-connect deployment routes Feishu messages through:

`cc-connect -> codex agent -> bin/hermes-codex -> Claude Code or Codex`

Default provider is stored in `hermes_state/provider.txt`.

Useful Feishu commands:

- `/hermes status`
- `/hermes provider claude`
- `/hermes provider codex`
- `/hermes memory`
- `/hermes memory add <text>`
- `/hermes skill list`
- `/hermes reset`
- `/claude <message>`
- `/claude-new <message>`
- `/codex <message>`
- `/codex-new <message>`

Do not store secrets in `hermes_state/memory.md`.
