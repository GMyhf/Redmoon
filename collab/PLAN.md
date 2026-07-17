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
| T-008 | 修复切换角色后社交面板残留上一角色队伍人数/成员 | **Done** | Codex | **Claude 复核通过**：`clearSocialPanel()` 在 `showCharacterScreen()` 里重置签名/隐藏面板/清列表/重置队伍态，修法正确。**复核他的修复时发现我自己在同一面板里重新引入了同类 bug**：`#army-create-form` 是列表之外的静态标记，`replaceChildren()` 清不掉 → 切角色后残留上一角色输入的军团名。已修 + 浏览器回归 + 变异验证（见 T-026）|
| T-009 | 为《深红中继》小说补充现有 heroes/scenes PNG 章节插图 | **Done** | Codex | **Claude 复核通过**：14 处引用全部存在、章节分布合理；他问的四图并排宽度没问题（4×180=720px < GitHub 正文栏 ~830px，且 `<p>` 内 inline `img` 窄屏自然折行）。**顺带改进**：五张角色图源文件 1024×1536 却只显示 180px 宽，仓库本就有 webp（`bulwark.png` 2.7M vs `.webp` 68K，且 ARCHITECTURE 明说运行时默认 webp）→ 已换，角色图 12M→260K、全书 35M→24M。场景图无 webp，留作后续 |
| T-010 | **P0 · 转生门槛与 will 定位**（`docs/IMPROVEMENT_PLAN.md` P0）：转生门槛 10 → 1000 对齐 `LEVEL_CAP`，堵住低级无限转生叠数值；`will` 明确为 P1 精炼预留货币（只补文档，不动协议） | **Done** | Claude | 人已拍板：门槛=1000、收益不变无限叠加；will 留作 P1 出口。`npm test` 159/159 + 变异测试 + 真协议端到端验证；未动 `PROTOCOL_VERSION`。待 Codex 复核 |

> ✅ 副本 worker 已通过 T-003 接入 `GameServer`；主进程仍是玩家、席位、事件路由与奖励账本的权威来源。

| T-011 | **P1 · 装备精炼 + 护炉印**（`docs/P1_REFINE_SPEC.md`）：精炼 0-4 阶、成功率 90/70/50/30、失败掉 1 阶、护炉印（复苏露购买）挡掉阶；`will` 获得出口；补上缺失的长期金币消耗池。**破坏性协议改动 → `PROTOCOL_VERSION` 2→3** | **Done** | Claude | 人已拍板：曲线 90/70/50/30、失败掉阶、护炉印收复苏露。`npm test` 166/166 + check:godot + 变异测试 ×2 + 真协议端到端 5/5。端到端抓到一个单测与 conformance 都漏掉的真 bug（序列化挑选器丢 `refine`）。数值强度（`REFINE_STEP`/费率）仍是拍脑袋，见 NOTES |

| T-012 | **P0 · R/C 职业专属化**（`docs/IMPROVEMENT_PLAN.md` P0 第三项）：8 职业的 R/C 共用 `shared:r`/`shared:c`，40 个技能里 16 个只有名字不同。更要命的是共用行为吃错属性：`shared:c` 吃敏捷，而壁垒者仅 8.8%、焚灵 9.6% 的加点进敏捷 → 五个职业的 C 属性加成近乎失效 | **Done** | Claude | 16 槽位全部专属化，最低属性占比 8.8% → 35.1%；定位与冷却不变。`world.js` 未动（加键即覆盖）。`npm test` 169/169 + 变异测试 + 八职业端到端。最激进处：壁垒者 C 做成全场唯一不位移，见 NOTES |

| T-013 | **修复 Codex 复核 P1**：浏览器纸娃娃没有已穿戴装备的精炼入口——服务端 `refineItem` 支持 equipment、教程也承诺可炼，但 UI 只有背包行有「炼」，玩家必须先卸下。补装备格入口 + 浏览器回归 | **Done** | Codex | 已修，并顺带发现第二个 bug：装备格名字截断 4 字导致 `+N` 阶数永远不显示，已挪到等级行。新浏览器用例注入 rng（原版天生 10% 会挂）|
| T-014 | **修复 Codex 复核 P2**：`docs/CRIMSON_RELAY_NOVEL.md:96` 仍写「第十级」出现转生，与 1000 级规则矛盾。T-009 已 Done，该文件不再有并发负责人 | **Done** | Codex | 改为「看见规则与其千级条件」而非解锁；第四章补抵达顶点的过渡承接时间跳跃 |

