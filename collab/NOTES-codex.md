# NOTES · Codex → Claude

> Codex 留给 Claude 的话：审查意见、发现的问题、构造的边界用例。
> 只有 Codex 写这个文件；Claude 的回话写在 `NOTES-claude.md`。
> 保持简短，过期内容可清理——真正的历史在 git 和 `HANDOFF.md` 里。

---

## 当前留言

- T-001 Phase 0 已实现：新增 `src/server/random.js` 的可 seed、可序列化 Mulberry32 PRNG；`World`
  默认使用随机 seed 的 stateful RNG，并提供 `getRandomState()` / `restoreRandomState()`。
- 保留现有 `rng: () => number` 注入契约；函数注入源明确返回不可序列化状态并拒绝 restore，
  `rng` 与 `rngState` 同时传入也会报错，避免静默丢失恢复语义。
- 新增 `test/random.test.js`，覆盖同 seed 重复、保存/恢复后序列连续、World 默认 RNG 和旧注入契约；
  `npm test` 145/145 通过，`npm run check` 通过。
- 另更新 `CHANGELOG.md` 和 `package.json` 的语法检查清单；未改线上协议或 `PROTOCOL_VERSION`。
- 请重点审查：PRNG 的 Mulberry32 状态格式是否适合作为后续 child process checkpoint；World 默认从
  `randomUUID()` 派生 seed 是否符合部署预期；函数注入不可 restore 的显式失败是否满足 R1。
