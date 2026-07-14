# CRIMSON RELAY 架构

## 目标与边界

本项目建立一条可验证的纵向链路：Linux 上的 Node.js 20 权威服务器通过 HTTP 提供浏览器
客户端，并通过 WebSocket 同步实时世界；Godot 4.3 原生客户端已经复用同一份版本化协议，
覆盖成长、商店、队伍、账号与副本操作。

当前实现是单进程、单区域；战斗世界状态在内存中，账号进度默认通过 JSON 文件持久化，
长期部署可切换 PostgreSQL。它适合玩法原型和受控公开测试，尚不承诺水平扩展、完整抗滥用
防护或无缝升级。

```text
Browser                         Godot 4.3 native
Canvas/UI + input               2D renderer + input
       \                         /
        +-- HTTP(S) assets + WS(S) JSON/binary messages --+
                              |
                              v
Linux Node.js process
  HTTP static/health -> WebSocket gateway -> authoritative World
                                                |
                                         tick + snapshots
```

## 运行时组件

- `src/server/server.js`：读取 `HOST`/`PORT`（默认 `127.0.0.1:3000`），提供健康检查和 `public/` 静态文件，只允许 `/ws` 的 WebSocket 升级。
- `src/server/world.js`：拥有玩家、敌人、投射物、经验和成长状态；按固定 tick 消费输入并广播快照/事件。点击移动/锁定攻击指令、城镇安全区和转生结算都在这里权威执行。
- `src/server/definitions.js`：集中定义职业、技能、敌人和成长配置，避免客户端成为规则来源。
- `src/server/postgres-store.js`：长期部署的 PostgreSQL schema、账号 upsert 与审计事务适配器。
- `public/client.js`：采集键鼠输入、发送意图、渲染服务器状态。客户端不决定命中、伤害、经验或合法位置。
- `test/`：覆盖 HTTP、协议校验和核心世界规则；`test/browser/` 另以仓库内 CDP 驱动直接控制系统 Chrome，对真实客户端和真实 WebSocket 做交互回归，不下载浏览器包。世界测试应使用可控时间与随机源，避免依赖真实网络延迟。

服务器权威模型是核心约束。客户端发送“想移动/施法”的输入，服务器验证后改变世界；这既减少客户端分歧，也为后续回放、反作弊和观战留下统一事实源。

## HTTP 与 WebSocket 协议

HTTP 表面保持很小：

| 路径 | 行为 |
| --- | --- |
| `GET /health`、`GET /api/health` | 返回进程、在线人数、敌人数量和账号持久化状态，供 systemd 后的代理或监控探测 |
| `GET /...` | 提供 `public/` 文件；未知前端路由回退到 `index.html` |
| `WS /ws` | 唯一允许升级的实时连接路径 |

协议契约以机器可读的 schema 形式维护在 `src/server/protocol.js`（`PROTOCOL` 常量：全部命令、服务器消息、事件与错误码的字段规格），`test/protocol-conformance.test.js` 对真实服务器输出做逐字段严格校验（未记录字段即失败），并用源码扫描保证命令/事件/错误码清单与实现双向同步——原生客户端（如 Godot）应以该 schema 为准开发。下表为人读摘要。

客户端命令使用 UTF-8 JSON 对象，单条消息上限为 16 KiB。每条命令必须有已知 `type`；服务器拒绝客户端二进制消息、非法 JSON、未知命令和超限负载，并将客户端数值规范化后再交给世界模拟。服务端快照可按连接协商 `binary1`，其余消息保持 JSON。当前客户端消息：

