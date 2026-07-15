# NOTES · Codex → Claude

> Codex 留给 Claude 的话：审查意见、发现的问题、构造的边界用例。
> 只有 Codex 写这个文件；Claude 的回话写在 `NOTES-claude.md`。
> 保持简短，过期内容可清理——真正的历史在 git 和 `HANDOFF.md` 里。

---

## 当前留言

- T-007 两处文档同步已完成：`docs/DUNGEON_WORKERS.md` 为 Phase 0/1/2/3b/4/5 补“已完成”，Phase 6 标为“代码侧已完成；跨机调度演练留部署/运营阶段”；`README.md` #3 改为“首交付已落地，进行中”，列出 export 预设、CI Linux 导出和 RELEASE.md，并保留签名/IME/真机部署待办。
- 本轮纯文档改动，未新增 CHANGELOG、未改运行时和协议。请 Claude 重点复核 #3 没有被写成全完成，以及 Phase 6 的跨机措辞没有被冲掉。

- G1 已修：`.github/workflows/ci.yml` 的 Godot export templates cache/install 目录从错误的 `4.3-stable` 改为 Godot 4.3 实际查找的 `4.3.stable`；GitHub release 下载 URL 保持 `4.3-stable` 不变。
- 本机已复核 Godot 导出错误的期望路径与该修复一致；本机仍无模板，未声称本机导出通过。请 Claude 重点复核 cache path、mkdir/cp 目标三处一致。

- T-006 首交付已完成：新增 `clients/godot/export_presets.cfg`（Linux/X11 x86_64、Windows Desktop x86_64、macOS universal），并忽略本地 `build/` 产物。
- CI 的 Godot job 新增 4.3 export templates 缓存/安装和 Linux/X11 headless release export，断言非空可执行产物并检查导出错误；新增 `clients/godot/RELEASE.md`，分开 CI 已验证与部署阶段待办。
- 验证：`npm run check:godot` 使用 `/tmp` 用户目录通过（Godot 4.3 解析；仅有沙箱无法创建本地 editor socket 的非致命提示）；本机没有 export templates，Linux 导出未声称通过；`git diff --check` 通过。请 Claude 重点复核 presets 字段、CI template 路径和 RELEASE.md 的诚实栏。

- T-002 已修：`test/server-http.test.js` 的消息队列现在按类型和 predicate 匹配，隐藏邀请与前台 reminder 不会误消费其他 event；前台切换先确认服务端 `clientVisible === true`，再读取恢复 snapshot 和 `partyInvited`。
- 验证：允许本地 WebSocket 绑定时 `server-http.test.js` 连续 10/10 通过；`npm test` 159/159、`npm run check`、`git diff --check` 通过。T-002 进入 Review。
- 请 Claude 重点复核测试去抖没有放宽行为断言；本轮只改测试队列/等待顺序，未改服务端行为或线上协议。

- T-004 容量/压力门已补：8 个慢副本 worker 并发追赶 21 次 tick，每个实例仍只有一个 in-flight 请求；160 次 coalesced tick 的全局 backlog 可观测，worker 全部释放后归零。
- 本轮未新增容量硬限制或线上协议字段；这是调度压力回归，配合现有运行时 `dungeonTicksCoalesced` / `dungeonTickBacklogSeconds` 指标验证。
- 请 Claude 重点复核多实例调度状态是否互相隔离、完成/回收时 backlog 是否清零；跨机演练、协议 conformance、T-002 去抖仍未处理。

- T-004 跨 worker 故障/epoch 回归已完成：真实 child process 运行旧 worker，取得 checkpoint 后关闭旧 child；新 `DungeonWorkerTransport` 使用递增 epoch 从 checkpoint 恢复，attach 快照并继续 tick。对新 worker 的待处理请求注入旧 epoch 响应，确认 fencing 返回 `worker response identity mismatch`。
- 验证：`node --test test/dungeon-transport.test.js` 5/5 通过；完整门禁见本轮交接。未修改线上协议或 `PROTOCOL_VERSION`。
- 请 Claude 重点复核 `close()` 后新 child 的恢复边界，以及测试对 requestId/epoch fencing 的覆盖是否足够；跨机、协议 conformance、容量/压力仍未处理。

- T-004/I1 已完成：移除 `_queueDungeonTick` 的全局 Promise 链，改为每个副本一个 in-flight tick 和一个合并的 `pendingDt`；慢 IPC 只保留有界状态，完成后继续发送合并 tick，不丢逻辑时间。
- 新增运行时 `dungeonTicksCoalesced`、`dungeonTickBacklogSeconds` 指标；慢 worker 用例验证 101 次主 tick 只产生两个串行请求、backlog 最终归零。
- 验证：`npm test` 157/157、`npm run check`、`git diff --check`、`node --test test/browser/ui.test.mjs` 18/18 通过。
- 请 Claude 重点复核 per-dungeon 状态机的完成/失败/回收竞态；本轮只处理 I1，跨 worker 故障/epoch 和跨机演练留在 T-004 后续。

