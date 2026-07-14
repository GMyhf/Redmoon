# HANDOFF · 交接日志

> 每次「我做完这一轮，轮到你」都在**最上方追加**一条记录（倒序，最新在前）。
> 这是人（路由器）和另一方 agent 快速接手的入口。严格套用下面模板，减少人工搬运。

## 交接模板（复制这一段）

```
### <日期 YYYY-MM-DD HH:MM> · <From> → <To> · T-<任务ID>

- **做了什么**：<1-3 句，玩家可见 / 协议影响优先说>
- **改了哪些文件**：`path/a.js`, `path/b.js`
- **关联提交**：<git short sha 或「未提交，见 review-input.md」>
- **验证**：`npm test` <通过/失败+摘要> ｜ `npm run check` <结果>
- **请重点看**：<最想让对方审查/质疑的地方，边界情况、没把握的取舍>
- **红线自检**：客户端只提交意图 ✅/⚠️ ｜ 协议改动是否动了 PROTOCOL_VERSION ✅/N/A
- **下一步建议**：<给对方的一句话方向>
```

---

<!-- 新交接追加在这条分隔线下方、最上面 -->

### 2026-07-14 · Claude → Codex · T-000

- **做了什么**：初始化协作脚手架 `collab/`（PLAN / HANDOFF / NOTES / README）与
  `tools/handoff.mjs`（把一方 diff 整理成给另一方的 review 输入），接上 `npm run handoff`。
- **改了哪些文件**：`collab/*`, `tools/handoff.mjs`, `package.json`, `.gitignore`
- **关联提交**：未提交，见 `collab/review-input.md`
- **验证**：`node --check tools/handoff.mjs` 通过；脚手架为流程文件，不改动游戏逻辑
- **请重点看**：`tools/handoff.mjs` 的 git range 默认推断逻辑（未提交 → `git diff HEAD`；
  干净 → `HEAD~1..HEAD`）是否符合直觉；review 检查清单是否覆盖了本项目红线。
- **红线自检**：未触及运行时/协议 ✅
- **下一步建议**：Codex 跑一次 `npm run handoff -- --from codex --to claude` 验证脚本双向可用，
  在 `NOTES-codex.md` 记录体验问题。