| T-015 | **R/C 显示层归位**：① 角色选择页只列 普攻/Q/E/F，**六个动作只展示四个**——T-012 让 R/C 成为职业特征后这个缺口才显出代价；② 技能显示名有两个事实源（Q/E/F 在 `public/data.js`，R/C 在服务端），导致 T-012 写的 R/C 描述无处显示；③ `client.js:685` 的 `serverSkills` 是死字段 | **Done** | Codex | 人选 A。六个动作全上角色选择页并标解锁等级；R/C 中文收进 `data.js`，服务端统一英文规范名；删死字段 `serverSkills`，让 `server` 真正派上用场。新增 `test/client-data.test.js`（首条跨 server/client 契约测试）。`npm test` 171/171 + 变异测试 + 浏览器回归。**更正：我此前报的「技能栏中英混排」是错的**，实测全中文、教程无误 |

| T-016 | **P2 第一步 · 决斗场**（`docs/IMPROVEMENT_PLAN.md` P2）：双方同意、隔离地图、无掉落、无经验、无荣誉。**只验证「伤害能路由到玩家」这条链路**——PvP 至今零存在（`src/`/`public/` 里 `pvp` 零命中），玩家投射物只检查怪物。荣誉泛化与野外战场是后续两步 | **Done** | Codex | 人已拍板 #1 闸门通过、P2 排期（见 Decision Log 2026-07-17）。隔离靠「只对该决斗 members 里的对手碰撞」；另加 `_boundsFor` 给竞技场造墙（否则四条移动路径全钳到 4800×2700 世界平面）。`npm test` 184/184 + 变异测试 ×4 + 两浏览器端到端。**我的第一版跨地图测试连挂三次变异都抓不住，已重写**，详见 NOTES。协议未破坏（仅新增指令/事件）|

| T-017 | **P2 第二步 · 荣誉**（`docs/IMPROVEMENT_PLAN.md` P2）：新增全局 `honor`。**原计划「把 Eclipse 的 reputation 泛化 + PvP 驱动」被推翻**：① 决斗不给荣誉（同意的 PvP 可刷），野外 PvP 在第三步 → 照原计划做会交付一个永不变动的死数字，正是 P0 批评 `will` 的形状；② `reputation` 是 Eclipse **主动选择的构筑轴**（符号翻转整套技能），不是社会声望，让 PvP 驱动它会和玩家自选的归属打架 | **Done** | Codex | 人选 A。参照仓库实证：`Killing Red monsters generates positive karma!`（PvE 来源）、`Honor is insufficient to upgrade.`（门禁精炼）、`To create army you must be at level %u and honor %u`（门禁军团，P3 前置）。**荣誉是门槛不是货币**，不扣除。`npm test` 189/189 + 变异测试 ×3（含「让击杀驱动 reputation」= 原计划做法，立刻挂）+ 真协议端到端 4/4。门槛值 200/400 与 精英+1/Boss+5 是我定的；荣誉暂不公开给他人，协议改动推迟到第三步一起升 |

| T-018 | **修复 Codex 复核 P1 + 一个更严重的自查发现**：① Godot 未接入决斗/荣誉（Codex 指出）；② **排查时发现 Godot 客户端在已推的 `fa4235e` 上根本无法加载**（`main.gd` Parse Error，我在 T-017 引入）；③ **`npm run check:godot` 报错却 exit 0——这个检查从来不可能失败**，识别错误的 grep 只在 CI 里 | **Done** | Codex | Godot 补齐决斗（U 应战/I 回绝）+ 荣誉 HUD + 精炼门槛禁用；parse error 已修；`check:godot` 的 grep 移进 npm script，注入同一错误可复现 exit=1；本地真跑 CI 那条无头冒烟（`joined as CI` / `smoke: joined=true`）|

| T-019 | **修复 Codex 复核 P1**：Godot 把决斗**平局显示成失败**——服务端平局时 `duelEnded.winner` 是 JSON `null`，我先 `str(winner)` 再判空串，但 GDScript 的 `str(null)` 是 `"<null>"` 不是 `""` | **Done** | Codex | 已修（先判 null 本身）。**并按 Codex 要求补了 Godot 端回归**：新增 `npm run test:godot`（原生客户端首条脚本测试，CI 已接），判定提成纯静态 `duel_end_status()`。变异验证：改回 Codex 抓到的写法 → `expected '决斗平局', got '决斗失败'`、exit=1 |

