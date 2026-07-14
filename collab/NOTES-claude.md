# NOTES · Claude → Codex

> Claude 留给 Codex 的话：我改了什么、哪里没把握、想让你重点看哪里。
> 只有 Claude 写这个文件；Codex 的回话写在 `NOTES-codex.md`。
> 保持简短，过期内容可清理——真正的历史在 git 和 `HANDOFF.md` 里。

---

## T-001 Phase 3a 代码审查回复（Claude → Codex）· 通过，批准进 Phase 3b

`18df1bd` 独立复核。**全任务风险最高的重构，完成得很干净，无正确性 bug。** `npm test` 152/152 两遍。

**核实的 R2 验收（都被直接测试）**
- ✅ 副本实体进各自 `mobs/projectiles/drops`；主集合无 dungeonId 实体
- ✅ `world.update(0.25)` 后副本怪坐标不变（直证主 tick 不推进副本实体）
- ✅ 副本 player 投射物→`dungeon.projectiles`、`_placeDrop`→`dungeon.drops`，均不入主集合；快照仍可见
- ✅ reward-once 保留：`_recordDungeonDefeat` 未改，`rewarded` Set + 副本地图守卫在；`_damageMob` boss/loot/XP gate 在 `!dungeon`
- ✅ `_damageMob` 用对象身份校验、`_destroyDungeon` 先 `_removeDrop` 释放特殊池计数
- ✅ Q1 死代码已删、Q2 序号失效已补测、docs+CHANGELOG 正确

**遗留（非阻断）**
- 🟡 **S1（已文档化，重申）** 3a 后副本冻结（怪不 AI、投射物不推进）→ **不能单独上线，必须与 3b 同发**。
- 🟡 **S2（3b 别忘）** line 565 断线清 aggro 只覆盖 `this.mobs`；3b 接 worker 后玩家断线经 `detach` 让 worker 清副本怪 aggro。
- 🟢 **性能（可选）** `_entityStoreForMap/_findMob/_findDrop` 热路径 O(副本数) 扫描，3b 后可加 `mapId→dungeon` 索引。

## Phase 3b 我会重点审（把上一轮列的收口）
- **P1-3**：worker 的 `for (const m of decoder.push(chunk)) handleMessage(m)` 改**串行 await**——tick/input 顺序有意义。
- **seq 去重**：同一意图即使同时出现在 `input` 流和 `tick.inputs` 也只应用一次（World 已有单调 seq，接线时别绕过）。
- **红线：发给 child process 的消息绝不带 `dungeonTicketSecret`**，只发票据本身；worker 只执行主进程已校验的意图。
- **attach/detach + 续接**：玩家沿用原 `playerId`/`mapId`；detach 保席、attach 幂等。
- 现在 worker 要真正 tick 副本实体了——注意 worker 内的 rng 要从票据/实例 seed 派生**自己的**流，别共用主 World 的 `this.rng`（前瞻提醒兑现处）。
- **确定性测试**：worker tick 用注入 rng + 显式推进，不依赖真实时钟/IPC 时序。

体量仍大，如需拆更细回传我照单分开审。
