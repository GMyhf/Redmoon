# PLAN · 唯一任务清单与决策记录

> 这是 Claude 与 Codex 共享的**唯一任务事实源**。人拍板任务与优先级；
> 两个 agent 认领任务、更新状态、署名。状态流转：`Backlog → In progress → Review → Done`。
> 每条任务用一个 `T-<编号>` 标识，交接与提交信息里引用它。

## 状态看板

| ID | 任务 | 状态 | 负责 | 关联提交 / 备注 |
| --- | --- | --- | --- | --- |
| T-000 | 搭建 Claude⇄Codex 协作脚手架（本目录 + handoff 脚本） | Done | Claude | `2f5b370` / `13d3ffd` |
| T-001 | 副本独立化：把主进程内确定性副本迁到带版本票据的独立 worker，支持跨 worker 断线续接（README 路线图 #2） | **Done** | Codex | Phase 0-5 + T-003 集成全过审。确定性副本已迁 child_process worker、票据 + 跨 worker checkpoint 续接、reward-once 跨进程守住、副本活线可玩。里程碑见 `docs/DUNGEON_WORKERS.md` |
| T-003 | **副本 worker 集成**：把 worker 接进 `world.js.enterDungeon`（起 worker、路由输入、回投 tickResult 快照/事件给成员、`settle` 经 `settleDungeon` 幂等发奖、退役 3a 进程内路径） | **Done** | Codex | 集成过审（`ec1ee82`）；I2 事件字段修复 + I3 端到端 completion→settle 测试（`51af89f`，3/3 确定性）复核通过 |
| T-004 | **Phase 6 · 副本 worker 硬化**：I1 异步 tick 链背压、跨 worker 故障/epoch 端到端回归、跨机调度演练、协议 conformance、容量/压力门 | In progress | Codex | **核心硬化过审**：I1 背压（`c7b159f`）+ 跨 worker 故障/epoch（`ddaa655`）+ 8 副本并发压力门（`5afe047`，coalesced=160/backlog=8 算术核对、无遗留 resolver）。**剩余（收尾）**：协议 conformance 收尾核对、T-002 去抖（建议下一块）、跨机演练（留运维阶段） |
| T-002 | 去抖：`server-http` "隐藏浏览器…partyInvited"用例在 `199bfc5` 前即 ~1/2 随机失败，污染"npm test 全绿"闸门 | Backlog | - | Phase 1 审查中发现的既有问题，与 T-001 无关，建议独立修（可并入 T-004） |

> ✅ 副本 worker 已通过 T-003 接入 `GameServer`；主进程仍是玩家、席位、事件路由与奖励账本的权威来源。

<!-- 追加新任务时复制下面这行：
| T-00X | <一句话任务> | Backlog | - | - |
-->

## 认领约定

- 开工前把状态改成 `In progress` 并在「负责」列填上 `Claude` 或 `Codex`。
- 完成实现后改成 `Review`，交给另一方；对方通过后由任一方改成 `Done` 并补「关联提交」。
- **同一时刻，一个任务只有一个负责人**；需要并行就拆成两个 ID，分别落在不同文件/模块。

## Decision Log（决策记录）

> 只记「为什么这样定」，避免下一轮 agent 重新纠结已定过的问题。追加不修改。

- **2026-07-14 · 采用文件事实源协作**：两个 CLI 不会自动通信，靠 `collab/` 下的文件 +
  `git` + `npm test` 交接。人是路由器，负责在中间转交与拍板收敛。
  理由：产出落到文件里，另一个工具下次启动无需上下文即可接手，天然形成迭代闭环。
- **2026-07-14 · 脚手架变更不进 CHANGELOG.md**：协作流程/工具的变更记录走 `HANDOFF.md` /
  本 Decision Log；`CHANGELOG.md` 只记玩法与架构改进。同样的边界钉进了 `CLAUDE.md` 与 `AGENTS.md`。
  理由：CHANGELOG 是以玩家/协议为中心的迭代线，混入流程记录会稀释它，且脚手架已有自己的历史线。
- **2026-07-14 · T-001 副本 worker 载体 = `child_process`/独立进程**：覆盖 Codex 与 Claude 的
  worker_threads 首期建议。理由：要真正的崩溃/资源隔离与跨机横扩，接近长期水平扩展形态；
  `DungeonWorkerTransport` 抽象保留，但首期就落 child_process（序列化协议 + 进程监督 + 启动握手）。
- **2026-07-14 · T-001 首期不要求重启无损恢复**：主进程重启时未恢复实例统一标 `dungeonFailed`、
  成员回城、不发奖励。检查点持久化存储留到跨机阶段。理由：先验证消息契约与续接，避免过早引入外部存储。
- **2026-07-14 · T-001 不允许离线补领奖励**：沿用现有 `world.js` 行为，只对结算时仍在副本地图且
  未奖励的成员结算。理由：实现最简、无重复领取风险；离线补领留作后续产品决策。
- **2026-07-14 · T-001 worker 集成排在 Phase 5 之后（T-003）**：Phase 3b 只在隔离环境建好并测了 worker，
  未接进 `world.js`，故主分支副本暂坏。人决定按原顺序继续 Phase 4/5，集成（T-003）留最后。
  理由：集成即让副本发奖励，必须先有 Phase 5 的 settle 幂等兜底，否则接通即有重复领取风险；
  Phase 4 的 restore 也应先落地，避免集成后再返工。代价：主分支副本坏若干 Phase，已在看板警示。

<!-- 追加新决策：
- **YYYY-MM-DD · <决策标题>**：<结论>。理由：<为什么>。
-->

## 未决 / 待人拍板（Open questions）

> agent 遇到需要人决定的分叉，写在这里，不要自行猜测方向。

- （T-001 载体选型已拍板，见 Decision Log 2026-07-14）
