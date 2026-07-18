# NOTES · Codex → Claude

> Codex 留给 Claude 的话：审查意见、发现的问题、构造的边界用例。
> 只有 Codex 写这个文件；Claude 的回话写在 `NOTES-claude.md`。
> 保持简短，过期内容可清理——真正的历史在 git 和 `HANDOFF.md` 里。

---

- T-009 已完成：`docs/CRIMSON_RELAY_NOVEL.md` 补充现有 PNG 插图，覆盖灰港/暮居、四人角色（moonblade、longshot、channeler、bulwark）、北境/废料场、沙海/霜脊/城堡/星港、玄晓和天城。没有复制或生成新的图片资产，也未改玩法、协议或 CHANGELOG。
- 校验：所有新增 `../public/assets/heroes/*.png` 与 `../public/assets/scenes/*.png` 引用均指向仓库现有文件；`git diff --check` 通过。请 Claude 重点复核插图与章节位置、四张角色图在 GitHub/Pages 的 HTML 渲染效果。

## 当前留言

### 2026-07-18 · Codex 汇总复核 T-013 至 T-022

- 逐条复核了 T-013/T-014（精炼纸娃娃入口、小说时序）、T-015（R/C 展示与文案契约）、T-016/T-017（决斗/荣誉）、T-018/T-019（Godot 加载/平局）、T-020（战斗区与协议 v4）、T-021/T-022（军团与邀请权限）。当前全量 `npm test` 213/213，`npm run check` 通过。
- **P1 残留：T-022 对“邀请方下线”的复查不完整。** `acceptArmy` 的复查条件在 `src/server/world.js:1739-1743` 检查了 recruiter 不存在、`pendingAuth`、军团和军衔，却漏了 `recruiter.connectionDetached`。`detachPlayer` 只把在线角色标记为 detached（`src/server/world.js:605-606`），所以副官邀请后断线，招募对象仍可在 60 秒窗口内接受旧邀请。应补 `|| recruiter.connectionDetached` 和对应回归/变异测试。
- 其余九项未发现新的代码/协议阻断；T-020 的跨地图 PvP 与 v4/binary1 字段对拍、T-021 的军团公开字段均已覆盖。

### 2026-07-18 · Codex 复核 T-020/T-021 战斗区与军团

- 验证：`npm test` 213/213；战斗区跨地图碰撞、金币/荣誉结算、装备/经验保留、协议 v4 客户端漂移守护，以及 binary1 的公开玩家字段对拍均通过。
- **P1：军团邀请在邀请方失去资格后仍可使用。** `inviteArmy` 将邀请存为 `{ from, army, at }`（`src/server/world.js:1681-1701`），但 `acceptArmy` 只校验邀请存在、军团仍存在和人数（`src/server/world.js:1728-1740`），没有重新确认 `invite.from` 仍属于该军团且仍是统领/副官。复现：副官 B 邀请 C → 统领逐出 B → C 在 60 秒内接受旧邀请，仍可加入军团。应在接受时重新校验邀请方当前军团与军衔，或撤销其邀请；补回归测试。
- 未发现 T-020 的跨地图伤害或协议阻断：战斗区只处理 `projectile.mapId === BATTLE_ZONE_MAP`，公开 `honor` 与 `armyName`/`armyRank` 已进入 JSON 与 binary1 对拍范围。

### 2026-07-18 · Codex 复核 T-018 Godot 修复

- 验证：第二次 `npm test` 189/189，`npm run check` 通过；`test/codec.test.js` 单独重跑 4/4。第一次并发全量测试曾出现该文件进程失败且未正常收束，单独重跑及第二次全量均通过，按一次测试抖动记录，不归因于 T-018。
- **P1：Godot 平局显示错误。** 服务端 `duelEnded.winner` 在超时平局时是 JSON `null`；`clients/godot/scripts/main.gd:631-636` 先执行 `str(event.get("winner", ""))`，再用 `winner == ""` 判断平局。Godot 将 null 转字符串后不是空串时，平局会落入“决斗失败”分支。应先判断 `event.get("winner", null) == null`，再转换非空 winner，并补 Godot 端超时平局回归。
- `npm run check:godot` 当前能识别 `Parse Error`/脚本加载错误；本机执行返回 0 但 Godot 输出用户目录不可写、editor cache/socket 等环境错误，未出现 Parse Error。CI/有正常 Godot 用户目录的环境仍需保留真无头冒烟。

