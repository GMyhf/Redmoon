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

## 与 CHANGELOG.md 的边界

**本脚手架自身的变更记录走 `HANDOFF.md` / `PLAN.md`（Decision Log），不进 `CHANGELOG.md`。**
`CHANGELOG.md` 只记 CRIMSON RELAY 的**玩法与架构改进**；协作流程/工具属于开发流程，
另立一条记录线，避免稀释以玩家和协议为中心的迭代日志。一句话：
**CHANGELOG 管游戏怎么变，`collab/` 管我们俩怎么协作。**

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
- **交回时必须附一次真正跑完的 `npm test` 全套尾部计数。** 不接受「定向通过 + 全套超时/抖动」的组合——
  T-041 证明了那个组合恰好是确定性红灯的藏身处，代价是 main 带着红灯上线。
- **交付后回来销账：任务落地时，把它回答掉的「未决 / 待拍板 / TODO」逐条改成带出处的已决记录。**
  **保留原问题、注明最终取值与代码出处，不要删除**，让来回可查。
  为什么是硬约束而不是卫生习惯：两个 agent 每轮都读这些文档，**一份多数已决的待办清单会让人重开已经关掉的方向**，
  或者基于过期现状向人征询决策。2026-07-18 的一次审计发现七处此类残留，其中最严重的一条
  （「`will` 至今没有出口」）**是 Claude 前一个提交刚写下的**，而 `will` 早在 P1 就被精炼消耗了——
  它正等着人拍板，人若照它作答就会基于错误现状决策。**这与「假前提替设计决策背书」是同一类毛病，方向相反**：
  那边是过期前提还在支撑结论，这边是过期问题还在征询答案。

## 生成 review 包

```bash
npm run handoff -- --from claude --to codex        # 默认：未提交改动 or 最近一次提交
npm run handoff -- --from claude --to codex --base main   # main..HEAD 的全部改动
npm run handoff -- --from codex --to claude --range HEAD~3..HEAD --test
```

生成 `collab/review-input.md`：包含改动摘要、changed files、完整 diff、交接方 NOTES、
PLAN 里的未决项，以及一份针对本项目的 review 检查清单。把这个文件喂给另一方即可。
