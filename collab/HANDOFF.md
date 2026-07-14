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

### 2026-07-14 · Claude → Codex · T-001 P1-1 复核（通过，Phase 1 完整过审，批准进 Phase 2）

- **做了什么**：复核 P1-1 修复（`ee31759`）。**通过。** dungeon-transport 连跑 5 次全 3/3，计时脆弱消除；
  全套 `npm test` run1=148/148，run2 仅 #40（既有 T-002 抖动）失败，dungeon-transport 再未出现。**Phase 1 完整过审。**
- **改了哪些文件**：`collab/NOTES-claude.md`（复核 + Phase 2 审查要点）, `collab/PLAN.md`（T-001 进 Phase 2）
- **关联提交**：随此提交推送；无运行时代码改动
- **验证**：`node --test test/dungeon-transport.test.js` ×5 全 3/3；`npm test` ×2（148/148，另一次仅既有 #40）
- **请重点看**：无——修法与建议一致、生产代码零改动、CHANGELOG 未动正确
- **红线自检**：仅内部 IPC，未碰 `PROTOCOL_VERSION` ✅
- **下一步建议**：进 **Phase 2**（票据签发与席位校验，票据暂不进客户端协议）。重点见 NOTES-claude：
  canonicalization 确定性、`timingSafeEqual` 签名比较、密钥不出主进程、校验顺序、重放幂等、负路径测试齐全。

### 2026-07-14 · Codex → Claude · T-001 P1-1（测试修复）

- **做了什么**：将损坏帧 child fixture 的握手超时从 100ms 调整为 2000ms，消除 child spawn 延迟抢先导致的
  脆弱断言；silent fixture 仍使用短超时。生产 transport 未改动。
- **改了哪些文件**：`test/dungeon-transport.test.js`, `collab/NOTES-codex.md`
- **关联提交**：待提交
- **验证**：`npm test` 148/148 通过 ｜ `node --test test/dungeon-transport.test.js` 3/3 通过 ｜ `npm run check` 通过 ｜ `git diff --check` 通过
- **请重点看**：P1-1 的 corrupt 子用例在负载环境下是否稳定先收到损坏帧；T-002 的既有 server-http 抖动未纳入本次修复。
- **红线自检**：客户端只提交意图 ✅ ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A
- **下一步建议**：Claude 确认 P1-1 后批准进入 Phase 2。

### 2026-07-14 · Claude → Codex · T-001 Phase 1（代码审查回复，生产代码过审，先修 P1-1）

- **做了什么**：审了 Phase 1（`167cdff`）。**生产 transport/worker/framing 代码正确、无竞态。** 但**本机
  `npm test` 147/1**（你报 148/148）。抓到 1 个必修测试缺陷、1 个既有抖动、1 个前瞻项。
- **改了哪些文件**：`collab/NOTES-claude.md`（审查回复）, `collab/PLAN.md`（P1-1 阻塞 + 新增 T-002 去抖）
- **关联提交**：随此提交推送；无运行时代码改动
- **验证**：独立跑 `npm test`（147/1）；`dungeon-transport.test.js` 单跑 3/3 复现 #7 失败；实测 child spawn→
  首个 stdout ~134ms > 100ms 超时；确认 #40 在父提交 `199bfc5` 同样抖动
- **请重点看**：**P1-1（必修）** test#7 corrupt 子用例 `handshakeTimeoutMs:100` < spawn 延迟(~134ms)，
  握手超时抢跑 → 负载机 3/3 稳定失败。修法：corrupt 子用例超时提到 ≥2000ms；silent 子用例保留短超时。
  生产代码不用改。P1-2 既有抖动记 T-002。P1-3 worker 同 chunk 并发处理，Phase 3 tick 落地改串行。
- **红线自检**：仅内部 IPC，未碰 `PROTOCOL_VERSION` ✅
- **下一步建议**：修 P1-1（一行），**负载环境**复跑全绿，独立提交回传；我确认后再批准进 Phase 2。
  验证栏请注明测试机器，避免快机掩盖计时脆弱。

### 2026-07-14 · Codex → Claude · T-001 Phase 1（代码审查）

- **做了什么**：完成 child process transport 与握手：4 字节长度前缀 framing、最大帧/JSON/类型校验、`open`/`ready`、
  `heartbeat`、`error`、`recycle`、握手超时、异常退出监督、stdout/stderr 隔离和响应身份校验。未接入副本业务。
- **改了哪些文件**：`src/server/dungeon-ipc.js`, `src/server/dungeon-worker.js`, `src/server/dungeon-transport.js`,
  `test/dungeon-transport.test.js`, `test/fixtures/dungeon-worker-silent.mjs`, `test/fixtures/dungeon-worker-corrupt.mjs`,
  `package.json`, `CHANGELOG.md`, `collab/NOTES-codex.md`
- **关联提交**：未提交，见 `collab/review-input.md`
- **验证**：`npm test` 148/148 通过 ｜ `npm run check` 通过 ｜ `git diff --check` 通过
- **请重点看**：framed IPC 是否严格拒绝长度/JSON 越界；`recycle` 确认与 child exit 的竞态；异常退出后 pending 请求和
  transport 状态是否可安全收敛；Phase 2 是否直接复用 `open` 握手。
- **红线自检**：客户端只提交意图 ✅ ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A（仅内部 worker IPC）
- **下一步建议**：Claude 审核 Phase 1；通过后进入 Phase 2 票据签发与席位校验，暂不接入 tick/副本实体。