| `type` | 主要字段 | 用途 |
| --- | --- | --- |
| `join` | `name`, `archetype`, `token?`, `nextToken?`, `protocol?`, `codec?` | 创建会话角色。首次使用某个名字会为该账号铸造会话令牌并通过 `session` 消息下发；启用持久化时，新账号必须提交客户端预先保存的高熵 `nextToken`（43-128 个 base64url 字符），它会成为新 bearer。此后同名进入必须携带正式 `token`（丢响应重试也可携带已保存的 `nextToken`），否则返回 `INVALID_TOKEN`。同名角色在线时返回 `NAME_IN_USE`。令牌之前的旧存档仍可直接进入并就地补发令牌。一个名字永久绑定一个角色：即使持有令牌，用不同职业进入同名账号也会返回 `NAME_TAKEN`，旧角色不会被覆盖。声明了 `protocol` 的客户端必须与服务器版本一致，否则返回 `PROTOCOL_MISMATCH`；未声明版本的旧客户端和脚本工具仍被接受 |
| `recover` | `name`, `code`, `nextToken?`, `protocol?`, `codec?` | 用未过期的一次性恢复码找回离线账号；启用持久化时必须先在客户端保存 `nextToken`，服务端消费恢复码并把它设为新 bearer，再像 `join` 一样回发 `session` 与首帧快照。若提交成功后的响应丢失，同一 `nextToken` 可幂等重试 |
| `recoveryIssue` | 无 | 为当前账号生成新的七天恢复码，旧码失效；持久化提交成功后才回传明文 secret |
| `sessionRotate` | `nextToken?` | 立即废止当前 bearer 并把客户端预存的 `nextToken` 设为新 bearer；启用持久化时该字段必需，提交成功后回发新 `session` |
| `input` | `seq`, `move`, `aim`, `sprint`, `moveTo?`, `target?`, `primary`, `q`, `e`, `r`, `c`, `f` | 提交有序移动、Shift 奔跑和五个技能意图（`f` 为大招）。`moveTo`（点坐标）下达点击移动指令，`target`（敌人 id）下达锁定自动攻击指令；两者缺省表示保持现有指令，显式 `null` 表示取消，键盘移动会取消所有指令 |
| `allocate` | `stat` | 消耗属性点 |
| `upgrade` | `skill` | 消耗技能点 |
| `respawn` | 无 | 请求合法重生 |
| `rebirth` | 无 | 达到解锁等级后转生：等级归一，换取永久属性点、生命与伤害加成 |
| `equip` | `item` | 装备背包中的物品（受物品等级要求限制），原部位装备换回背包 |
| `unequip` | `slot` | 卸下指定穿戴位（weapon/shield/helm/necklace/chest/belt/gloves/pants/boots/ring1-3）的装备回背包 |
| `use` | `item` | 饮用背包中的药剂恢复生命 |
| `revive` | 无 | 消耗 1 复苏露在阵亡原地满血复活 |
| `buy` / `sell` | `shop`+`good` / `item` | 在商店 NPC 附近购买商品；随时出售背包物品折算金币 |
| `partyInvite`/`partyAccept`/`partyLeave` | `target` / `from` / 无 | 组队邀请、接受与离开（上限 4 人，附近队友共享 60% 经验） |
| `friendAdd`/`friendRemove` | `name` | 好友增删（随账号持久化） |
| `autoEquip` | 无 | 每个部位自动穿上背包中强度评分最高且满足等级的装备 |
| `setAuto` | `enabled` | 开关自动战斗：站立且无指令时自动反击普攻射程内最近的敌人 |
| `setAutoLevel` | `enabled` | 开关自动加点：升级所得属性点按职业权重分配、技能点优先补最低技能（默认开启，可用 `World` 选项 `autoLevel:false` 全局关闭） |
| `setAutoEquip` | `enabled` | 开关自动装备：开启时拾取即自动穿戴更优装备（特殊掉落直接上身），并立即做一次全身择优；关闭时拾取只进背包。开关状态与自动战斗/自动加点一起随账号持久化 |
| `leave` | 无 | 返回主画面：保存账号并释放席位，同一连接可再次 `join`；服务器立即回发一份 `roster` |
| `chat` | `channel`, `text` | 聊天：`global`（全服，含大厅）/`map`（本图）/`party`（组队）。文本去控制字符、截 200 字符，0.6 秒冷却（`CHAT_TOO_FAST`）；无队伍用组队频道返回 `NO_PARTY` |
| `attune` | `path` | 玄晓专属：立誓转向 `radiant`/`abyss`，此后每次施法名誉向该侧偏移 2 点 |
| `discard` | `item` | 丢弃背包中的物品 |
| `dungeonEnter` / `dungeonLeave` | 无 | 队首在全员同图、存活且未进副本时开启确定性组队实例，或主动返回城镇 |
| `clientState` | `visible` | 浏览器报告页面是否可见；后台页暂停接收快照与世界事件，服务端权威模拟和自动战斗继续，恢复可见时立即补发完整快照。该消息只影响网关投递，不改变玩法状态 |

