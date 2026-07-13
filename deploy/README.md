# 生产部署（systemd）

`crimson-relay.service` 使用 DynamicUser + `StateDirectory=crimson-relay`
（`StateDirectoryMode=0700`、`UMask=0077`）。默认存档固定在 `/var/lib/crimson-relay/accounts.json`
（含 `.bak`、`accounts.json.backups/` 轮转备份与 `accounts.json.audit.jsonl` 审计）。存档只含令牌摘要，
服务器加载旧档和每次落盘都会把存档文件收紧为 0600；自建父目录为 0700，样例服务通过
`PERSIST_MANAGE_DIRECTORY=1` 管理专用的 StateDirectory。结构错误的单条账号会保留到
owner-only 的 `accounts.json.invalid-records.json`，供人工恢复。

显式 `PERSIST_PATH` 指向一个已经存在的自定义父目录时，服务默认不修改父目录权限，以免破坏
共享目录；新建的父目录仍为 0700。只有确认父目录专供本服务使用时，才设置
`PERSIST_MANAGE_DIRECTORY=1`，让启动和保存都强制该目录为 0700。

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
install -d -m 700 /var/lib/crimson-relay
install -m 600 <旧仓库>/data/accounts.json /var/lib/crimson-relay/accounts.json
systemctl start crimson-relay
```

## PostgreSQL（长期公开部署）

服务启动时若存在 `DATABASE_URL`，会优先使用 PostgreSQL，不读取或写入 `PERSIST_PATH`。
Node 在绑定 HTTP 端口前完成持久化 preflight；JSON 必须成功写入并同步当前快照，PostgreSQL
必须成功完成空闲 `SELECT 1`。失败时进程不会先接收玩家流量。
首次连接先单独创建并检查版本表，数据库 migration 高于当前版本时不会改动账号或审计表；
随后才创建/升级业务表。审计使用稳定 `event_id` 唯一键，事务结果不明确后的同事件重试不会
重复追加。凭据变更与对应审计在一个事务中提交，提交失败时网关不会回传新 secret。连接池
默认 7 秒 PostgreSQL statement timeout、8 秒客户端 query timeout 和 5 秒连接超时；样例 systemd
使用 45 秒停止窗口，为账号与审计两条业务 SQL、提交或回滚以及连接池关闭留出余量。

先创建权限最小化的独立数据库账号，再通过编辑器把连接串写入只有 root 可读的环境文件。
不要把密码放进命令参数、shell 历史或仓库；密码中的保留字符须 URL 编码，远程数据库应按
实际 CA 配置 TLS：

```bash
install -o root -g root -m 600 /dev/null /etc/crimson-relay.env
sudoedit /etc/crimson-relay.env
# 在编辑器中写入一行：
# DATABASE_URL=postgresql://crimson:<URL_ENCODED_PASSWORD>@127.0.0.1:5432/crimson
chmod 600 /etc/crimson-relay.env
```

已有 JSON 存档先停服、备份两端，再导入。目标数据库非空时命令默认拒绝；只有人工核对后
才使用 `--merge`。该选项 upsert JSON 中的账号：同名账号会被 JSON 覆盖，目标数据库独有的
账号会保留，它不是清空后替换：

```bash
systemctl stop crimson-relay
cp -a /var/lib/crimson-relay/accounts.json /var/lib/crimson-relay/accounts.pre-pg.json
cd /opt/crimson-relay
set -a; . /etc/crimson-relay.env; set +a
PERSIST_PATH=/var/lib/crimson-relay/accounts.json npm run migrate:postgres
# 目标非空且确认需要合并时：
PERSIST_PATH=/var/lib/crimson-relay/accounts.json npm run migrate:postgres -- --merge
systemctl start crimson-relay
```

导入完成后检查 `persistence.backend: "postgresql"`，重启并用原令牌登录。保留 JSON 冷备直到
数据库备份/恢复演练完成；不要同时让两个服务实例写同一批在线账号。

## 验证清单

1. `curl -s localhost:8080/health` → `ok: true`、`persistence.enabled: true`，并确认
   `persistence.backend` 是预期的 `json` 或 `postgresql`。`auditPending` 在批量刷新间可短暂非零，
   单独不代表未就绪；持续增长、`crimson_audit_dropped_total` 增加或实际持久化错误必须告警。
2. 入场创建角色、产生进度（加点/击杀），断开连接（断线即时落盘）。
3. `curl -s localhost:8080/health` → `persistence.lastSavedAt` 出现新时间戳。
4. `systemctl restart crimson-relay`，凭本机令牌重新进入同名角色，确认进度完整。
5. `curl -s localhost:8080/ready` → 200 且全部 `checks.*.ok` 为 true；对监控接
   `/ready`（持久化、tick、事件循环、快照或连接积压异常时 503）与 `/health`（存活）
   两条探针，并对 journald 中
   `"event":"persistence_failure"` / `"event":"audit_persistence_failure"` 结构化日志行配置告警。
6. `curl -s localhost:8080/metrics` 可见 `crimson_ready`、tick age、lag、快照耗时和
   WebSocket backlog/跳帧/断开计数；采集器直连 loopback，不把该端点发布到公网。

备份策略：每次成功保存后，距上次备份超过 `PERSIST_BACKUP_INTERVAL_MS`
（默认 1 小时）即写入一份时间戳备份，保留 `PERSIST_BACKUP_KEEP`（默认 48）份。
JSON 审计是 at-least-once：append 已成功但 chmod/fsync 结果不明时，重试可能留下相同 UUID 的
物理重复行，离线消费者应按 `id` 去重；长期部署的 PostgreSQL 以 `event_id` 唯一键直接去重。

## HTTPS / WSS 反向代理

仓库提供 [Caddyfile.example](Caddyfile.example) 与 [nginx.conf.example](nginx.conf.example)。
替换 `play.example.com` 和证书路径后，只把 Node 绑定在 `127.0.0.1:8080`。同时在
`/etc/crimson-relay.env` 设置应用层 Origin 复核：

```bash
ALLOWED_ORIGINS=https://play.example.com
```

Caddy 样例作为站点 Caddyfile 使用；nginx 样例应安装为
`/etc/nginx/conf.d/crimson-relay.conf`（不是覆盖主 `nginx.conf`）。

两份样例都处理 WSS Upgrade/Connection、严格浏览器 Origin、45 秒 WebSocket 读超时
（长于默认 15 秒 ping）、写/握手超时和安全响应头。nginx 原生限制每 IP 的握手速率与连接数；
stock Caddy 以 `max_conns_per_host` 限制上游总连接，升级后的消息继续由应用令牌桶限制。
公网遭受恶意握手时，应给 Caddy 加维护中的 rate-limit 模块或在 CDN/防火墙按 IP 限流。

配置加载前验证：

```bash
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
nginx -t
```

上线后验证 HTTPS、安全头、允许/拒绝的 Origin 和内部指标：

```bash
curl --fail --silent https://play.example.com/ready
curl -I https://play.example.com/
curl --http1.1 -i -N \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: MDEyMzQ1Njc4OWFiY2RlZg==' \
  -H 'Origin: https://play.example.com' https://play.example.com/ws