| T-020 | **P2 第三步 · 战斗区**（`docs/IMPROVEMENT_PLAN.md` P2）：开放 PvP 独立地图「血斗回廊」，荣誉的来源与风险在同一张地图上。**协议 3→4**（荣誉转公开） | **Done** | Codex | 人拍板：① 只赌金币+荣誉、**装备与经验不掉**（无银行/邮件/交易兜底）；② 反刷用**荣誉转移上限=对方实际拥有量**（小号无可夺、互喂零和）。`npm test` 200/200 + 变异 ×3 + 真协议端到端 6/6。**暴露并补上了协议漂移守护**：服务端升 v4 后 189 测试全绿而两客户端都连不上。未做红月的 `BattleMatch`（需 P3 阵营 + P5 调度器）|

| T-021 | **P3 第一步 · 军团**（`docs/IMPROVEMENT_PLAN.md` P3）：建立需等级 30 + 荣誉 100（荣誉第二个读者，只检查不扣除）、军衔、招募需同意、转让需接掌、解散、军团频道、团名唯一 | **Done** | Codex | **军团无独立存储**：它是「所有声明该名字的账号」→ 零 schema 迁移，代价是查询扫账号。`npm test` 213/213 + 变异 ×5 + 真协议端到端 7/7 + 两浏览器 + Godot 真冒烟。**抓到并补上 codec 逐字段对拍**：`PLAYER_BASE` 加字段而 binary1 漏写 → 200 全绿但 Godot 看不到军团（同 `refine` 那次形状）|

| T-022 | **修复 Codex 复核 P1**：军团邀请在邀请方被逐出/降级后仍可使用——`acceptArmy` 未复查邀请方当前军团与军衔 | **Done** | Codex | 已修（接受时复查）。**按一类而非一个处理**：`acceptDuel`/`acceptArmyTransfer` 本就有复查，`acceptParty` 核对后确认无此洞（队伍无军衔）。两条回归先证明会挂再修 + 变异验证。`npm test` 215/215 |

| T-023 | **修复 Codex 复核 P1 残留**：`acceptArmy` 复查漏 `connectionDetached`（断线保席五分钟、记录仍在）。**核对同类又查出 `acceptArmyTransfer` 同漏**（Codex 未提） | **Done** | Codex | **改类不改实例**：「玩家此刻算不算数」散落十处、写法各异，含两处既有邀请补发同样漏检 → 收成单一 `_isActor()`。两条回归先证明会挂再修 + 变异验证。`npm test` 217/217 |

| T-024 | **P3 第二步 · 阵营**（`docs/IMPROVEMENT_PLAN.md` P3）：自由邦/契约同盟，属于军团而非个人。**血斗回廊里同阵营互不可攻击、跨阵营才能开火**；无阵营者仍人人可打。**协议 4→5**（阵营转公开） | **Done** | Codex | 人拍板「阵营当天就要有用」，避免第三个死字段。**我主动堵的洞**：可切换阵营 = 逃生按钮 → 一经宣誓不可更改。`npm test` 225/225 + 变异 ×3（含 `null==null` 陷阱：两个无阵营者会互当友军、躺平无敌）+ 真协议端到端 8/8 + Godot 真冒烟。**上轮补的协议漂移守护与 codec 对拍这轮自动接住了新字段** |

| T-025 | **P3 第三步 · 要塞**（`docs/IMPROVEMENT_PLAN.md` P3）：每阵营 20 层、一层一军团、**租而非占**，租金周期扣、付不起即失去。收益 = **血斗回廊前线重生点** | **Done** | Codex | 这一步形状比死字段更糟——**纯成本**（参照里银行/仓库独立，大厅不是储物间），人拍板收益。**我给人的选项前提写错并当场更正**：回廊阵亡实测**仍留在回廊**、落在城镇坐标套错地图的 (2400,1350)，即上一轮交付的战斗区**死亡几乎无代价**；现已修。`npm test` 234/234 + 变异 ×4 + 真协议端到端 5/5 + Godot 真冒烟。**未解歧义**：`Army must occupy the HQ to have access` 与「直接租层」矛盾，HQ 是否为攻城独立目标留第四步 |

| T-026 | **复核 Codex 的 T-008/T-009**（我欠了十三轮的对等复核）+ 修复复核中发现的自身同类 bug：`#army-create-form` 是社交列表之外的静态标记，切换角色时 `replaceChildren()` 清不掉 → 残留上一角色输入的军团名 | **Review** | Claude | T-008/T-009 均通过并标 Done。自身 bug 已修 + 浏览器回归 + 变异验证。小说角色图改用既有 webp：12M→260K |

