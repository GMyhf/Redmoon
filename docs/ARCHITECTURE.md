# CRIMSON RELAY 架构

## 目标与边界

本项目先建立一条可验证的纵向链路：Linux 上的 Node.js 20 权威服务器通过 HTTP 提供浏览器客户端，并通过 WebSocket 同步实时世界。macOS/Linux 当前使用同一浏览器客户端；未来 Godot 原生客户端复用版本化的公开协议。

当前实现是单进程、单区域、内存状态。它适合玩法原型和局域网测试，不承诺持久化、水平扩展、恶意客户端防护或无缝升级。

```text
macOS/Linux browser
  Canvas/UI + input
        |
        | HTTP(S) assets + WS(S) JSON messages
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
- `public/client.js`：采集键鼠输入、发送意图、渲染服务器状态。客户端不决定命中、伤害、经验或合法位置。
- `test/`：覆盖 HTTP、协议校验和核心世界规则；测试应使用可控时间与随机源，避免依赖真实网络延迟。

服务器权威模型是核心约束。客户端发送“想移动/施法”的输入，服务器验证后改变世界；这既减少客户端分歧，也为后续回放、反作弊和观战留下统一事实源。

## HTTP 与 WebSocket 协议

HTTP 表面保持很小：

| 路径 | 行为 |
| --- | --- |
| `GET /health`、`GET /api/health` | 返回进程健康 JSON，供 systemd 后的代理或监控探测 |
| `GET /...` | 提供 `public/` 文件；未知前端路由回退到 `index.html` |
| `WS /ws` | 唯一允许升级的实时连接路径 |

WebSocket 使用 UTF-8 JSON 对象，单条消息上限为 16 KiB。每条命令必须有已知 `type`；服务器拒绝二进制消息、非法 JSON、未知命令和超限负载，并将客户端数值规范化后再交给世界模拟。当前客户端消息：

| `type` | 主要字段 | 用途 |
| --- | --- | --- |
| `join` | `name`, `archetype`, `token?` | 创建会话角色。首次使用某个名字会为该账号铸造会话令牌并通过 `session` 消息下发；此后同名进入必须携带该令牌，否则返回 `INVALID_TOKEN`。同名角色在线时返回 `NAME_IN_USE`。令牌之前的旧存档仍可直接进入并就地补发令牌 |
| `input` | `seq`, `move`, `aim`, `sprint`, `moveTo?`, `target?`, `primary`, `q`, `e`, `r`, `c`, `f` | 提交有序移动、Shift 奔跑和五个技能意图（`f` 为大招）。`moveTo`（点坐标）下达点击移动指令，`target`（敌人 id）下达锁定自动攻击指令；两者缺省表示保持现有指令，显式 `null` 表示取消，键盘移动会取消所有指令 |
| `allocate` | `stat` | 消耗属性点 |
| `upgrade` | `skill` | 消耗技能点 |
| `respawn` | 无 | 请求合法重生 |
| `rebirth` | 无 | 达到解锁等级后转生：等级归一，换取永久属性点、生命与伤害加成 |
| `equip` | `item` | 装备背包中的物品（受物品等级要求限制），原部位装备换回背包 |
| `unequip` | `slot` | 卸下指定部位（weapon/armor/helm/necklace/ring/boots/charm）的装备回背包 |
| `use` | `item` | 饮用背包中的药剂恢复生命 |
| `revive` | 无 | 消耗 1 复苏露在阵亡原地满血复活 |
| `buy` / `sell` | `shop`+`good` / `item` | 在商店 NPC 附近购买商品；随时出售背包物品折算金币 |
| `partyInvite`/`partyAccept`/`partyLeave` | `target` / `from` / 无 | 组队邀请、接受与离开（上限 4 人，附近队友共享 60% 经验） |
| `friendAdd`/`friendRemove` | `name` | 好友增删（随账号持久化） |
| `autoEquip` | 无 | 每个部位自动穿上背包中强度评分最高且满足等级的装备 |
| `setAuto` | `enabled` | 开关自动战斗：站立且无指令时自动反击普攻射程内最近的敌人 |
| `setAutoLevel` | `enabled` | 开关自动加点：升级所得属性点按职业权重分配、技能点优先补最低技能（默认开启，可用 `World` 选项 `autoLevel:false` 全局关闭） |
| `attune` | `path` | 玄晓专属：立誓转向 `radiant`/`abyss`，此后每次施法名誉向该侧偏移 2 点 |
| `discard` | `item` | 丢弃背包中的物品 |

服务器消息封装：

| `type` | 主要字段 | 语义 |
| --- | --- | --- |
| `welcome` | `protocol`, `id`, `tickRate`, `snapshotRate`, `world`（含 `safeZone`、`portals`）, `rebirthLevel`, `archetypes` | 建立身份并下发初始配置。传送门成对出现：站上任一门约 0.6 秒后传送到配对门旁（步行穿过不触发），落点带 2.5 秒锁避免弹回 |
| `session` | `token`, `name` | `join` 成功后仅发给本连接：账号会话令牌。客户端存入 `localStorage`，重连与后续进入同名角色时随 `join` 一并提交 |
| `snapshot` | `tick`, `serverTime`, `selfId`, `mapId`, `world`, `safeZone`, `players`, `enemies`, `projectiles`, `drops` | 当前地图状态；玩家条目含 `mapId`、`running`、`moveTarget`、`targetId`、`rebirths`、`equipment`、`inventory`、`gearStats`，实体只包含当前地图内容 |
| `enemyAttack` | `enemyId`, `playerId`, `fromX/fromY`, `toX/toY`, `damage`, `boss` | 服务端确认近战命中时广播，客户端据此绘制挥击轨迹和命中冲击；伤害仍由世界模拟结算 |

技能槽由服务端定义解锁等级：初始开放普攻、Q、E、F；R 在 5 级、C 在 10 级开放。未解锁技能不出现在操作栏，且无法施放、升级或被自动加点选中。怪物快照提供 `damage`、`defense`、`speed`、`attackStyle`、`combatState` 和攻击前摇剩余时间，用于目标属性展示和持续可见的蓄力反馈。

客户端按当前 `mapId` 选择独立的主题缓存 Canvas；进入新区时整张可视地面切换到单一主题并淡入，不再将相邻主题拼接在同一画面。每个 `mapId` 都有自己的主题、名称、等级带、分区与传送门元数据，快照不会携带其他地图的分区、商店或安全区。服务器按 `mapId` 过滤实体和战斗目标，玩家进入传送门后切换到对应主题大地图。商店位于城镇安全区边缘之外，购买仍由服务端距离校验。

输入消息支持 `sprint`。服务端在移动计算中应用奔跑倍率、装备移速和地图地形修正；客户端根据快照中的 `running` 状态播放更大的摆腿幅度和短拖尾。奔跑不改变攻击与技能冷却规则。

掉落系统包含普通装备、遗物以及 `uniq` / `sunset` 两个特殊池。特殊池按等级和概率尝试生成，分别限制地面上同时存在的数量；掉落被拾取或过期时释放池名额。特殊物品的 `dropClass` 随掉落、背包和装备快照传递，客户端使用专属颜色与光环表现。拾取特殊装备时，若角色达到装备等级要求，服务端自动装入对应装备槽，并在 `lootPickedUp` 事件中返回 `autoEquipped: true`。

默认世界按地图维护怪物数量，而不是把固定总数随机撒在整张世界坐标上：城镇与九个主题地图各自有 16-26 只常驻怪物，补怪携带原 `mapId`。主题等级带为：暮居 1-3、旧都 2-4、回山 4-7、废料场 6-9、沙海 8-11、霜脊 10-13、城堡 12-14、星港 12-16、天城 14-18。

角色选择详情、HUD 头像和战斗世界优先加载 `public/assets/heroes/<archetype>-3d.png` RGBA 立绘。立绘由 rembg `isnet-general-use`（ISNet）生成透明 alpha，Canvas 直接绘制全身精灵，不再使用圆形/多边形裁切或屏幕混合；装备品质、武器形状和等级脚底光效仍由 Canvas 代码实时叠加，资源加载失败时回退到代码角色。

怪物采用巡逻、警戒、追击、攻击前摇、命中、脱战状态。每种怪物定义独立射程、前摇、冷却、速度、护甲和攻击类型；无目标时围绕出生点巡逻，追出活动半径后返回警戒逻辑。护甲参与服务器伤害减免，攻击前摇状态随快照广播，避免瞬时事件因帧率或网络节奏不可见。
| `event` | `event`, `tick`, `serverTime`, 事件载荷 | 短时表现或离散结果 |
| `error` | `code`, `message`, `requestType?` | 可处理的协议错误 |

当前欢迎消息携带 `protocol: 2`（v2 引入账号会话令牌：`join.token`、`session` 消息与 `NAME_IN_USE`/`INVALID_TOKEN` 错误）。发生破坏性字段变化时必须递增协议版本；进入滚动升级阶段后至少兼容相邻版本。

## 数据流与安全

1. HTTP 层限制方法、路径和静态文件根目录，防止路径穿越。
2. WebSocket 握手限制到 `/ws`；加入前的连接不能提交世界操作。
3. 网关解析并验证消息，将规范化意图放入玩家输入队列。
4. 世界模拟在 tick 边界消费最新输入，验证冷却、资源、距离和存活状态。
5. 服务器生成快照及离散事件并广播；慢连接必须限流或断开，不能拖住模拟循环。

生产环境由反向代理终止 TLS，并配置请求/消息大小、连接数、来源和速率限制。进程不应信任 `name`、坐标、客户端时间、伤害值或资产 URL。日志应记录会话 ID 和拒绝原因，但不能记录密码、令牌或完整个人信息。

## 演进路线

### 1. 可持久化服务

引入 PostgreSQL 保存账户、角色、背包、成长和审计日志。世界 tick 不直接等待数据库；通过命令/事件边界异步持久化，并以幂等事务保护奖励发放。认证、角色服务和实时世界分离后，再增加短期会话令牌。

### 2. 多区域与副本

将一个世界模拟实例演进为可独立运行的区域/副本 worker。网关负责认证和路由，调度器管理实例容量，消息总线传递组队、聊天和跨区事件。玩家转移使用带版本的状态快照和一次性票据，避免重复角色或物品。

### 3. Godot 原生客户端

先把 JSON 消息整理为版本化 schema 和协议一致性测试，再实现 Godot macOS/Linux 客户端。浏览器仍是快速试玩入口。高频快照成为瓶颈后，可在不改变玩法语义的前提下引入二进制编码、增量快照、插值与客户端预测。

### 4. 长线玩法

副本系统先做确定性实例生命周期和奖励结算；PvP 增加独立规则集、匹配评分、赛季与反串通审计；可重复成长/转生必须由服务器事务一次性结算，并保留迁移版本，避免重试导致重复奖励。