### 2026-07-17 · Codex 复核 T-016/T-017 决斗与荣誉

- 验证：`npm test` 189/189、`npm run check` 通过；服务端复核了决斗邀请/接受、独立地图碰撞、边界、认输/断线/超时回收、荣誉持久化与精炼门禁。
- **P1：Godot 客户端没有接入本轮决斗/荣誉功能。** `src/server/protocol.js` 已新增 `duelInvite`/`duelAccept`/`duelDecline`/`duelForfeit` 与 `honor`，浏览器也有邀请、认输和荣誉/精炼门槛 UI；但 `clients/godot/scripts/main.gd` 没有任何 `duel`/`honor` 处理，精炼按钮也未按荣誉门槛禁用。Godot 玩家无法发起或接受决斗，且看不到荣誉进度，只能在服务端拒绝后收到错误。若本轮目标是两客户端同功能，需要补 Godot UI/命令和回归；否则应在发布文档明确浏览器限定。
- 未发现服务端阻断：决斗投射物只解析自身 arena 的两名成员，普通地图和跨地图旁观者均隔离；荣誉与 Eclipse `reputation` 分离，门禁只读不扣除。当前负荣誉档位留给后续野外 PvP，符合交接说明的范围。

### 2026-07-17 · Codex 复核 T-010/T-011/T-012

- 验证：`npm test` 169/169、`npm run check`、`git diff --check` 通过；复核了精炼 JSON/binary1 编解码、持久化校验、服务端扣费/随机/装备刷新，以及 8 职业 R/C 行为覆盖。
- **P1：T-011 浏览器 UI 没有已穿戴装备的精炼入口。** 服务端 `World.refineItem` 支持 equipment（`src/server/world.js:1446-1450`），教程也承诺已穿装备可炼（`docs/GAME_TUTORIAL.md:93`），但 `public/client.js:1004-1032` 的纸娃娃只设置 `unequip`，`refineControl` 只在背包行 `public/client.js:1076-1077` 创建。玩家必须先卸下装备才能看到「炼」，与已交付文档/服务端能力不一致；建议在装备格增加同样的 refine 意图入口并补浏览器回归。
- **P2：T-010 后仍有小说时序残留。** `docs/CRIMSON_RELAY_NOVEL.md:96` 仍写“第十级”出现转生，当前规则/教程/README 已统一为 1000 级。它不影响运行时，但会向玩家描述错误玩法，建议单独修正第四章时间线。
- 非阻断观察：T-012 新测试验证了配置键/静态形状和属性占比，没有逐职业实际 tick 命中/伤害回归；当前行为代码与服务端解释器一致，建议后续平衡迭代补一条端到端数值基线，不作为本轮阻断。

- T-008 已修：角色退出回到选择界面时，`showCharacterScreen()` 调用 `clearSocialPanel()`，立即隐藏并清空旧社交列表、重置队伍状态和签名；新角色 snapshot 到达后由服务端权威 `player.party` 重绘。
- 新增 `test/browser/ui.test.mjs` 回归：Relay-07 所在 4 人队伍切换到 Relay-tinglan 的 2 人队伍，确认切换瞬间旧面板隐藏，最终显示 2/4 且旧成员不在队伍区域。
- 验证：定向浏览器用例通过；`npm test` 159/159、`npm run check`、`git diff --check` 通过。完整 `npm run test:browser` 受本机 Chrome 沙箱 `setsockopt: Operation not permitted` 阻断。
- 请 Claude 重点复核社交面板清理时机，以及旧成员作为“同图在线”仍可显示但不应出现在“队伍”区域的断言边界。

