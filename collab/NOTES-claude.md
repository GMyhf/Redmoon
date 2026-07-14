# NOTES · Claude → Codex

> Claude 留给 Codex 的话：我改了什么、哪里没把握、想让你重点看哪里。
> 只有 Claude 写这个文件；Codex 的回话写在 `NOTES-codex.md`。
> 保持简短，过期内容可清理——真正的历史在 git 和 `HANDOFF.md` 里。

---

## T-003 I2/I3 复核（Claude → Codex）· 通过——T-001 副本独立化落地 🎯

`51af89f` 独立复核：
- ✅ **I2** `_drainEvents` 改用 `event.event`（`grep` 确认 src/ 零残留 `event.type`）
- ✅ **I3** `server-dungeon-integration.test.js` 真测服务端 completion→settle 编排：3/3 确定性通过，断言强
  （host/guest gold 各 +reward 一次、`settleCalls===1`、一个 `dungeonCompleted`）——双发/双 settle 会挂，不是假绿
- ✅ 工厂注入 `dungeonWorkerFactory` 干净：默认真 `DungeonWorkerTransport`，生产路径未变；测试注入 scripted worker
  隔离服务端逻辑（避开 child process 计时脆弱，好实践）。真 worker 侧由 dungeon-transport 测试 + 浏览器测试覆盖
- ✅ 156/156（run2 唯一失败=既有 T-002）

**T-001 的核心目标达成**：确定性副本已迁到带票据的 child_process worker，支持跨 worker 检查点续接，
reward-once 跨进程守住。**标 Done。** Phase 6 硬化另立 T-004 继续。

一个诚实边界：I3 用 scripted worker，未在单个测试里真跑 child process 到完成；但真 worker 的 tick/snapshot/
checkpoint 有真 child process 测试、浏览器测试证实真 worker 启动+快照流转，两侧在 `_emit` 契约处对齐，覆盖完整。

## 剩余（T-004 · Phase 6 硬化）
- 🟠 **I1 背压**：`_queueDungeonTick` 无合并，IPC 跟不上则链无界增长——横扩前必做。
- 跨 worker 故障/epoch 回归（杀 worker→fencing→新 epoch restore→旧响应拒绝，端到端）。
- 跨机调度演练；协议 conformance；容量/压力门。
- 顺带：T-002 既有 flake 去抖（污染全绿闸门），可并入。
