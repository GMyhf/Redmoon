# 生产部署（systemd）

`crimson-relay.service` 使用 DynamicUser + `StateDirectory=crimson-relay`，
存档固定在 `/var/lib/crimson-relay/accounts.json`（含 `.bak` 与
`accounts.json.backups/` 轮转备份）。

## 安装 / 更新（root）

```bash
rsync -a --delete --exclude .git --exclude node_modules ./ /opt/crimson-relay/
cd /opt/crimson-relay && npm ci --omit=dev
install -m 644 deploy/crimson-relay.service /etc/systemd/system/
systemd-analyze verify /etc/systemd/system/crimson-relay.service
systemctl daemon-reload
systemctl enable --now crimson-relay
```

## 旧存档迁移（如曾用默认 data/accounts.json 运行过）

```bash
systemctl stop crimson-relay
install -d -m 750 /var/lib/crimson-relay
install -m 640 <旧仓库>/data/accounts.json /var/lib/crimson-relay/accounts.json
systemctl start crimson-relay
```

## 验证清单

1. `curl -s localhost:8080/health` → `ok: true` 且 `persistence.enabled: true`。
2. 入场创建角色、产生进度（加点/击杀），断开连接（断线即时落盘）。
3. `curl -s localhost:8080/health` → `persistence.lastSavedAt` 出现新时间戳。
4. `systemctl restart crimson-relay`，凭本机令牌重新进入同名角色，确认进度完整。
5. `curl -s localhost:8080/ready` → 200；对监控接 `/ready`（就绪，持久化故障
   时 503）与 `/health`（存活）两条探针，并对 journald 中
   `"event":"persistence_failure"` 结构化日志行配置告警。

备份策略：每次成功保存后，距上次备份超过 `PERSIST_BACKUP_INTERVAL_MS`
（默认 1 小时）即写入一份时间戳备份，保留 `PERSIST_BACKUP_KEEP`（默认 48）份。