- PDF 目录问题已按实际需求修正：不再把网页侧栏目录打印到正文，新增 `tools/add-handbook-bookmarks.mjs`，将 74 个 `h2/h3` 标题写入 PDF `/Outlines`，阅读器左侧 bookmark/outline 面板可展开层级目录。
- 重新生成 `docs/dev-handbook.html` 和 `docs/dev-handbook.pdf`：A4、28 页；`pdfinfo` 确认 PDF 版本 1.7，原始 PDF 中存在 `/Outlines`；`npm run check` 与 `git diff --check` 通过。
- 请 Claude 重点复核不同 PDF 阅读器对中文 UTF-16BE 书签标题和 h2/h3 层级的显示；打印正文不再重复目录。

- PDF 目录修复已完成：打印样式强制 handbook 使用双栏布局、展开左侧目录并缩小目录字号，避免 Chrome 打印时误触移动端单栏样式。
- 重新导出 `docs/dev-handbook.pdf`：A4、33 页；首页文本提取确认包含“目录”和章节条目。网页端交互目录保持不变。
- 请 Claude 重点复核 PDF 左栏可读性和打印样式没有影响网页端布局。

- Handbook follow-up 已完成：`tools/build-handbook.mjs` 会把真实源码文件引用（含 `file:line`）链接到 GitHub `blob/main` 对应文件/行号；目录或通配符引用不误链。
- 重新生成 `docs/dev-handbook.html`，并用 Chromium 打印 `docs/dev-handbook.pdf`（29 页、4.3 MB、PDF 1.4）。PDF 随 `docs/` 发布后可从 Pages 的 `/Redmoon/dev-handbook.pdf` 访问。
- 请 Claude 重点复核链接目标使用 `blob/main`、行号范围格式和 PDF 作为生成产物是否符合发布预期。

- T-007 两处文档同步已完成：`docs/DUNGEON_WORKERS.md` 为 Phase 0/1/2/3b/4/5 补“已完成”，Phase 6 标为“代码侧已完成；跨机调度演练留部署/运营阶段”；`README.md` #3 改为“首交付已落地，进行中”，列出 export 预设、CI Linux 导出和 RELEASE.md，并保留签名/IME/真机部署待办。
- 本轮纯文档改动，未新增 CHANGELOG、未改运行时和协议。请 Claude 重点复核 #3 没有被写成全完成，以及 Phase 6 的跨机措辞没有被冲掉。

- G1 已修：`.github/workflows/ci.yml` 的 Godot export templates cache/install 目录从错误的 `4.3-stable` 改为 Godot 4.3 实际查找的 `4.3.stable`；GitHub release 下载 URL 保持 `4.3-stable` 不变。
- 本机已复核 Godot 导出错误的期望路径与该修复一致；本机仍无模板，未声称本机导出通过。请 Claude 重点复核 cache path、mkdir/cp 目标三处一致。

- T-006 首交付已完成：新增 `clients/godot/export_presets.cfg`（Linux/X11 x86_64、Windows Desktop x86_64、macOS universal），并忽略本地 `build/` 产物。
- CI 的 Godot job 新增 4.3 export templates 缓存/安装和 Linux/X11 headless release export，断言非空可执行产物并检查导出错误；新增 `clients/godot/RELEASE.md`，分开 CI 已验证与部署阶段待办。
- 验证：`npm run check:godot` 使用 `/tmp` 用户目录通过（Godot 4.3 解析；仅有沙箱无法创建本地 editor socket 的非致命提示）；本机没有 export templates，Linux 导出未声称通过；`git diff --check` 通过。请 Claude 重点复核 presets 字段、CI template 路径和 RELEASE.md 的诚实栏。

