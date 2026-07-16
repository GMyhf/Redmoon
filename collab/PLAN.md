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
| T-004 | **Phase 6 · 副本 worker 硬化**：I1 异步 tick 链背压、跨 worker 故障/epoch 端到端回归、跨机调度演练、协议 conformance、容量/压力门 | **Done（代码侧）** | Codex | I1 背压（`c7b159f`）+ 跨 worker 故障/epoch（`ddaa655`）+ 8 副本并发压力门（`5afe047`）+ 协议 conformance 核对（无票据/密钥泄客户端）全过审。**跨机调度演练留运维/部署阶段**（需外部实例状态存储，见 Decision Log） |
| T-002 | 去抖：`server-http` "隐藏浏览器…partyInvited"用例在 `199bfc5` 前即 ~1/2 随机失败，污染"npm test 全绿"闸门 | **Done** | Codex | `624919c` 根因真修（`next()` 加 predicate 等特定 `partyInvited`，消除错抓竞争），纯测试改动不放宽断言。复核：server-http 连跑 **12/12**（原 ~1/2）+ 全套 **159/159 两遍**。`npm test` 现稳定全绿 |
| T-005 | 更新 `README.md` 路线图：标 **#2 副本独立化完成**（迁 child_process worker、票据 + 跨 worker checkpoint 续接、reward-once、活线可玩），仅"跨机调度演练"留部署阶段 | **Done** | Codex | `eb46d9e` 复核通过：#2 标"（已完成）"、技术描述准确、末句诚实标注"跨机调度演练仍属后续运营阶段"、未重复记 CHANGELOG |
| T-006 | **#3 Godot 发布验证（首交付：可验证块 + 诚实清单）**：三平台 `export_presets.cfg` + Linux headless 导出烟测接 CI + `RELEASE.md` 发布清单（签名/输入法/macOS·Windows 真发布如实列为部署阶段待办，不冒充已完成） | **Done** | Codex | G1 修复（`78b1350`）复核通过：目标目录改点号 `4.3.stable`。**Claude 本机真跑整条导出**（下真模板→`--export-release`→64MB 二进制 + CI 三断言全过）。#3 剩余真机项（签名/IME/跨平台）在 RELEASE.md 部署阶段待办 |

| T-007 | **文档同步**：① `docs/DUNGEON_WORKERS.md` 里程碑给 Phase 0/1/2/3b/4/5/6 补"（已完成）"标注（Phase 6 保留"跨机演练留部署阶段"的诚实措辞）② `README.md` 路线图 #3 反映 T-006 首交付进展（export 预设 + CI Linux 导出烟测 + RELEASE.md），签名/IME/跨平台真发布仍列部署阶段、**不冒充 #3 全完成** | **Done** | Codex | `23c08cb` 复核通过：八个 Phase 全标注（6 保留跨机诚实措辞）；README #3 标"（首交付已落地，进行中）"、非"已完成"、诚实分栏。全仓文档同步闭环 |
| T-008 | 修复切换角色后社交面板残留上一角色队伍人数/成员 | **Review** | Codex | 清理角色屏幕与社交缓存，并补浏览器回归测试；待 Claude 复核 |
| T-009 | 为《深红中继》小说补充现有 heroes/scenes PNG 章节插图 | **Review** | Codex | 已按章节语境嵌入仓库现有 PNG 资产；不新增重复图片文件 |
| T-010 | **P0 · 转生门槛与 will 定位**（`docs/IMPROVEMENT_PLAN.md` P0）：转生门槛 10 → 1000 对齐 `LEVEL_CAP`，堵住低级无限转生叠数值；`will` 明确为 P1 精炼预留货币（只补文档，不动协议） | **Review** | Claude | 人已拍板：门槛=1000、收益不变无限叠加；will 留作 P1 出口。`npm test` 159/159 + 变异测试 + 真协议端到端验证；未动 `PROTOCOL_VERSION`。待 Codex 复核 |

> ✅ 副本 worker 已通过 T-003 接入 `GameServer`；主进程仍是玩家、席位、事件路由与奖励账本的权威来源。

| T-011 | **P1 · 装备精炼 + 护炉印**（`docs/P1_REFINE_SPEC.md`）：精炼 0-4 阶、成功率 90/70/50/30、失败掉 1 阶、护炉印（复苏露购买）挡掉阶；`will` 获得出口；补上缺失的长期金币消耗池。**破坏性协议改动 → `PROTOCOL_VERSION` 2→3** | **Review** | Claude | 人已拍板：曲线 90/70/50/30、失败掉阶、护炉印收复苏露。`npm test` 166/166 + check:godot + 变异测试 ×2 + 真协议端到端 5/5。端到端抓到一个单测与 conformance 都漏掉的真 bug（序列化挑选器丢 `refine`）。数值强度（`REFINE_STEP`/费率）仍是拍脑袋，见 NOTES |