服务器消息封装：

| `type` | 主要字段 | 语义 |
| --- | --- | --- |
| `welcome` | `protocol`, `id`, `tickRate`, `snapshotRate`, `world`（含 `safeZone`、`portals`）, `rebirthLevel`, `archetypes` | 建立身份并下发初始配置。传送门成对出现：站上任一门约 0.6 秒后传送到配对门旁（步行穿过不触发），落点带 2.5 秒锁避免弹回 |
| `roster` | `players`（`name`/`archetype`/`level`/`mapId`） | 大厅名册：`welcome` 附带一份初始名册，未加入的连接每秒收到更新，供主画面展示在线角色 |
| `session` | `token`, `name`, `archetype` | `join`、`recover` 或 `sessionRotate` 成功后仅发给本连接；浏览器存入 `localStorage`，Godot 存入 owner-only 的 `user://session.cfg`。`archetype` 是账号的权威职业，找回时客户端必须用它纠正本地选择 |
| `recovery` | `name`, `code`, `expiresAt` | `recoveryIssue` 的单次明文结果；服务端只保存摘要，客户端必须立即展示/保管 |
| `snapshot` | `tick`, `serverTime`, `selfId`, `mapId`, `world`, `safeZone`, `players`, `enemies`, `projectiles`, `drops` | 当前地图状态，实体只包含当前地图内容。`players` 中只有本人条目携带完整数据（背包、好友、任务、技能、金币等）；好友条目为 `{name, online, id}`，在线 id 供跨地图邀请，离线时为 `null`。其他玩家为渲染所需的轻量条目（位置、血蓝、等级、装备的名称/稀有度/特殊掉落标识），不含属性数值。所有条目携带 `moveSpeed`（含地形修正、不含奔跑倍率的权威移速），客户端据此对本地角色做输入预测，服务器位置仍是最终事实。服务器对同一地图的所有接收者共享一次构建 |
| `event` | `event`, `tick`, `serverTime`, 事件载荷 | 短时表现或离散结果 |
| `error` | `code`, `message`, `requestType?` | 可处理的协议错误 |
| 事件作用域 | （内部） | 世界事件可携带网关内部的投递作用域（按图或按成员），`chatMessage` 的本图/组队频道与高频战斗事件（`enemyAttack`/`skillUsed`/`enemyDefeated`/`lootDropped`）只发给相关连接，不再全服广播；作用域字段不会出现在线上 |
| `enemyAttack` | `enemyId`, `playerId`, `fromX/fromY`, `toX/toY`, `damage`, `boss` | 服务端确认近战命中时广播，客户端据此绘制挥击轨迹和命中冲击；伤害仍由世界模拟结算 |

技能槽由服务端定义解锁等级：初始开放普攻、Q、E、F；R 在 5 级、C 在 10 级开放。未解锁技能不出现在操作栏，且无法施放、升级或被自动加点选中。怪物快照提供 `damage`、`defense`、`speed`、`attackStyle`、`combatState` 和攻击前摇剩余时间，用于目标属性展示和持续可见的蓄力反馈。

客户端按当前 `mapId` 选择独立的主题缓存 Canvas；进入新区时整张可视地面切换到单一主题并淡入，不再将相邻主题拼接在同一画面。每个 `mapId` 都有自己的主题、名称、等级带、分区与传送门元数据，快照不会携带其他地图的分区、商店或安全区。服务器按 `mapId` 过滤实体和战斗目标，玩家进入传送门后切换到对应主题大地图。商店位于城镇安全区边缘之外，购买仍由服务端距离校验。

输入消息支持 `sprint`。服务端在移动计算中应用奔跑倍率、装备移速和地图地形修正；客户端根据快照中的 `running` 状态播放更大的摆腿幅度和短拖尾。奔跑不改变攻击与技能冷却规则。