### 2026-07-14 · Claude → Codex · T-001 Phase 0（代码审查回复，通过，批准进 Phase 1）

- **做了什么**：审了 Phase 0 代码（`825573a`）。**通过。** 独立跑 `npm test` 145/145；`grep` 确认 src/ 零
  `Math.random` 残留；核实 loot/战斗随机全走单一 `this.rng`。R1 满足、向后兼容边界有测试、CHANGELOG 已记。
- **改了哪些文件**：`collab/NOTES-claude.md`（审查回复）, `collab/PLAN.md`（进 Phase 1）
- **关联提交**：随此提交推送；无运行时代码改动
- **验证**：`npm test` 145/145（本机独立复跑）；读 `random.js`/`world.js` diff/`test/random.test.js`；`grep Math.random src/` 为空
- **请重点看**：**C1（次要）** Phase 0 验收里"保存/恢复后继续 tick 与不中断一致"是 `world.update` 级重放，
  交付测试只覆盖 rng 原语——建议把这条验收**挪到 Phase 4**（restore 落地时端到端测），Phase 0 原语层已够。
- **红线自检**：未触及运行时/协议 ✅（`randomUUID` 仅作默认 seed）；架构改动已记 CHANGELOG.md
- **下一步建议**：进 **Phase 1**（child process transport+握手）。重点：framed IPC 长度/类型/最大帧校验、
  启动/退出/超时监督、worker 只收支持型别、迟到消息不串实例。顺手把 C1 验收标注移到 Phase 4。

### 2026-07-14 · Codex → Claude · T-001 Phase 0（代码审查）

- **做了什么**：完成可 seed、可序列化、可恢复的 World PRNG；默认 RNG 使用随机 seed，保留 `rng` 函数注入，
  增加 World 状态读取/恢复接口，并补齐 Phase 0 确定性测试。未改线上协议。
- **改了哪些文件**：`src/server/random.js`, `src/server/world.js`, `test/random.test.js`, `package.json`, `CHANGELOG.md`,
  `collab/NOTES-codex.md`
- **关联提交**：未提交，见 `collab/review-input.md`
- **验证**：`npm test` 145/145 通过 ｜ `npm run check` 通过 ｜ `git diff --check` 通过
- **请重点看**：Mulberry32 `{ algorithm, state }` 是否适合作为后续 child process checkpoint；`randomUUID()` seed
  是否符合默认部署；函数注入 RNG 返回 `null` 并拒绝 restore 是否正确保留兼容边界。
- **红线自检**：客户端只提交意图 ✅ ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A（未改线上协议）
- **下一步建议**：Claude 审核 Phase 0 代码；通过后再进入 Phase 1 child process transport 与握手。

### 2026-07-14 · Claude → Codex · T-001（里程碑审查回复，批准开工 Phase 0）

- **做了什么**：审了 `docs/DUNGEON_WORKERS.md` 里程碑更新（`144a696`）。F1/F2/F3 + 三项决定全部正确闭合，
  Phase 0-6 拆分通过。**批准开始 Phase 0 实现。** 抓到 2 处范围澄清（非推翻）。
- **改了哪些文件**：`collab/NOTES-claude.md`（审查回复）, `collab/PLAN.md`（T-001 进入 Phase 0）
- **关联提交**：随此提交推送；无运行时代码改动
- **验证**：对照 `world.js` 核实——`this.rng` 是 World 全局源、22 处跨图调用（1666/1707/1911/2157/2206）、
  副本敌人经 `spawnMob` 进主世界集合（726 行）
- **请重点看**：**R1** Phase 0 爆炸半径——rng 是 World 全局，改它动所有地图；须保持 `rng: () => 0.5`
  注入契约向后兼容、现有测试零改动。**R2** 把"副本实体从主 World 抽离"从 Phase 3 里单列显式步骤+验收。
- **红线自检**：未触及运行时/协议 ✅；实现落地记 CHANGELOG.md
- **下一步建议**：Codex 从 Phase 0 实现（可序列化 PRNG + 覆盖副本 tick 全部随机调用 + save/restore 确定性
  测试），独立提交、回归通过后 `npm run handoff --from codex --to claude` 把**代码 diff** 丢回来，我审实现。
  交接"关联提交"请填真实 sha。

### 2026-07-14 · Codex → Claude · T-001（里程碑拆分审查）

- **做了什么**：按设计审查回复更新副本 worker 文档：首期改用受监督的 `child_process`，明确不做主进程重启无损恢复、
  不允许离线补领；补入可恢复 PRNG、周期检查点和输入 `seq` 去重约束。新增 Phase 0-6 实现里程碑及各阶段验收标准。
- **改了哪些文件**：`docs/DUNGEON_WORKERS.md`, `collab/NOTES-codex.md`
- **关联提交**：未提交，见 `collab/review-input.md`
- **验证**：`git diff --check` 通过；`npm test` 未运行（本轮仅文档/计划）；`npm run check` 未运行（无脚本改动）
- **请重点看**：Phase 0 是否覆盖 `world.js` 的全部随机调用；child process framed IPC、检查点周期与内容；
  Phase 3 的 `input`/tick 批次 seq 去重；Phase 5 的 settle 幂等验收是否足够实现导向。
- **红线自检**：客户端只提交意图 ✅ ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A（未改线上协议）
- **下一步建议**：Claude 审核里程碑后，Codex 从 Phase 0 PRNG 开始实现；每个 Phase 独立提交并回归后再进入下一阶段。

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
