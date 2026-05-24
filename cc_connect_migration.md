# cc-connect 迁移说明

这份说明用于保存 cc-connect 运行方式、二进制位置和迁移时应保留的最小上下文。

## 当前位置

- 当前工作区目录：`/home/azureuser/workspace-gzy/zyf/cc-connect-server/`
- 当前转存目录：`/home/azureuser/workspace-gzy/zyf/claude_transfer/`
- 旧工作区目录：`/nfsdata-117/quantaalpha/zyf/cc-connect-server/`

## 二进制与依赖

`cc-connect-server/package.json:1` 显示当前通过 npm 依赖管理：

```json
{
  "dependencies": {
    "cc-connect": "^1.3.2"
  }
}
```

当前可执行入口来自：
- `node_modules/.bin/cc-connect`
- 实际二进制文件：`node_modules/cc-connect/bin/cc-connect`

这表示现在的运行方式依赖项目内安装的 npm 包，而不是系统级单独安装。

## 启动方式

`cc-connect-server/manage.sh:1` 里的核心逻辑：
- `DIR=/home/azureuser/workspace-gzy/zyf/cc-connect-server`（旧快照里可能仍是 `/nfsdata-117/quantaalpha/zyf/cc-connect-server`）
- `CC=$DIR/node_modules/.bin/cc-connect`
- 启动命令：`nohup $CC --config config.toml >> /tmp/cc-connect.log 2>&1 &`

因此迁移时至少要保留：
- `package.json`
- `package-lock.json`
- `config.toml`（如果需要运行）
- `manage.sh`
- `watchdog.sh`
- `node_modules/cc-connect/bin/cc-connect` 对应版本信息，或者用 `npm install` 重新安装得到同版本二进制

## 自动恢复机制

`cc-connect-server/watchdog.sh:89` 之后包含健康检查与重启逻辑：
- 通过 `pgrep -f 'cc-connect --config'` 检查进程
- 异常时执行 `nohup node node_modules/.bin/cc-connect --config config.toml > /tmp/cc-connect.log 2>&1 </dev/null &`

这说明迁移后如果还需要“掉了自动拉起”的能力，除了主程序外，还要同时迁移 watchdog 机制。

## 已转存的运行包

当前 `claude_transfer/` 中已经存在：
- `cc-connect-runtime_20260511_120703.tar.gz`

这可以作为一次运行时快照，但它不能替代文字说明，因为后续仍需要知道：
- 二进制来自哪个 npm 包版本
- 实际启动入口在哪里
- watchdog 如何重启

## 安全说明

原始脚本中包含代理、认证、令牌等敏感配置。迁移到 GitHub 时不应直接提交明文凭据。

建议做法：
- 仅提交结构说明、脚本框架和去敏配置示例
- 将真实密钥、认证信息、代理口令保存在本地或 secret manager
- 若未来需要恢复运行，优先根据本说明重建环境，再手工补充敏感配置
