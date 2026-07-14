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

### 2026-07-14 · Claude → Codex · T-001（设计审查回复）

- **做了什么**：审了 `docs/DUNGEON_WORKERS.md`。**设计通过**。核验了对代码的断言（`rewarded` Set、
  结算需在副本地图、`plan.reward`）——全部准确。抓到实现前必补 3 处，并传达人已拍板的 3 项决定。
- **改了哪些文件**：`collab/NOTES-claude.md`（审查回复全文）, `collab/PLAN.md`（决策入 Log、Open question 收口）
- **关联提交**：随此提交推送；无运行时代码改动
- **验证**：审查性核验，跑了 `git grep`/`sed` 对照 `world.js`（rng 在 145 行、结算在 789–798 行、22 处 rng 调用）
- **请重点看**：**F1（阻断）**——`this.rng` 是不透明函数、`Math.random` 无可序列化状态，跨 worker
  `restore` 会掷骰分叉；必须先做「Phase 0：可 seed PRNG」。F2 检查点别逐 tick 全量。F3 注明输入按 seq 去重。
- **人已拍板**：①载体=`child_process`/独立进程（非 worker_threads）②不要求重启无损恢复 ③不允许离线补领。详见 NOTES-claude。
- **红线自检**：未触及运行时/协议 ✅；提醒实现落地时属架构改进，**要记 CHANGELOG.md**
- **下一步建议**：Codex 按 3 项决定 + F1/F2/F3 更新设计文档，把大任务拆成实现里程碑清单
  （Phase 0 PRNG → transport+握手 → 票据 → tick/attach/detach → restore+fencing → settle 幂等 → 测试），
  回 `NOTES-codex.md` 贴清单再 `npm run handoff --from codex --to claude` 丢回来审拆分。

### 2026-07-14 · Codex → Claude · T-001

- **做了什么**：完成副本 worker 化首个设计交付，明确 `worker_threads` 首期推荐、票据版本与签名、跨 worker
  续接/恢复、故障降级和主进程奖励幂等边界；无运行时代码改动。
- **改了哪些文件**：`docs/DUNGEON_WORKERS.md`, `collab/NOTES-codex.md`
- **关联提交**：未提交，见 `collab/review-input.md`
- **验证**：`git diff --check` 通过；`npm test` 未运行（本轮仅设计文档）；`npm run check` 未运行（无脚本改动）
- **请重点看**：`worker_threads` 与 `child_process` 的推荐是否符合部署目标；票据 `party`/过期/序号语义、
  `workerEpoch` fencing、检查点恢复，以及完成后离线成员的奖励政策是否需要调整。
- **红线自检**：客户端只提交意图 ✅ ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A（未改线上协议）
- **下一步建议**：Claude 先审设计取舍并拍板载体、重启恢复和离线补领奖励规则，再拆分实现任务。

### 2026-07-14 · Claude → Codex · T-001

- **做了什么**：拆解下阶段最大任务「副本独立化」并交给 Codex 执行。定了范围：**首个交付只做设计文档
  + 接口契约**，不做大 PR。完整简报见 `NOTES-claude.md` 的「T-001 设计简报」。
- **改了哪些文件**：`collab/PLAN.md`（T-001 挂 Codex 名下、Open question 记载体选型）,
  `collab/NOTES-claude.md`（设计简报）
- **关联提交**：本次交接即随此提交推送；无运行时代码改动
- **验证**：纯规划/流程文档，未触碰 `src/`；`npm run check` 不受影响
- **请重点看**：`NOTES-claude.md` 里的「首个交付」三条边界是否够清楚可执行；PLAN 的 Open question
  （worker 载体：`worker_threads` vs 独立进程）想让你在设计文档里给推荐+理由，人再拍板。
- **红线自检**：未触及运行时/协议 ✅；提醒——副本架构落地时属架构改进，**要记 CHANGELOG.md**（脚手架本身不记）
- **下一步建议**：Codex 先读 `dungeon.js`（纯生成器，可原样搬）+ `world.js` 684–718 行的实例生命周期，
  产出 `docs/DUNGEON_WORKERS.md`，再 `npm run handoff -- --from codex --to claude` 把设计包丢回来。

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
