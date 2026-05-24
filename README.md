# claude_transfer

This directory has been moved out of `IdeaEvolving` and is now intended to be
managed as its own small migration repository:

```bash
git clone https://github.com/Geniusyingmanji/cc.git claude_transfer
```

## Files

Private payloads are intentionally kept out of Git by `.gitignore`:

- `hermes-migrate-corrected_*.part-*`: Claude skills, Claude project memory, and cc-connect config split into parts.
- `cc-connect-runtime_*.tar.gz`: cc-connect runtime state, including `~/.cc-connect/sessions/`.
- `claude-home-no-projects_*.tar.zst`: current `~/.claude` state excluding `~/.claude/projects`.
- `cc-connect-current_*.tar.zst`: current cc-connect config/runtime snapshot.
- `codex-config-skills-sessions_*.tar.zst`: Codex config, skills, and sessions.

These payloads can contain auth material. Copy them into this directory through
a private channel before restoring.

## Restore on new machine using the older split payload

```bash
cd /path/to/claude_transfer
cat hermes-migrate-corrected_*.part-* > /tmp/hermes-migrate-corrected.tar.gz
mkdir -p "$HOME"
tar xzf /tmp/hermes-migrate-corrected.tar.gz -C /
tar xzf cc-connect-runtime_*.tar.gz -C /
```

## Restore current snapshots if present

```bash
cd /path/to/claude_transfer
tar --zstd -xf claude-home-no-projects_*.tar.zst -C /
tar --zstd -xf cc-connect-current_*.tar.zst -C /
tar --zstd -xf codex-config-skills-sessions_*.tar.zst -C /
```

## Check restored files

```bash
ls ~/.claude/skills | head
ls ~/.claude/projects | head
ls ~/.cc-connect/sessions
ls /nfsdata-117/quantaalpha/zyf/cc-connect-server
```

## Reinstall or verify cc-connect runtime

```bash
cd ~/workspace-gzy/zyf/cc-connect-server
npm install
bash manage.sh status
bash manage.sh start
bash manage.sh logs
```

## Update paths if needed

If the new machine uses a different repo path, update:

- `cc-connect-server/config.toml`
- `cc-connect-server/.config.toml.golden`
- `cc-connect-server/manage.sh`

before starting cc-connect.

For Claude Code `/resume`, the most reliable path is to preserve the old
workspace paths or create symlinks that match them before restoring
`~/.claude/projects`.