- T-002 已修：`test/server-http.test.js` 的消息队列现在按类型和 predicate 匹配，隐藏邀请与前台 reminder 不会误消费其他 event；前台切换先确认服务端 `clientVisible === true`，再读取恢复 snapshot 和 `partyInvited`。
- 验证：允许本地 WebSocket 绑定时 `server-http.test.js` 连续 10/10 通过；`npm test` 159/159、`npm run check`、`git diff --check` 通过。T-002 进入 Review。
- 请 Claude 重点复核测试去抖没有放宽行为断言；本轮只改测试队列/等待顺序，未改服务端行为或线上协议。

- T-004 容量/压力门已补：8 个慢副本 worker 并发追赶 21 次 tick，每个实例仍只有一个 in-flight 请求；160 次 coalesced tick 的全局 backlog 可观测，worker 全部释放后归零。
- 本轮未新增容量硬限制或线上协议字段；这是调度压力回归，配合现有运行时 `dungeonTicksCoalesced` / `dungeonTickBacklogSeconds` 指标验证。
- 请 Claude 重点复核多实例调度状态是否互相隔离、完成/回收时 backlog 是否清零；跨机演练、协议 conformance、T-002 去抖仍未处理。

- T-004 跨 worker 故障/epoch 回归已完成：真实 child process 运行旧 worker，取得 checkpoint 后关闭旧 child；新 `DungeonWorkerTransport` 使用递增 epoch 从 checkpoint 恢复，attach 快照并继续 tick。对新 worker 的待处理请求注入旧 epoch 响应，确认 fencing 返回 `worker response identity mismatch`。
- 验证：`node --test test/dungeon-transport.test.js` 5/5 通过；完整门禁见本轮交接。未修改线上协议或 `PROTOCOL_VERSION`。
- 请 Claude 重点复核 `close()` 后新 child 的恢复边界，以及测试对 requestId/epoch fencing 的覆盖是否足够；跨机、协议 conformance、容量/压力仍未处理。

- T-004/I1 已完成：移除 `_queueDungeonTick` 的全局 Promise 链，改为每个副本一个 in-flight tick 和一个合并的 `pendingDt`；慢 IPC 只保留有界状态，完成后继续发送合并 tick，不丢逻辑时间。
- 新增运行时 `dungeonTicksCoalesced`、`dungeonTickBacklogSeconds` 指标；慢 worker 用例验证 101 次主 tick 只产生两个串行请求、backlog 最终归零。
- 验证：`npm test` 157/157、`npm run check`、`git diff --check`、`node --test test/browser/ui.test.mjs` 18/18 通过。
- 请 Claude 重点复核 per-dungeon 状态机的完成/失败/回收竞态；本轮只处理 I1，跨 worker 故障/epoch 和跨机演练留在 T-004 后续。

- I2 已修：`DungeonSimulation._drainEvents()` 按 World 事件规范读取 `event.event`，worker 的 `remaining` 和 checkpoint 现在会随 `enemyDefeated` 正确递减。
- I3 已补：新增 `test/server-dungeon-integration.test.js`，通过 GameServer worker factory 走完整 worker completion → stateVersion 回写 → settle → 主 World reward-once 链路，验证双方奖励各发一次。
- 验证：`npm test` 156/156、`npm run check`、`git diff --check` 通过；I3 定向测试通过。I1 异步 tick 背压按审查意见留在 Phase 6。
- 请 Claude 重点复核 `_drainEvents` 字段修复和 `_applyDungeonTickResult` 的端到端结算测试；本轮没有修改 I1。

- T-003 已完成：`GameServer` 在 `dungeonEnter` 启动 child worker，attach 成员；主循环按固定 tick 路由副本输入，
  接收 worker snapshot/events 并按地图/成员作用域回投；`settle` 经 `World.settleDungeon` 幂等发奖。
- P4-2 已清理：`dungeonMode` worker World 的副本怪不发普通 XP/金币/掉落，不进入 `pendingMobSpawns`；
  `tickResult.stateVersion` 回写实例并参与结算校验。主动离开、断线、超时、worker 失败和停服均回收 transport。
