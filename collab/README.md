# 协作脚手架 · Claude ⇄ Codex

两个 AI（Claude Code 与 Codex）不能靠"记忆"协作，只能靠**共享事实源**交接。
这个目录就是那层事实源：谁都能读、谁都能写、每一轮都留下书面痕迹。

## 文件职责

| 文件 | 作用 | 谁写 |
| --- | --- | --- |
| `PLAN.md` | 唯一任务清单 + 决策记录（Decision Log） | 人拍板；两个 agent 更新状态 |
| `HANDOFF.md` | 交接日志：每一次「我做完了，轮到你」都追加一条 | 交接方 |
| `NOTES-claude.md` | Claude 留给 Codex 的话（改了什么、哪里没把握） | 只有 Claude |
| `NOTES-codex.md` | Codex 留给 Claude 的话（审查意见、发现的问题） | 只有 Codex |
| `review-input.md` | 脚本自动生成的 review 包（**不入库**） | `tools/handoff.mjs` |

> `git` 是最硬的桥梁，`npm test` 是最硬的仲裁。文档负责「为什么」和「接下来」，
> 代码与测试负责「是什么」。冲突时，能跑通测试的方案胜出。

## 一轮标准循环

```
1. 人：把目标写进 collab/PLAN.md（Backlog 里加一条任务）
2. 实现方（如 Claude）：
     - 认领任务 → 改 PLAN.md 状态为 In progress，署名
     - 实现 → npm test && npm run check → git commit（小步、清晰 message）
     - 写 NOTES-claude.md：做了什么 / 哪里没把握 / 想让对方重点看哪里
     - 追加一条 HANDOFF.md 交接记录
     - 运行 npm run handoff -- --from claude --to codex
3. 人：把生成的 collab/review-input.md 交给 Codex（或让 Codex 直接读仓库）
4. 审查方（Codex）：
     - 读 review-input.md → 审查 / 挑 bug / 写会失败的测试
     - 把意见写进 NOTES-codex.md；能直接修的就修 + commit
     - 追加一条 HANDOFF.md 交接记录，轮回给 Claude
5. 实现方：git pull → 看对方 commit 与 NOTES → 继续迭代
6. 测试全绿 + 双方无异议 → 在 PLAN.md 标 Done，写进 Decision Log（如有决策）
```

## 协作模式（按需选）

- **生成 ↔ 审查**：一方写实现，另一方交叉审查。不同模型盲点不同，能抓到单模型漏掉的问题。
- **规划 ↔ 执行**：一方拆任务写 PLAN，另一方逐条实现，偏差写回 NOTES。
- **红队 / 对抗**：关键逻辑（服务端权威、协议、结算）由另一方专门找茬、写会失败的测试。
- **分工并行**：按模块切分，各用 git 分支或 `git worktree` 隔离，避免踩同一段代码。

## 硬约束（避免互相覆盖）

- 开工前先在 `PLAN.md` 认领任务并署名；**不要两个 agent 同时改同一文件的同一段**。
- 小步提交、清晰 commit message，审查方才看得懂 diff。
- 交接格式统一走 `HANDOFF.md` 模板，减少人工搬运。
- 本项目的核心红线（务必在审查时检查）：**客户端只提交意图，服务端在 tick 边界决定一切结果**；
  破坏性协议改动必须同步 `PROTOCOL_VERSION` + 协议文档 + 测试。

## 生成 review 包

```bash
npm run handoff -- --from claude --to codex        # 默认：未提交改动 or 最近一次提交
npm run handoff -- --from claude --to codex --base main   # main..HEAD 的全部改动
npm run handoff -- --from codex --to claude --range HEAD~3..HEAD --test
```

生成 `collab/review-input.md`：包含改动摘要、changed files、完整 diff、交接方 NOTES、
PLAN 里的未决项，以及一份针对本项目的 review 检查清单。把这个文件喂给另一方即可。