首个副本「深红中继密库」由 `src/server/dungeon.js` 纯函数按实例 ID、队伍平均等级和地图
尺寸生成，固定五名守卫与一名首领，因此测试与压力环境可完全复现。每名在线玩家最多属于
一个实例，全局默认最多 32 个实例；15 分钟未完成会发出 `dungeonFailed`、送成员回城并清理
怪物、投射物和掉落。正常城镇重生会退出实例，原地复苏才继续当前战斗；完成奖励按成员集合
只结算一次。

掉落系统包含普通装备、遗物以及 `uniq` / `sunset` 两个特殊池。特殊池按等级和概率尝试生成，分别限制地面上同时存在的数量；掉落被拾取或过期时释放池名额。特殊物品的 `dropClass` 随掉落、背包和装备快照传递，客户端使用专属颜色与光环表现。拾取特殊装备时，若角色达到装备等级要求，服务端自动装入对应装备槽，并在 `lootPickedUp` 事件中返回 `autoEquipped: true`。

默认世界按地图维护怪物数量，而不是把固定总数随机撒在整张世界坐标上：城镇与九个主题地图各自有 16-26 只常驻怪物，补怪携带原 `mapId`。主题等级带为：暮居 1-25、旧都 15-45、回山 40-110、废料场 90-210、沙海 180-360、霜脊 330-520、城堡 480-680、星港 650-860、天城 820-1000；城镇保留 1-18 的新手距离曲线。

角色选择详情、HUD 头像和战斗世界优先加载 `public/assets/heroes/<archetype>-3d.webp` RGBA 立绘。原始英雄卡面与 RGBA PNG 仍保存在同目录，作为可访问的美术参考和备用资源；运行时默认使用 WebP。立绘由 rembg `isnet-general-use`（ISNet）生成透明 alpha，Canvas 直接绘制全身精灵，不再使用圆形/多边形裁切或屏幕混合；装备品质、武器形状和等级脚底光效仍由 Canvas 代码实时叠加，资源加载失败时回退到代码角色。

九张环境概念图保存在 `public/assets/scenes/*.png`，用于美术参考；实际地图背景仍使用 `public/assets/textures/*.webp` 材质和 Canvas 地形渲染，不把概念图作为固定背景加载。

HUD 布局在 `localStorage` 中使用版本化的桌面/移动双配置档。桌面面板坐标以 HUD 容器为局部坐标，跨刷新恢复并钳制在容器内；≤760px 禁用拖动，折叠状态也与桌面隔离。≤400px 将属性、装备、任务和社交收为单开的标签式面板，保证 320px 宽度下顶栏、聊天和技能栏仍可操作。「重置界面」只重置当前断点配置。全局战斗快捷键会跳过 input/select/button 等已聚焦控件，药剂固定使用 `V`，避免与 `R` 技能冲突。

怪物采用巡逻、警戒、追击、攻击前摇、命中、脱战状态。每种怪物定义独立射程、前摇、冷却、速度、护甲和攻击类型；无目标时围绕出生点巡逻，追出活动半径后返回警戒逻辑。护甲参与服务器伤害减免，攻击前摇状态随快照广播，避免瞬时事件因帧率或网络节奏不可见。

当前欢迎消息携带 `protocol: 2`（v2 引入账号会话令牌：`join.token`、`session` 消息与 `NAME_IN_USE`/`INVALID_TOKEN` 错误）。发生破坏性字段变化时必须递增协议版本；进入滚动升级阶段后至少兼容相邻版本。

## 数据流与安全

1. HTTP 层限制方法、路径和静态文件根目录，防止路径穿越。
2. WebSocket 握手限制到 `/ws`；加入前的连接不能提交世界操作。
3. 网关解析并验证消息，将规范化意图放入玩家输入队列。
4. 世界模拟在 tick 边界消费最新输入，验证冷却、资源、距离和存活状态。
5. 服务器生成快照及离散事件并广播；慢连接必须限流或断开，不能拖住模拟循环。每条连接有令牌桶消息限流（默认容量 120、每秒回填 60，可通过 `rateLimit` 选项配置）：超限消息直接丢弃并以每秒最多一条 `RATE_LIMITED` 错误提示，防止指令洪泛占用模拟循环 CPU。

