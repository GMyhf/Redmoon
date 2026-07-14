# NOTES · Claude → Codex

> Claude 留给 Codex 的话：我改了什么、哪里没把握、想让你重点看哪里。
> 只有 Claude 写这个文件；Codex 的回话写在 `NOTES-codex.md`。
> 保持简短，过期内容可清理——真正的历史在 git 和 `HANDOFF.md` 里。
> （T-001 首轮设计简报已被 Codex 消费，原文见 git `39a077e`。）

---

## T-001 设计审查回复（Claude → Codex）· 设计通过，实现前补 3 处

我核验了 `docs/DUNGEON_WORKERS.md` 对现有代码的断言，全部准确（`world.js` 的
`rewarded` Set、结算需在副本地图、`plan.reward` 结构）。奖励幂等映射到现有语义、票据校验顺序、
`workerEpoch` fencing 都做得好。**设计通过**，但实现前必须处理下面三条：

### 🔴 F1（阻断实现）先做「Phase 0：可 seed PRNG」
`world.js:145` 是 `this.rng = options.rng ?? Math.random`——不透明函数，tick 期 22 处调用
（掉落 / 伤害浮动 / 怪物巡逻 / 复苏露）。`Math.random` **没有可序列化状态**。跨 worker `restore`
后掷骰序列会与原 worker 分叉 → 掉落/伤害/AI 漂移 → "权威恢复"破功。**前置任务**：把副本用的 rng
换成可 seed、状态可序列化的 PRNG（counter-based / splitmix 之类），检查点存 PRNG 状态而非空谈"seed"。
选了 child_process 后这条更硬——所有状态都要序列化过进程边界，没有共享内存兜底。

### 🟠 F2（中）检查点别逐 tick 全量
消息表里 `tickResult` 每帧都带 `checkpoint`（文档第 88 行）。20Hz 全量序列化开销大。
改成周期性/增量检查点，与 `tickResult` 解耦。

### 🟡 F3（小）注明输入去重
`input` 流式和 `tick.inputs` 批量两条路都送意图。文档补一句"意图按单调 `seq` 去重"
（World 已有此机制），避免同一意图被应用两次。

## 人已拍板（覆盖文档"待拍板事项"）
1. **载体 = `child_process` / 独立进程**（不是 worker_threads）。真正的崩溃/资源隔离、可跨机横扩。
   → `DungeonWorkerTransport` 抽象保留，但**首期就落 child_process**：序列化协议、进程监督、启动握手
   都要一并设计；票据签名密钥只放主进程/票据服务，不下发 worker。
2. **不要求重启无损恢复**：主进程重启时未恢复实例统一标 `dungeonFailed`、成员回城、不发奖励。
   检查点存储（文件/Redis/PG）留到跨机阶段再引入。
3. **不允许离线补领**：沿用现有规则，只对结算时仍在副本地图且未奖励的成员结算。

## 下一步（给你）
把设计文档更新到反映以上三条决定 + F1/F2/F3（尤其把 child_process 序列化协议和 Phase 0 PRNG
写进去），然后把大任务拆成可执行的实现里程碑清单（Phase 0 PRNG → transport+握手 → 票据签发/校验 →
tick/attach/detach → restore+fencing → settle 幂等 → 测试闸门），回 `NOTES-codex.md` 贴清单，
`npm run handoff -- --from codex --to claude` 丢回来我审拆分，再进入逐 Phase 实现。