curl --http1.1 -o /dev/null -sS -w '%{http_code}\n' \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: MDEyMzQ1Njc4OWFiY2RlZg==' \
  -H 'Origin: https://evil.example' https://play.example.com/ws
curl --fail --silent localhost:8080/metrics
```

前一个握手应为 `101 Switching Protocols`，恶意 Origin 应为 403，公网 `/metrics` 应为 404。

## 运行时阈值

默认值适合当前 20 Hz tick / 10 Hz 快照：

| 环境变量 | 默认值 | 行为 |
| --- | ---: | --- |
| `WS_HEARTBEAT_INTERVAL_MS` | 15000 | ping 周期；一轮未 pong 即终止 |
| `WS_BACKPRESSURE_SKIP_BYTES` | 262144 | 达到后跳过快照/名册帧 |
| `WS_BACKPRESSURE_DISCONNECT_BYTES` | 2097152 | 达到后立即终止慢连接 |
| `WS_BACKPRESSURE_MAX_SKIPS` | 50 | 连续跳帧达到后终止 |
| `WS_RECONNECT_GRACE_MS` | 15000 | 非主动断线保留原队伍/副本席位；`0` 禁用 |
| `READY_TICK_STALE_MS` | 1000 | 最近成功 tick 的最大年龄 |
| `READY_MAX_CONSECUTIVE_TICK_ERRORS` | 3 | 达到后 readiness 失败 |
| `READY_EVENT_LOOP_LAG_P99_MS` | 250 | 最近窗口 lag p99 上限 |
| `READY_SNAPSHOT_P99_MS` | 250 | 最近窗口广播耗时 p99 上限 |
| `READY_WS_BACKLOG_BYTES` | 262144 | 单连接当前积压上限 |
| `PERSIST_MANAGE_DIRECTORY` | 按路径来源决定 | `1` 时把已有存档父目录作为专用目录管理并固定为 0700 |

修改阈值后先运行包含 `--min-active-ratio 1 --require-ready` 的 `npm run stress -- ...`，确认
容量门没有被阈值本身误触发。PR 会跑 10 bot/8 秒短门槛，nightly 再跑 30 bot/30 秒容量门。