| T-027 | **复核 T-026**（我欠的对等复核 + 军团名残留修复 + 小说图片改 webp） | Done | Codex | 顺位最前：它是当前唯一挂在 Review 的任务 |
| T-028 | **数值审计**：`REFINE_STEP`/精炼费率、荣誉门槛 200/400 与 精英+1/Boss+5、战斗区 10%金/10荣誉、军团 30级/100荣誉/40人、要塞 20层/4000金/30分钟/集结点坐标、阵营命名 —— **这些全是 Claude 拍的，人只定过方向，至今无人复核**。它们共同决定经济与手感 | Done | Codex | **我是最不该审这个的人（数字是我编的）**。建议做法：按 1→1000 的成长曲线算出「一件 +4 装备的真实代价」「战斗区一小时的金币净流」「大厅租金占中期收入的比例」，指出哪些数量级明显不对。不必给出正确答案，指出「这个数站不住」就够 |
| T-029 | **P3 第四步 · 攻城**（实现方 = Codex，复核方 = Claude，**角色对调**） | **Done** | Codex | **Claude 复核通过（第二轮）**：四道判定重新变异，**4/4 全部被抓住**（上轮 4/4 全绿）；`siegeAt` 持久化校验与离线分支 scope 已补。上轮问题：：四道判定（距离/冷却/位置/军衔）**删掉任何一道，235 条测试全绿**——唯一那条测试把指挥官正好放在 HQ 坐标上、只攻一次、本来就在战斗区、本来就是统领，四道判定一次都没触发；六个错误码只测到 `SIEGE_FRIENDLY_HQ`。另：攻城无战斗/无守方/无时长（离线方也挡不住），离线目标分支 `armyHallLost` 无 scope → 全服广播，`siegeAt` 未纳入持久化校验。 赌注参照已写明：`- Defeat: Hall lost if your Army rents one`、`evict them from their Hall.`、`if no hall free army disbands.`（没有大厅，组织本身解散）。已定案：HQ 是大厅楼层之外的独立目标；T-029 已实现距离、阵营、楼层和冷却校验**角色对调的理由见 Decision Log** |
| T-030 | **逐职业 tick 级伤害基线**（Codex 在复核 T-012 时提的非阻断建议，一直没做） | Done | Codex | 需要先定义「基线该长什么样」——这是设计工作，不是补测试。Claude 当时判断不该在修复轮里塞一个没设计过的数值快照 |
| T-031 | **场景图转 webp**：小说仍有 24MB 场景 PNG（角色图已从 12M 降到 260K）。`public/assets/scenes/*.png` 无 webp 变体 | Done | Codex | 已用 Chrome Canvas WebP 编码生成 9 张 `1536x1024` WebP，小说与架构文档已切换引用；原 PNG 保留为源资产，单张约 282-388KB |
| T-032 | **Godot 双客户端端到端回归**：决斗与军团都需要两个客户端 | **Review** | Codex | 已修复持久化污染：`tools/godot-e2e.mjs` 改用 `persistPath: ""` 隔离账号状态；连续 3 次 E2E 均 exit 0，回交 Claude 复核 |

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

- **2026-07-18 · 人拍板：T-027…T-032 六条全部交给 Codex**。含数值审计（T-028）与攻城（T-029，角色对调）。
  Claude 的角色转为复核方与红队。理由见下一条。

- **2026-07-18 · T-029 起角色对调：Codex 实现、Claude 复核**。此前十三轮固定为
  Claude 实现 / Codex 复核，效果很好——但它也意味着**只有 Claude 的盲区被系统性检查过**。
  Codex 抓到的每一条都指向同一形状：我以为验证过的地方（纸娃娃只验服务端没验 UI、`check:godot` 永不失败、
  平局只验能解析没验能跑对、两条邀请漏 `connectionDetached`）。**Claude 的复核能力至今没被测过。**
  攻城是 P3 最后一步、赌注最大（输了丢租约，`if no hall free army disbands` 甚至暗示组织解散），
  正适合对调：Codex 实现，Claude 当红队。理由：单向复核只能发现一方的盲区。

<!-- 追加新决策：
- **YYYY-MM-DD · <决策标题>**：<结论>。理由：<为什么>。
-->

## 未决 / 待人拍板（Open questions）

> agent 遇到需要人决定的分叉，写在这里，不要自行猜测方向。

- （T-001 载体选型已拍板，见 Decision Log 2026-07-14）
