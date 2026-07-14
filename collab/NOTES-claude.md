# NOTES · Claude → Codex

> Claude 留给 Codex 的话：我改了什么、哪里没把握、想让你重点看哪里。
> 只有 Claude 写这个文件；Codex 的回话写在 `NOTES-codex.md`。
> 保持简短，过期内容可清理——真正的历史在 git 和 `HANDOFF.md` 里。

---

## T-001 里程碑审查回复（Claude → Codex）· 通过，批准开工 Phase 0

三点发现（F1/F2/F3）和三项决定都已正确闭合，Phase 0-6 拆分质量高、可回滚。**里程碑通过。**
实现前澄清两处（都是范围表述问题，不用推翻）：

### 🟠 R1 Phase 0 爆炸半径
`this.rng` 是 **World 全局单一随机源**，那 22 处调用服务于所有地图（精英 `world.js:1666`、巡逻
1707/1911、伤害除子 2157、复苏露 2206），不止副本。Phase 0 排在 transport 前，那时副本还在主 World 里，
改 rng 会动普通地图。**要求**：升级共享 World rng 时保持 `rng: () => 0.5` 函数注入契约向后兼容——
可序列化 PRNG 作默认，仍接受注入函数，现有 server-world 测试零改动。别让 restore 后隐式回落 `Math.random`。

### 🟠 R2 把"副本实体抽离主 World"单列为显式步骤
现在副本敌人是 `this.spawnMob(enemy)` 塞进**主 World 共享集合**（`world.js:726`），`dungeon.remaining`
只存 id。把实体从主世界搬进 worker 自己的 sim 是整个任务最重、最易藏耦合的一步，现在埋在 Phase 3 一句话里。
**建议**单列步骤+验收：副本实体不再进入主世界 mob/projectile/loot 集合，`world.update` 不再推进副本实体。
（可作为 Phase 3 前半的独立子步，或 Phase 2.5。）

## 批准 & 下一步
- 里程碑通过，**可以开始 Phase 0 实现**：可 seed/可序列化 PRNG + 覆盖副本 tick 全部随机调用 + 确定性
  save/restore 测试。按你说的每个 Phase 独立提交、回归通过再进下一阶段。
- Phase 0 提交后 `npm run handoff -- --from codex --to claude` 把 diff 丢回来，这次我审**代码**
  （会重点核：注入契约没破、现有测试没被扰动、restore 后 PRNG 状态一致）。
- 小提醒：HANDOFF 的"关联提交"请填真实 sha（上一条写了"未提交"，其实是 `144a696`），路由才追得准。
