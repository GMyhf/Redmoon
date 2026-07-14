# NOTES · Claude → Codex

> Claude 留给 Codex 的话：我改了什么、哪里没把握、想让你重点看哪里。
> 只有 Claude 写这个文件；Codex 的回话写在 `NOTES-codex.md`。
> 保持简短，过期内容可清理——真正的历史在 git 和 `HANDOFF.md` 里。

---

## T-001 设计简报 · 副本独立化（Claude → Codex）

这是一个"规划 → 执行"的交接：我（Claude）负责拆解和约束，**执行交给你**。
这个任务是下阶段最大的一块，别一把梭改成大 PR。**首个交付请只做设计文档 + 接口契约**，
人拍板载体选型后，再进入分步实现。

### 目标（README 路线图 #2）
把当前跑在主进程内的确定性副本，迁到**带版本票据（versioned ticket）的独立 worker**，
让玩家状态和当前默认 5 分钟断线保席能**跨 worker 续接**。

### 现状（先读这些再动手）
- `src/server/dungeon.js`：`createDungeonPlan(...)` 是**纯函数**生成器（70 行），文件头注释就写了
  "can later move into a dedicated instance worker unchanged"——它天然可搬，不用改。
- `src/server/world.js`：实例**生命周期**在这里，in-process `this.dungeons` Map 管理
  （`enterDungeon`/`leaveDungeon` 约 684–718 行，`_dungeonSequence`、`maxDungeons=32`、
  `dungeonDuration=15min`）。这是要拆出去的部分。
- 副本 tick 目前和主世界共用 `world.update(dt)`。

### 首个交付（就做这些，别越界）
1. `docs/DUNGEON_WORKERS.md` 设计文档，覆盖：
   - **载体选型对比**：`worker_threads` vs `child_process`/独立进程，落到 PLAN 的 Open question，给推荐+理由。
   - **版本票据结构**：签发/校验字段（instanceId、schemaVersion、averageLevel、party 成员、签发时刻、
     过期、签名/序号），以及旧票据如何被安全拒绝（对齐现有 `PROTOCOL_VERSION` / schema 拒绝旧版的做法）。
   - **续接协议**：玩家断线→保席→在（可能不同的）worker 上凭票据续接的时序；崩溃/超时/容量满的降级路径。
   - **主进程 ↔ worker 消息契约**：开副本、tick 广播、结算奖励（只结算一次！）、回收实例的消息型别。
2. 一个**接口草案**（TS 注释或 JSDoc 皆可，不用完整实现）：worker 入口签名、主进程侧的 handle。
3. 在 `NOTES-codex.md` 回我：你选了哪条载体、哪些地方要我这边先拍板。

### 红线（我会照这些审你）
- **服务端权威不能破**：迁到 worker 后，命中/伤害/位置/XP/奖励仍由服务端权威决定，客户端只提交意图。
- **奖励只结算一次**：现有副本"成员奖励只结算一次"的保证，跨 worker 后绝不能变成可重复领取——
  这是我会重点写对抗测试的地方。
- **确定性可测**：worker 逻辑要能像现在一样用注入 `rng` + `world.update(dt)` 确定性测试，不依赖真实时钟/IPC 时序。
- **协议破坏要升版本**：若票据/续接改了 server↔client 字段，同步 `PROTOCOL_VERSION` + `docs/ARCHITECTURE.md` + 测试。
- 脚手架变更不进 CHANGELOG，但**副本架构改动属于架构改进，要记 CHANGELOG.md**。

### 交接完请
认领确认（PLAN 里 T-001 已挂你名下、In progress），做完设计文档后跑
`npm run handoff -- --from codex --to claude`，把设计包丢回来给我审。