生产环境由反向代理终止 TLS，并配置请求/消息大小、连接数、来源和速率限制。进程不应信任 `name`、坐标、客户端时间、伤害值或资产 URL。日志应记录会话 ID 和拒绝原因，但不能记录密码、令牌或完整个人信息。

凭据变更使用客户端先生成、再持久化、最后提交的 `nextToken`。官方客户端只有在本地 pending
token 保存成功后才发出新建账号、找回或轮换请求；服务端提交账号摘要后才发送 `session`。
这样即使响应在提交后丢失，客户端仍可用 pending token 重试，而持久化存储和日志始终不保存明文。
业务错误不能证明提交未发生，因此不会删除语法有效的 pending；只有成功保存权威 `session` 才确认
提升。客户端会丢弃并重建不满足 43-128 位 base64url 语法的本地 pending，正确正式 token 也不会
被一个损坏的可选 pending 阻断。

### 运行时隔离、心跳与就绪

网关每 15 秒发送 WebSocket ping；连接在下一轮仍未 pong 时强制终止。快照是可丢弃的
状态帧：单连接 `bufferedAmount` 达到 256 KiB 时先跳帧且不做该连接的序列化，恢复后继续；
连续跳过 50 个可丢弃帧后暂停该连接的世界事件投递，缓冲排空即自动恢复；积压达到 2 MiB
才执行硬断开。阈值通过 `WS_HEARTBEAT_INTERVAL_MS`、`WS_BACKPRESSURE_SKIP_BYTES`、
`WS_BACKPRESSURE_DISCONNECT_BYTES` 和 `WS_BACKPRESSURE_MAX_SKIPS` 调整。

浏览器在 `document.visibilityState` 变化时发送 `clientState`。隐藏连接不进入周期快照接收者，
也不接收可丢弃的表现事件；连接、角色模拟与自动战斗保持活动。`partyInvited` 是例外：它按目标
玩家 id 可靠定向，即使目标标签在后台或因背压暂停也会发送；恢复前台或断线续接时，网关还会
重发仍在 60 秒有效期内的待处理邀请，客户端按邀请者去重。恢复前台时网关立即补发一份完整
权威快照，因此后台标签不会因 10 Hz 状态流被浏览器节流而形成发送积压。

非主动断线默认保留原玩家席位 5 分钟（`WS_RECONNECT_GRACE_MS`，设为 `0` 可关闭）：玩家暂停
模拟并从名册/快照隐藏，但原 id、队伍和副本成员关系保持不变。同名有效 token 或 pending
`nextToken` 可在窗口内接管原对象；错误 bearer 被拒。超时、显式 `leave` 和停服仍执行完整的
副本/队伍清理与定向持久化，并以 `playerReconnected` 事件记录成功续接。断线或尚未完成认证的
保席对象不能参与新副本，也不获取普通地图的组队 XP/任务进度；已进入副本的成员关系保留到续接
或超时清理。

服务端保留最近 600 个 event-loop lag 与快照广播耗时样本，并公开三类探针：

- `/health` 是纯存活探针，始终以 200 返回世界、持久化和运行时诊断；运行时包含 Node RSS、
  V8 heap used/total、external 与 ArrayBuffer 字节数，以及后台浏览器连接数。
- `/ready` 是流量就绪探针；持久化失败、tick 超过 1 秒未成功、连续 3 次世界循环失败、
  event-loop lag p99 超过 250 ms、快照广播 p99 超过 250 ms，或任一 WebSocket 积压达到
  256 KiB 时返回 503。已经隔离的后台/暂停连接不阻断新流量，仍受每连接 2 MiB 硬上限；
  响应的 `checks` 给出实际值和阈值。
- `/metrics`（及 `/api/metrics`）输出 Prometheus 文本，覆盖进程 RSS/heap、tick age/错误、lag、
  快照耗时、WebSocket 当前积压、后台/暂停连接、跳帧和心跳/背压断开计数；生产代理不向公网暴露它。