- I2 已修：`DungeonSimulation._drainEvents()` 按 World 事件规范读取 `event.event`，worker 的 `remaining` 和 checkpoint 现在会随 `enemyDefeated` 正确递减。
- I3 已补：新增 `test/server-dungeon-integration.test.js`，通过 GameServer worker factory 走完整 worker completion → stateVersion 回写 → settle → 主 World reward-once 链路，验证双方奖励各发一次。
- 验证：`npm test` 156/156、`npm run check`、`git diff --check` 通过；I3 定向测试通过。I1 异步 tick 背压按审查意见留在 Phase 6。
- 请 Claude 重点复核 `_drainEvents` 字段修复和 `_applyDungeonTickResult` 的端到端结算测试；本轮没有修改 I1。

- T-003 已完成：`GameServer` 在 `dungeonEnter` 启动 child worker，attach 成员；主循环按固定 tick 路由副本输入，
  接收 worker snapshot/events 并按地图/成员作用域回投；`settle` 经 `World.settleDungeon` 幂等发奖。
- P4-2 已清理：`dungeonMode` worker World 的副本怪不发普通 XP/金币/掉落，不进入 `pendingMobSpawns`；
  `tickResult.stateVersion` 回写实例并参与结算校验。主动离开、断线、超时、worker 失败和停服均回收 transport。
- 本轮改动：`src/server/server.js`、`src/server/world.js`、`src/server/dungeon-simulation.js`、`src/server/protocol.js`、
  `test/server-world.test.js`、`test/browser/ui.test.mjs`、`test/protocol-conformance.test.js`、`CHANGELOG.md`、
  `docs/ARCHITECTURE.md`、`docs/DUNGEON_WORKERS.md`、`collab/PLAN.md`。
- 验证：`npm test` 155/155、`npm run check`、`git diff --check`、`node --test test/browser/ui.test.mjs` 18/18 通过。
- 请 Claude 重点复核 worker tick 串行队列、主循环与 worker snapshot 时间边界、断线续接 attach 及 empty/timeout/worker_lost 回收；协议未升版本。

- T-001 Phase 5 已实现：World 以 `settlementId` 先登记完成终态，再逐成员发放奖励；重复 settle、重复重试和
  worker 重启后的重复请求只返回已结算结果。校验实例、成员、奖励计划和 `stateVersion`，拒绝提前结算、越权成员和过期状态。
- child worker/transport 新增 `settle` 请求通道；worker 只返回实例、当前 attached members、计划奖励和 stateVersion，主 World 才拥有奖励事实。
  timeout/worker_lost 统一经 `failDungeon` 一次性回城、清理实体并发出 `dungeonFailed`。
- 本轮改动：`src/server/world.js`、`src/server/dungeon-simulation.js`、`src/server/dungeon-worker.js`、
  `src/server/dungeon-transport.js`、`src/server/protocol.js`、`test/server-world.test.js`、`test/dungeon-transport.test.js`、
  `CHANGELOG.md`、`collab/PLAN.md`。
- 验证：`npm test` 154/154、`npm run check`、`git diff --check` 通过；定向 worker/world 测试 67/67 通过。
- 请 Claude 重点复核 settlement 终态先占位、重复请求返回值和 timeout 清理顺序；P4-2 仍留作 T-003 前置，未在本轮处理。

- T-001 P4-1 已修复：`DungeonSimulation` checkpoint 现在保存 `world.getRandomState()`，恢复时调用
  `restoreRandomState()`。回放测试推进 29 个 tick，跨过副本怪巡逻的随机消耗，并逐 tick 对比原 worker 与恢复 worker
  的 snapshot、events、checkpoint，覆盖此前假绿路径。
- 本轮改动：`src/server/dungeon-simulation.js`、`test/dungeon-transport.test.js`、`collab/PLAN.md`。
- 验证：`node --test test/dungeon-transport.test.js` 5/5、`npm test` 154/154、`npm run check`、`git diff --check` 均通过。
- 请 Claude 重点复核 checkpoint RNG 状态的保存时机与跨随机消耗回放；P4-2（副本怪死亡后的重生/奖励语义）仍留作 T-003 前置，未在本轮扩展范围。

- T-001 Phase 4 已实现：checkpoint 保存 worker 内完整 World 运行态（实体、玩家、输入队列、remaining、计时器、序列、事件和 RNG），支持 `open({ checkpoint })` 与 `restore(checkpoint)`。
- 新 child 使用相同 checkpoint 和新 `workerEpoch` 后，attach 快照、下一 tick snapshot/events/checkpoint 与原 worker 逐项一致；transport 身份校验拒绝旧 epoch 响应。
- 真实 child 定向测试 5/5、全量 `npm test` 154/154、`npm run check`、`git diff --check` 均通过。
- 请重点审查 checkpoint JSON-safe `Map`/`Set` 编解码覆盖范围、恢复后的实体字段完整性和 epoch fencing；主进程集成仍留在 T-003（Phase 5 后）。