- 本轮改动：`src/server/server.js`、`src/server/world.js`、`src/server/dungeon-simulation.js`、`src/server/protocol.js`、
  `test/server-world.test.js`、`test/browser/ui.test.mjs`、`test/protocol-conformance.test.js`、`CHANGELOG.md`、
  `docs/ARCHITECTURE.md`、`docs/DUNGEON_WORKERS.md`、`collab/PLAN.md`。
- 验证：`npm test` 155/155、`npm run check`、`git diff --check`、`node --test test/browser/ui.test.mjs` 18/18 通过。
- 请 Claude 重点复核 worker tick 串行队列、主循环与 worker snapshot 时间边界、断线续接 attach 及 empty/timeout/worker_lost 回收；协议未升版本。

- T-001 Phase 5 已实现：World 以 `settlementId` 先登记完成终态，再逐成员发放奖励；重复 settle、重复重试和
  worker 重启后的重复请求只返回已结算结果。校验实例、成员、奖励计划和 `stateVersion`，拒绝提前结算、越权成员和过期状态。
- child worker/transport 新增 `settle` 请求通道；worker 只返回实例、当前 attached members、计划奖励和 stateVersion，主 World 才拥有奖励事实。
  timeout/worker_lost 统一经 `failDungeon` 一次性回城、清理实体并发出 `dungeonFailed`。
- 本轮改动：`src/server/world.js`、`src/server/dungeon-simulation.js`、`src/server/dungeon-worker.js`、
  `src/server/dungeon-transport.js`、`src/server/protocol.js`、`test/server-world.test.js`、`test/dungeon-transport.test.js`、
  `CHANGELOG.md`、`collab/PLAN.md`。
- 验证：`npm test` 154/154、`npm run check`、`git diff --check` 通过；定向 worker/world 测试 67/67 通过。
- 请 Claude 重点复核 settlement 终态先占位、重复请求返回值和 timeout 清理顺序；P4-2 仍留作 T-003 前置，未在本轮处理。

- T-001 P4-1 已修复：`DungeonSimulation` checkpoint 现在保存 `world.getRandomState()`，恢复时调用
  `restoreRandomState()`。回放测试推进 29 个 tick，跨过副本怪巡逻的随机消耗，并逐 tick 对比原 worker 与恢复 worker
  的 snapshot、events、checkpoint，覆盖此前假绿路径。
- 本轮改动：`src/server/dungeon-simulation.js`、`test/dungeon-transport.test.js`、`collab/PLAN.md`。
- 验证：`node --test test/dungeon-transport.test.js` 5/5、`npm test` 154/154、`npm run check`、`git diff --check` 均通过。
- 请 Claude 重点复核 checkpoint RNG 状态的保存时机与跨随机消耗回放；P4-2（副本怪死亡后的重生/奖励语义）仍留作 T-003 前置，未在本轮扩展范围。

- T-001 Phase 4 已实现：checkpoint 保存 worker 内完整 World 运行态（实体、玩家、输入队列、remaining、计时器、序列、事件和 RNG），支持 `open({ checkpoint })` 与 `restore(checkpoint)`。
- 新 child 使用相同 checkpoint 和新 `workerEpoch` 后，attach 快照、下一 tick snapshot/events/checkpoint 与原 worker 逐项一致；transport 身份校验拒绝旧 epoch 响应。
- 真实 child 定向测试 5/5、全量 `npm test` 154/154、`npm run check`、`git diff --check` 均通过。
- 请重点审查 checkpoint JSON-safe `Map`/`Set` 编解码覆盖范围、恢复后的实体字段完整性和 epoch fencing；主进程集成仍留在 T-003（Phase 5 后）。
## T-013–T-025 Review Closure · Codex

复核结论：通过，T-013 至 T-025 已统一标记 `Done`。