就绪阈值分别由 `READY_TICK_STALE_MS`、`READY_MAX_CONSECUTIVE_TICK_ERRORS`、
`READY_EVENT_LOOP_LAG_P99_MS`、`READY_SNAPSHOT_P99_MS`、`READY_WS_BACKLOG_BYTES` 配置。
设置 `ALLOWED_ORIGINS=https://play.example.com`（逗号分隔可配置多个）后，浏览器携带的
Origin 必须精确匹配；不带 Origin 的 Godot/原生客户端仍可接入。反向代理同时执行同样检查，
形成纵深防护。

## 已落地基础与下一步

### 1. 可扩展持久化服务

默认使用原子替换的 JSON 存档保存账户、角色、背包和成长；文件为带版本的信封结构
`{ "schema": 1, "savedAt": …, "accounts": { … } }`，旧的无版本平铺格式加载时自动迁移，
遇到比当前版本更新的 schema 拒绝启动而不是悄悄改写。加载器逐条验证账号、装备和背包
结构：单条坏记录从活动存档隔离到 `.invalid-records.json`，其余角色继续加载；整体信封损坏才
隔离整档并回退 `.bak`。存档只含令牌/恢复码 SHA-256 摘要；文件、审计 JSONL 与恢复文件
均为 0600。默认 `data/`、新建父目录和生产 systemd 状态目录为 0700；显式 `PERSIST_PATH`
指向已有自定义父目录时不会修改该目录，只有确认它专供本服务时才设置
`PERSIST_MANAGE_DIRECTORY=1` 强制管理为 0700。生产 systemd 样例已为
`/var/lib/crimson-relay` 开启该选项。

设置 `DATABASE_URL` 后，启动器先独立创建/检查 `crimson_schema_migrations`，未来 schema 在任何
业务表变更前拒绝；当前 schema v2 再创建/升级 `crimson_accounts` 与 `crimson_audit_log`。稳定
`event_id` 唯一键让同一审计事件的事务重试幂等，账号与待确认审计仍在同一事务提交。
安全命令在全局队列中串行处理；`join`/`recover`/`sessionRotate`/`recoveryIssue` 先提交再回传 secret，
数据库失败会回滚内存凭据。JSON 后端把审计追加到 `accounts.json.audit.jsonl`；若账号已落盘而
审计追加失败，secret 仍可返回，审计留在队列重试且 readiness 变红，避免把账号锁死。JSON
日志是 at-least-once：append 成功但后续 fsync 结果不明时，同 UUID 可能物理重复，消费者应按
`id` 去重；PostgreSQL 由唯一键在存储层去重。两种后端都在 HTTP 监听前完成真实写入/查询
preflight；空闲 PostgreSQL 周期仍执行 `SELECT 1`，不会用空保存伪造健康。
连接串应只放在 root-only 的 systemd EnvironmentFile，不出现在命令历史或仓库；JSON 导入工具
默认拒绝非空目标，显式 `--merge` 只 upsert 源中账号（覆盖同名、保留目标独有行）。

下一步不是再造存储接口，而是用真实 PostgreSQL 做迁移、备份恢复、连接故障和审计保留演练；
公开长期运营前还需把运行手册与告警值班固化。

### 2. 多区域与副本

当前进程内已提供第一个确定性组队副本、容量门、超时、一次性奖励和 15 秒断线保席。下一步
将实例迁移为可独立运行的 worker：网关负责认证和路由，调度器管理容量，玩家转移使用带版本
状态快照与一次性票据，并让保席状态跨 worker 续接，避免重复角色、奖励或物品。

### 3. Godot 原生客户端

版本化 schema（`src/server/protocol.js`）与协议一致性测试已完成。Godot 客户端位于
`clients/godot`：除等距渲染、二进制快照和输入外，已经覆盖属性/技能升级、商店、队伍、
自动化、转生、恢复/轮换和组队副本，并有真实服务器无头烟测。下一步优先做 macOS/Linux
打包签名、输入法和断网边界，不继续投入纯视觉装饰。浏览器继续作为完整试玩入口；二进制
快照 `binary1` 实测约为 JSON 体积的 1/3，后续再按容量证据决定是否引入增量快照。

### 4. 长线玩法

PvP、拍卖行与更多地图暂缓。账号安全、真实 PostgreSQL 运维、容量观测和副本 worker 路由
稳定后，再评估独立 PvP 规则集、匹配评分、赛季与反串通审计。
