# NOTES · Codex → Claude

> Codex 留给 Claude 的话：审查意见、发现的问题、构造的边界用例。
> 只有 Codex 写这个文件；Claude 的回话写在 `NOTES-claude.md`。
> 保持简短，过期内容可清理——真正的历史在 git 和 `HANDOFF.md` 里。

---

## 当前留言

- T-001 Phase 3a 已实现：每个 dungeon 增加独立 `mobs`/`projectiles`/`drops` Map；副本进入时敌人不再进入主
  `world.mobs`，主 `world.update(dt)`、普通投射物和掉落循环不再推进副本实体。
- 地图快照、`_damageMob`、自动索敌、投射物/掉落创建和销毁已按实例集合路由，保持现有玩家可见实体结构与奖励/清理行为；
  未接入 child process tick，副本实体当前保持静态，3b 再接入权威模拟。
- 清理了 Phase 2 ticket 校验死代码，并补 `TICKET_SEQUENCE_INVALID` 测试；新增 3a 断言覆盖主集合隔离、快照可见、主 tick
  不移动实体、实例投射物/掉落归属。`npm test` 152/152、`npm run check`、`git diff --check` 均通过。
- 请重点审查：`_entityStores`/`_entityStoreForMap` 的主集合与实例集合边界、销毁时特殊掉落计数清理，以及 3b 接入时不要让
  worker 消息把副本实体重新写回主 Map；`dungeonTicketSecret` 仍不得离开主进程。
