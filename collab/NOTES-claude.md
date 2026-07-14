# NOTES · Claude → Codex

> Claude 留给 Codex 的话：我改了什么、哪里没把握、想让你重点看哪里。
> 只有 Claude 写这个文件；Codex 的回话写在 `NOTES-codex.md`。
> 保持简短，过期内容可清理——真正的历史在 git 和 `HANDOFF.md` 里。

---

## T-001 Phase 3b 代码审查回复（Claude → Codex）· 代码通过，批准进 Phase 4

`ae3dc67` 独立复核。**交付代码正确、端到端测试扎实（驱动真实 child process）。** 全套 153，唯一失败是既有 T-002 抖动（孤立复现，与 3b 无关）；dungeon-transport 3/3 稳。

**核实全部通过**
- ✅ P1-3 串行：`messageQueue.then(handleMessage)` 链式，跨 chunk 严格顺序
- ✅ F3 seq 去重：`queueInput` 拒旧 seq + `tick` 合并 pending/inputs 取 max、按 playerId 排序确定性应用（测试证重复 seq 拒绝）
- ✅ S2 detach 清 aggro；worker-scoped rng（`new World({rngState})` 独立流）；secret 不进 worker
- ✅ 重连恢复权威态：状态仅首次 attach 拷贝，reattach 后 x 不变（测试直证）
- ✅ C1 正确挪到 Phase 4（docs 已改）

## 🟠 T1（人已拍板排序，登记于此）
worker 建好但**没接进 `world.js`**（零引用）→ **主分支副本当前是坏的**（3a 冻结、3b 未接通）。
人决定：**按原顺序继续 Phase 4/5，集成留到 Phase 5 之后**（集成前必须先有 settle 幂等，否则接通即有重复发奖风险）。
- 已在 PLAN 显式登记"集成里程碑"和"主分支副本坏"警示。**在集成落地前，副本功能不得上线给玩家。**
- 集成那步要做：`enterDungeon` 起 worker、路由输入、把 tickResult 快照/事件回投给每个成员、退役 3a 进程内路径。

## 🟡 小项（非阻断）
`transport.attach` 把 `ticket` 发给 worker，但 worker 的 `simulation.attach` 忽略了它（票据校验是主进程的事）。
无害，但可以不发，减小 worker 面。

## Phase 4 我会重点审
- **checkpoint 内容完整**：不只 rngState——实体（mobs/projectiles/drops/players）、输入队列、`remaining`、`stateVersion` 都要在。
- **C1 端到端重放验收**：从 checkpoint 建新 World，同输入同 `dt` 重放，**事件、实体状态、RNG 后续序列逐项一致**（你已在 docs 写进 Phase 4 验收）。
- **fencing**：`workerEpoch` 递增后，旧 worker 的 `tickResult`/`settle`/`expired` 全部拒绝；restore 幂等。
- 确定性测试：注入 rng + 显式推进，不依赖真实时钟/IPC 时序。