| T-012 | **P0 · R/C 职业专属化**（`docs/IMPROVEMENT_PLAN.md` P0 第三项）：8 职业的 R/C 共用 `shared:r`/`shared:c`，40 个技能里 16 个只有名字不同。更要命的是共用行为吃错属性：`shared:c` 吃敏捷，而壁垒者仅 8.8%、焚灵 9.6% 的加点进敏捷 → 五个职业的 C 属性加成近乎失效 | **Review** | Claude | 16 槽位全部专属化，最低属性占比 8.8% → 35.1%；定位与冷却不变。`world.js` 未动（加键即覆盖）。`npm test` 169/169 + 变异测试 + 八职业端到端。最激进处：壁垒者 C 做成全场唯一不位移，见 NOTES |

| T-013 | **修复 Codex 复核 P1**：浏览器纸娃娃没有已穿戴装备的精炼入口——服务端 `refineItem` 支持 equipment、教程也承诺可炼，但 UI 只有背包行有「炼」，玩家必须先卸下。补装备格入口 + 浏览器回归 | **Review** | Claude | 已修，并顺带发现第二个 bug：装备格名字截断 4 字导致 `+N` 阶数永远不显示，已挪到等级行。新浏览器用例注入 rng（原版天生 10% 会挂）|
| T-014 | **修复 Codex 复核 P2**：`docs/CRIMSON_RELAY_NOVEL.md:96` 仍写「第十级」出现转生，与 1000 级规则矛盾。T-009 已 Done，该文件不再有并发负责人 | **Review** | Claude | 改为「看见规则与其千级条件」而非解锁；第四章补抵达顶点的过渡承接时间跳跃 |

| T-015 | **R/C 显示层归位**：① 角色选择页只列 普攻/Q/E/F，**六个动作只展示四个**——T-012 让 R/C 成为职业特征后这个缺口才显出代价；② 技能显示名有两个事实源（Q/E/F 在 `public/data.js`，R/C 在服务端），导致 T-012 写的 R/C 描述无处显示；③ `client.js:685` 的 `serverSkills` 是死字段 | **Review** | Claude | 人选 A。六个动作全上角色选择页并标解锁等级；R/C 中文收进 `data.js`，服务端统一英文规范名；删死字段 `serverSkills`，让 `server` 真正派上用场。新增 `test/client-data.test.js`（首条跨 server/client 契约测试）。`npm test` 171/171 + 变异测试 + 浏览器回归。**更正：我此前报的「技能栏中英混排」是错的**，实测全中文、教程无误 |

| T-016 | **P2 第一步 · 决斗场**（`docs/IMPROVEMENT_PLAN.md` P2）：双方同意、隔离地图、无掉落、无经验、无荣誉。**只验证「伤害能路由到玩家」这条链路**——PvP 至今零存在（`src/`/`public/` 里 `pvp` 零命中），玩家投射物只检查怪物。荣誉泛化与野外战场是后续两步 | **Review** | Claude | 人已拍板 #1 闸门通过、P2 排期（见 Decision Log 2026-07-17）。隔离靠「只对该决斗 members 里的对手碰撞」；另加 `_boundsFor` 给竞技场造墙（否则四条移动路径全钳到 4800×2700 世界平面）。`npm test` 184/184 + 变异测试 ×4 + 两浏览器端到端。**我的第一版跨地图测试连挂三次变异都抓不住，已重写**，详见 NOTES。协议未破坏（仅新增指令/事件）|

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

- **2026-07-17 · 人拍板：README 路线图 #1 闸门视为通过，P2（PvP）可以排期**。
  这是**调度决定**，不是「PostgreSQL 生产化全部验证完毕」的结论——备份恢复、连接故障、审计保留、
  恢复/轮换值班演练这些我（Claude）没有验证过，因此**未改动 README #1 的措辞**，不替人声称已完成。
  按 `docs/IMPROVEMENT_PLAN.md` 的 P2，PvP 分三步、每步可独立上线：
  **① 决斗场（双方同意、隔离地图、无掉落、无荣誉）→ ② 荣誉泛化 → ③ 战斗区/战场**。
  理由：第一步只验证「伤害能路由到玩家」这条最核心的链路，风险最低；荣誉与野外 PvP 都建立在它之上。

<!-- 追加新决策：
- **YYYY-MM-DD · <决策标题>**：<结论>。理由：<为什么>。
-->

## 未决 / 待人拍板（Open questions）

> agent 遇到需要人决定的分叉，写在这里，不要自行猜测方向。

- （T-001 载体选型已拍板，见 Decision Log 2026-07-14）
