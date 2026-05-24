# cc migration repository

This repository is the public-safe scaffold for migrating local Claude/cc-connect setup.

## What is in Git

- Migration notes and restore instructions.
- Proxy/helper scripts that read credentials from environment variables.
- Package metadata for reinstalling `cc-connect`.
- Sanitized examples for local runtime scripts.

## What is intentionally not in Git

The local folder may contain private payloads such as:

- `claude-home-no-projects_*.tar.zst`
- `cc-connect-current_*.tar.zst`
- `codex-config-skills-sessions_*.tar.zst`
- `hermes-migrate-corrected_*.part-*`
- `cc-connect-runtime_*.tar.gz`
- `watchdog.sh`
- `proxy-18899.js`

Those files can contain API keys, Claude/Codex auth material, cc-connect config, sessions, and private proxy credentials. Transfer them only through a private channel or encrypt them before uploading anywhere.

## Restore outline

Clone this repository first:

```bash
git clone https://github.com/Geniusyingmanji/cc.git claude_transfer
cd claude_transfer
npm install
```

Then copy the private payload files into this directory if needed, and follow `README.md` / `cc_connect_migration.md`.

If you want `/resume` to work for Claude Code sessions, keep the same workspace paths on the new machine or create symlinks matching the old paths before restoring `~/.claude/projects`.
