# sufe cc-connect

Path: `/mdr5/home/zhouyan/share/quantaalpha/ymj/cc-connect-server`

## Files

- `config.toml`: cc-connect config; Feishu secrets are read from `.env`.
- `.env`: private credentials; keep mode `600`.
- `manage.sh`: start/stop/status/log helpers.
- `watchdog.sh`: restart cc-connect if it exits.

## Bootstrap

Create `.env`:

```bash
cp env.example .env
chmod 600 .env
```

For the first run only, set:

```bash
FEISHU_ALLOW_FROM=*
FEISHU_ADMIN_FROM=*
```

Start cc-connect, send `/whoami` to the bot, then replace both values with your
Feishu open_id and restart.

## Commands

```bash
./manage.sh status
./manage.sh start
./manage.sh logs
./manage.sh restart
```