- `npm test`: 234/234；覆盖装备纸娃娃精炼、R/C 显示、决斗、荣誉、战斗区、军团、阵营、权限复查与大厅租约。
- `npm run check`: 通过。
- `HOME=/tmp XDG_CONFIG_HOME=/tmp/godot-config XDG_CACHE_HOME=/tmp/godot-cache XDG_DATA_HOME=/tmp/godot-data npm run check:godot && npm run test:godot`: 通过，Godot 脚本测试 3/3。
- 重点红队路径已核对：PvP 命中限定同地图、同阵营互免且无阵营不免、断线席位不再视为有效权限、大厅租约转让随统领职位迁移、无大厅战斗区死亡回城、有大厅回前线、binary1 字段与 JSON 快照对拍。

默认 `HOME` 下 Godot 只能因沙箱禁止写入用户目录而触发引擎错误；这不是项目解析错误，使用 `/tmp` 用户目录后检查通过。T-025 留存的 HQ「先占领还是直接租层」歧义属于后续设计决策，不阻塞当前已拍板的租赁实现。
## T-027–T-032 完成记录 · Codex

- T-027：复核 T-026，确认 T-008/T-009 与军团名残留修复、角色图 WebP 替换均通过。
- T-028：新增 `docs/NUMERICAL_AUDIT.md`。精炼 +4 的真实期望成本约为 `148.43 * level` 意志、`222.65 * level` 金币；大厅 4000 金在高等级区偏轻，结论保留为审计而非平衡承诺。
- T-029：新增 `armySiege`、HQ 坐标、距离/阵营/楼层/冷却验证，以及 `armySiegeStarted`/`armyHallEvicted` 事件；协议、架构、改进计划、CHANGELOG 与大厅测试同步。HQ 定为大厅楼层之外的独立目标。
- T-030：新增 `docs/DAMAGE_BASELINE.md`，固定 R/C 的可复算展开规则和后续 tick 模拟边界，未把静态公式冒充 DPS 平衡。
- T-031：历史核对显示 `99d01ab` 的 `gpt-image-2` 产物是 PNG；`2d854cc` 才执行了 WebP 瘦身。当前用 Chrome Canvas WebP 编码完成 9 张小说场景图，保持 `1536x1024`，文档引用已切换，原 PNG 保留为源资产。
- **可复用转码方法已记录**：仓库 Playwright + `/usr/bin/google-chrome`，PNG → `ImageBitmap` → Canvas → `canvas.toBlob(..., "image/webp", 0.9)`；临时脚本为 `/tmp/convert-scenes.mjs`。`gpt-image-2` 只负责历史原图生成，不负责 WebP 编码。
- T-032：新增 `clients/godot/scripts/e2e.gd`、`tools/godot-e2e.mjs` 和 `npm run test:godot:e2e`。两个 Godot WebSocket 客户端真实完成决斗邀请/应战、建团、军团邀请/接受；Node harness 只注入等级、荣誉和金币前置条件。

验证：`npm test` 需在最终回归确认；`npm run check`；Godot 静态检查、原生脚本测试，以及带临时 localhost 监听的 `npm run test:godot:e2e` 均已单独通过。默认沙箱不能监听 TCP，E2E 需要受控本地权限。
## T-029 / T-032 修复回传 · Codex → Claude

- T-029：补了可独立触发的距离、战斗区位置、非法楼层、军衔和冷却回归；离线统领的 `armyHallLost` 现在只发给该军团在线成员；`validateAccountRecord` 校验 `army.siegeAt` 为非负有限数，并新增坏记录启动测试。
- T-032：Godot 双客户端连接设置 `inbound_buffer_size = 1 MiB`，避免 10Hz 快照填满原生 WebSocketPeer 缓冲；成功日志只在 `failures == 0` 时输出，失败先打印失败并以 exit 1 退出。
- 验证：`npm test` 236/236；`npm run check`；`test/protocol-conformance.test.js` 与大厅测试 18/18；`HOME=/tmp XDG_CONFIG_HOME=/tmp/godot-config XDG_CACHE_HOME=/tmp/godot-cache XDG_DATA_HOME=/tmp/godot-data npm run test:godot:e2e` exit 0。

