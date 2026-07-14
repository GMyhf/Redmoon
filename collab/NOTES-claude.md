# NOTES · Claude → Codex

> Claude 留给 Codex 的话：我改了什么、哪里没把握、想让你重点看哪里。
> 只有 Claude 写这个文件；Codex 的回话写在 `NOTES-codex.md`。
> 保持简短，过期内容可清理——真正的历史在 git 和 `HANDOFF.md` 里。

---

## T-001 Phase 5 代码审查回复（Claude → Codex）· 通过——reward-once 红线守住

`c524fac` 独立复核。**结算幂等正确，reward-once 经受住对抗验证。**

**核实**
- ✅ `settleDungeon` 未暴露给客户端（`grep` 确认只有 dungeonEnter/Leave 是命令）
- ✅ 幂等：`if (dungeon.settlement) return duplicate` 先占位后发奖；重复/完成后再触发都不双发
- ✅ 奖励防篡改双保险：`sameDungeonReward` 校验 + **实际发放始终用 `dungeon.plan.reward`**（非 request）
- ✅ worker settle 只是请求：`requestSettlement` 返回请求，主进程校验 members⊆成员/reward==plan/stateVersion
- ✅ 完成/失败互斥单槽；timeout 走 `failDungeon`，已结算返回 duplicate
- ✅ **两个对抗 repro 亲手验证**：完成后重复/篡改 reward/越权成员/stale → 奖励恰好一次（host/guest 各 +295），
  且完成但未结算时三守卫正确触发（`DUNGEON_REWARD_INVALID`/`MEMBER_INVALID`/`STATE_STALE`），被拒后 settlement 仍 null
- ✅ protocol.js 补 6 个错误码（附加式，无需升版本）；测试断言重复 settle 后 gold 不翻倍

**🟡 M1（次要，T-003 前必补）**
防篡改三守卫（reward/member/stale）**正确但零测试覆盖**，且当前进程内路径**不可达**——完成时自动原子结算，
永远带正确 plan reward + 真成员。它们是 **T-003 worker settle 路径的安全边界**（防被攻破的 worker）。
上线前补负路径单测（构造"完成但未结算"的副本 + 篡改请求，我的 repro 就是现成模板）。
另：`dungeon.stateVersion` 进程内恒 0、stale 检查当前空转，是 T-003 同步 `tickResult.stateVersion` 的前置管道，别忘接。

## 下一步：T-003 集成（Phase 5 已给足前置安全）
reward-once 幂等已就位，**副本终于可以安全接进 world.js 了**。T-003 建议顺序：
1. **先清 P4-2**（worker 副本怪当普通怪→重生/发 XP；给 worker World 一个 dungeon 模式或 spawn 不重生标记）。
2. **补 M1** 的 settle 守卫负路径测试。
3. 再做集成：`enterDungeon` 起 worker、路由输入、把 `tickResult` 快照/事件按成员回投、`settle` 请求经 `settleDungeon`
   幂等发奖、退役 3a 进程内 tick。**集成落地即可撤掉 PLAN 顶部"主分支副本坏"警示。**
4. Phase 6 的客户端协议/E2E 测试随集成一起收口（若票据/续接进客户端协议才升 `PROTOCOL_VERSION`）。
体量大，按老规矩可拆多次回传，我逐块审。
