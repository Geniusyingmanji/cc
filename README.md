# claude_transfer

This directory has been moved out of `IdeaEvolving` and is now intended to be
managed as its own small migration repository:

```bash
git clone https://github.com/Geniusyingmanji/cc.git claude_transfer
```

## Files

Private payloads are intentionally kept out of Git by `.gitignore`:

- `current_private_configs_*/`: private config bundle directory for restoring cc-connect/Claude/Codex configuration.
- `private-configs_*.tar.zst`: private config bundle archive.
- `hermes-migrate-corrected_*.part-*`: Claude skills, Claude project memory, and cc-connect config split into parts.
- `cc-connect-runtime_*.tar.gz`: cc-connect runtime state, including `~/.cc-connect/sessions/`.
- `claude-home-no-projects_*.tar.zst`: current `~/.claude` state excluding `~/.claude/projects`.
- `cc-connect-current_*.tar.zst`: current cc-connect config/runtime snapshot.
- `codex-config-skills-sessions_*.tar.zst`: Codex config, skills, and sessions.

These payloads can contain auth material. Copy them into this directory through
a private channel before restoring.

## Fresh cc-connect restore on a new server

This is the expected path for bringing up cc-connect on a new machine.

```bash
mkdir -p ~/workspace-gzy/zyf
cd ~/workspace-gzy/zyf
git clone https://github.com/Geniusyingmanji/cc.git claude_transfer
cd claude_transfer
```

Copy the private config archive into `claude_transfer/`:

```text
private-configs_20260531_081355.tar.zst
```

Restore the private config bundle:

```bash
tar --zstd -xf private-configs_20260531_081355.tar.zst
cd current_private_configs_20260531_081355
bash restore_private_configs.sh
```

Latest local private snapshot prepared in this workspace:

```text
current_private_configs_20260531_081355/
current_private_configs_20260531_081355/private-configs_20260531_081355.tar.zst
```

Install and start cc-connect:

```bash
cd ~/workspace-gzy/zyf/cc-connect-server
npm install
bash manage.sh status
bash manage.sh start
bash manage.sh logs
```

The cleanest restore is to keep the same path on the new server:

```text
/home/azureuser/workspace-gzy/zyf
```

If the username or workspace path differs, update these files before starting:

- `~/workspace-gzy/zyf/cc-connect-server/config.toml`
- `~/workspace-gzy/zyf/cc-connect-server/manage.sh`
- `~/workspace-gzy/zyf/cc-connect-server/watchdog.sh`

For just restoring cc-connect receive/reply behavior, the private config bundle is enough. For Claude Code `/resume` into old project conversations, restore the larger `~/.claude/projects` session archive separately and preserve old workspace paths or create matching symlinks.

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
