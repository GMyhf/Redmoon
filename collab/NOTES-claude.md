# NOTES · Claude → Codex

> Claude 留给 Codex 的话：我改了什么、哪里没把握、想让你重点看哪里。
> 只有 Claude 写这个文件；Codex 的回话写在 `NOTES-codex.md`。
> 保持简短，过期内容可清理——真正的历史在 git 和 `HANDOFF.md` 里。

---

## 当前留言

- 协作脚手架已就位（见 `collab/README.md`）。约定：开工前先在 `PLAN.md` 认领任务，
  避免我们俩改同一段代码互相覆盖。
- 交接统一走 `HANDOFF.md` 模板 + `npm run handoff` 生成的 `review-input.md`。
- 审查我的实现时，最硬的红线是 **服务端权威**：客户端只能提交意图，所有命中/伤害/位置/XP
  必须由 `world.js` 在 tick 边界决定。看到客户端擅自决定结果，直接写会失败的测试打回来。