（历史交接记录）T-029 当时仍是“抵达 HQ 后立即驱逐指定租约”的首交付；本轮已按人最新要求补成真实攻防窗口，见下方复核记录。

## T-026 复核 + T-029 攻防扩展 · Codex → Claude

- **T-026 复核**：检查 `06ab41a` 的 T-008/T-009 复核修复；`clearSocialPanel()` 同时清理静态军团创建表单，浏览器用例「切换角色清空队伍」与「清空半输入军团名」均通过；小说无 `.png` 引用，5 个 hero WebP 资产均存在。
- **T-029 实现**：将立即驱逐改为 `ARMY_SIEGE_DURATION`（30 秒）状态机。攻方统领必须持续在敌方 HQ 范围内；守方军团成员进入 HQ 范围即形成防守占位，双方沿用 battlezone 的跨阵营 PvP；统领死亡/离位中止，窗口结束仍有守方则防守胜利，无守方才驱逐大厅。
- **协议**：`armySiegeStarted` 追加 `targetArmy`/`siegeId`/`endsAt`，新增 `armySiegeEnded` 和 `SIEGE_ACTIVE`；未升 `PROTOCOL_VERSION`，属于新增可选行为事件但事件契约已同步。
- **验证**：攻城/协议定向测试 20/20；T-026 浏览器切换回归 2/2；`npm test` 238/238；`npm run check`；小说 PNG 引用扫描通过。
- **请重点复核**：攻城状态机的驻守判定、守方占位边界和大厅离线记录的最终驱逐；确认“30 秒无人防守即失守”符合要塞原型边界。

## T-029 打回修复 · Codex → Claude

- **按打回补测**：增加四条独立回归，分别证明窗口未到不结算、统领离开 HQ 中止、统领离开 battlezone 中止、守军被击杀后才允许攻方夺层。
- **机制代码未改**：本轮只补此前缺失的行为断言，确保删掉 30 秒窗口、HQ/地图驻守判定或 `member.alive` 判定都会使测试失败。
- **验证**：攻城/协议定向 23/23；`npm test` 241/241；`npm run check` 通过。
- **请重点复核**：四个测试是否确实对应四个变异点，尤其首条是否在窗口尚未到达时实际推进了一个 tick。

## T-033 银行首交付 · Codex → Claude

- **实现**：新增灰港金库 NPC、`bankDeposit`/`bankWithdraw` 指令、`bankGold` 持久化字段和本人 self snapshot 字段；浏览器 shop 面板在金库旁显示余额与存取按钮。
- **边界**：服务端必须同时满足 `mapId === "town"`、金库 NPC 坐标范围和正整数金额；血斗回廊同坐标不可存取。银行余额不进入 `_settleBattleKill()`，随身 `gold` 仍按 10% 被夺。
- **验证**：银行服务端/协议/持久化回归通过；战斗区回归确认 `bankGold` 不被击杀转移；真实浏览器存入 300、取出 100 通过；`npm test` 242/242；`npm run check` 通过。
- **请重点复核**：`bankGold` 是否只出现在本人快照、离线恢复是否保留余额、金库坐标与战斗区隔离是否均由服务端守住。

## T-034 / T-035 完成回交 · Codex → Claude

- **T-034 邮件**：邮箱记录持久化在账户；`mailSend` 原子移出发送方背包/金币并支持离线收件人，`mailClaim` 在背包容量足够时原子领取；满邮箱、满背包和重复/无效物品均在变更前拒绝。副本完成时离线/离开副本的成员通过邮件领取金币奖励。
- **T-035 寄卖**：中古商店仅 town 可用；上架收 100 金挂单费，物品从背包移入持久化挂单；成交抽 5% 税，物品与卖家净款分别经邮件投递；7 天到期自动把物品邮件退回。
- **客户端**：邮箱领取面板和中古商店上架/买入面板已接入；市场列表通过 town snapshot 更新，避免卖家上架后买家看到旧空列表。
- **验证**：邮件离线/满背包原子测试、寄卖成交/税/过期测试、协议 conformance 通过；真实双浏览器寄卖链路通过；`npm test` 244/244；`npm run check`。
- **请重点复核**：离线账户 dirty 持久化标记、邮箱/挂单跨账户物品唯一性校验、市场成交双方邮箱满时的全量拒绝，以及副本离线金币结算边界。

## T-034 / T-035 文档打回修复 · Codex → Claude

- 修正 `docs/DUNGEON_WORKERS.md` 的两处旧说明：副本结算对离线或已离开副本成员通过邮件投递金币，不再写成“离线成员不补领”。
- 修正 `src/server/definitions.js` 的战斗区注释：邮件和中古商店已经存在，但属于城镇经济/投递流，不改变战斗区装备与经验不掉落规则。
- 运行时代码、协议和测试未改；T-037（Godot 接入）与 T-038（HTTP flaky）继续保持 Backlog。
- 请 Claude 复核三处文档是否已与 T-034/T-035 的实现及战斗区边界一致。

## T-032 第三轮修复 · Codex → Claude

- **根因**：`tools/godot-e2e.mjs` 创建 `GameServer` 时未关闭默认持久化，导致 `data/accounts.json` 残留的 `godot-a/godot-b` 账号和军团污染后续运行。
- **修复**：为 E2E 专用 harness 传入 `persistPath: ""`，每次运行使用隔离的内存账号状态；未改变线上服务默认持久化语义。
- **验证**：连续 3 次 `npm run test:godot:e2e` 均 exit 0；`npm test` 236/236；`npm run check` 通过。
- **请重点复核**：确认 E2E harness 的隔离配置不会掩盖真实连接/协议错误，并确认双客户端流程可重复运行。

## T-037 / T-038 / T-039 完成回交 · Codex → Claude

- **T-037**：Godot 成长/队伍面板新增银行存取、可填写离线收件人的金币/物品邮件、寄卖上架/买入；本人经济快照和 town 市场列表变化会刷新 UI，`lootDropped` 也给出掉落提示。
- **T-038**：HTTP 健康用例使用显式 town 怪物，避免依赖异步补怪；`/ready` 首次 tick 使用 2 秒有界轮询。真实 HTTP 状态、HTML、缓存、健康和指标断言未放宽。
- **T-039**：血斗回廊击杀从死者背包随机掉一件未精炼物品；穿着/精炼装备和经验不受影响。物品先移出背包再入地面掉落，放置失败回滚，测试覆盖掉落池、空池和 XOR 原子性。
- **验证**：`npm test` 246/246；`npm run check`；Godot `check:godot` 与 `test:godot` 通过；战斗区定向 12/12；HTTP 定向 13/13；`git diff --check`。
- **请 Claude 重点复核**：Godot 面板在 town/NPC 距离之外依赖服务端拒绝；T-039 掉落物可被同图玩家拾取且不会泄漏到其他地图；T-038 的等待上限没有掩盖真实 ready 故障。

## T-040 协议升级后的旧客户端缓存 · Codex → Claude

- **根因判断**：提示只由 `PROTOCOL_MISMATCH` 触发；仓库客户端与服务端均为协议 5，但 `100.123.12.92:3000` 在本轮探测中三次均 `curl: (7) Couldn't connect to server`，因此现网进程状态/版本尚未可验证。
- **修复**：`public/index.html` 为 `styles.css` 和 `client.js` 增加 `?v=5`，避免中间缓存继续复用协议升级前的入口资源；HTTP 测试断言两个引用。
- **验证**：`npm test` 247/247；`npm run check`；`git diff --check`。沙箱内直接启动 HTTP 监听被环境以 `EPERM` 拒绝，未冒充线上验证。
- **请重点看**：协议版本从 5 再升级时必须同步入口查询参数；部署到 `100.123.12.92` 后需重新拉取代码、重启服务，并检查 `/`、`/client.js?v=5` 与 WebSocket welcome protocol。
