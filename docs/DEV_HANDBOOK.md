# CRIMSON RELAY 游戏开发教学手册

> 一份以真实项目 **CRIMSON RELAY（红月中继）** 为案例的计算机课程教学手册。
> 目标读者：正在学习「计算概论 / 程序设计 / 数据结构与算法 / 软件工程 / 操作系统 / 计算机网络 / 数据库 / 计算机安全 / 计算机图形学」的本科生，以及希望用「做一个真游戏」串联这些课程的教师。
>
> 本手册所有技术论断都指向仓库内真实代码，采用 `文件:行号` 的形式给出锚点，便于课堂现场翻阅、断点调试与布置作业。行号对应撰写时的源码，重构后可能漂移，请以函数名为准。

---

## 目录

- [0. 导言：为什么用一个在线游戏来教计算机](#0-导言为什么用一个在线游戏来教计算机)
- [1. 课程知识点全景图](#1-课程知识点全景图)
- [2. 计算概论与程序设计基础](#2-计算概论与程序设计基础)
- [3. 数据结构与算法](#3-数据结构与算法)
- [4. 软件工程](#4-软件工程)
- [5. 操作系统](#5-操作系统)
- [6. 计算机网络](#6-计算机网络)
- [7. 数据库](#7-数据库)
- [8. 计算机安全与密码学](#8-计算机安全与密码学)
- [9. 计算机图形学与人机交互](#9-计算机图形学与人机交互)
- [10. 分布式系统：副本 worker 案例研究](#10-分布式系统副本-worker-案例研究)
- [11. 课程实验与作业设计](#11-课程实验与作业设计)
- [12. 术语表与延伸阅读](#12-术语表与延伸阅读)

---

## 0. 导言：为什么用一个在线游戏来教计算机

### 0.1 项目是什么

CRIMSON RELAY 是一个**从零实现、服务器权威**的网页在线动作 RPG（ARPG）原型。它不是玩具 demo，而是一条完整的纵向链路：

```
浏览器 Canvas 客户端  ─┐                    ┌─ Godot 4.3 原生客户端
   （只发输入、只渲染） │                    │  （复用同一版本化协议）
                       ├── HTTP(S) + WS(S) ──┤
                       │   JSON / 二进制帧    │
                       v                     v
              Linux 上的 Node.js 20 权威服务器
      HTTP 静态服务 → WebSocket 网关 → 权威世界模拟 World
                                          │
                                   固定 tick + 快照广播
                                          │
                          账号持久化（JSON 文件 / PostgreSQL）
                                          │
                          确定性副本（受监督的子进程 worker）
```

整个仓库约 **2 万行代码**（`src/server` 服务端约 8000 行，`public` 浏览器客户端约 5000 行，其余为测试、工具与文档），只依赖两个第三方库：WebSocket 库 `ws` 与 PostgreSQL 驱动 `pg`。没有游戏引擎、没有打包器、没有框架黑箱——**每一个数据结构、每一个算法、每一个系统调用都直接暴露在源码里可读、可改、可调试**。

### 0.2 为什么它特别适合教学

1. **一个项目串起一整张培养方案。** 从「一个 for 循环怎么写」到「分布式系统怎么保证 exactly-once」，学生能在同一份代码里看到知识点如何层层叠加、互相咬合。
2. **核心约束天然逼出正确工程观。** 项目的第一性原理是**服务器权威**（server-authoritative）：客户端只提交「我想移动 / 我想施法」的意图，服务器验证一切、拥有一切结果。这条约束直接教会学生「不要信任输入」「单一事实源」「关注点分离」，而不是靠说教。
3. **确定性是设计出来的，不是碰运气。** 随机数可注入、时间可手动步进、世界可序列化。于是「可复现」「可测试」「可回放」从抽象原则变成能跑的代码——这是软件工程与操作系统课最难讲清、这里却随手可演示的东西。
4. **真实世界的粗糙感都在。** 背压、心跳、限流、崩溃恢复、原子写、时序攻击、schema 迁移……这些「课本讲过但没见过」的东西，这里都有生产级实现和注释说明「为什么这么写」。

### 0.3 技术栈速览

| 层 | 技术 | 关键文件 |
| --- | --- | --- |
| 运行时 | Node.js 20+（ESM 模块，`"type":"module"`） | `package.json` |
| 传输 | HTTP/1.1 + WebSocket（`ws` 库） | `src/server/server.js` |
| 序列化 | UTF-8 JSON + 可选自定义二进制帧 `binary1` | `src/server/codec.js` |
| 世界模拟 | 纯 JS 定步长模拟 | `src/server/world.js` |
| 规则数据 | 冻结的声明式配置表 | `src/server/definitions.js` |
| 持久化 | 原子 JSON 文件 / PostgreSQL | `src/server/server.js`, `postgres-store.js` |
| 副本 | `child_process` 子进程 + 管道 IPC | `src/server/dungeon-*.js` |
| 客户端 | 原生 Canvas 2D + Web Audio + DOM HUD | `public/client.js` |
| 测试 | `node:test` 确定性单测 + 自研 CDP 浏览器驱动 | `test/` |

### 0.4 怎么读这份手册

后续每一章对应一门课，结构统一为：**知识点 → 代码锚点（`文件:行号`）→ 一段解释 → 📎 课堂讨论 / 🧪 实验建议**。教师可以直接抽取任意一节作为一次课的案例；学生可以带着 `git` 检出仓库，边读边设断点。建议先通读[第 1 章的全景图](#1-课程知识点全景图)，再按自己课程挑章节。

---

## 1. 课程知识点全景图

下表把每门课的典型知识点映射到项目里最有代表性的落点。**这是全书的索引**。

| 课程 | 知识点 | 代码落点 |
| --- | --- | --- |
| **计算概论 / 程序设计** | 数据类型、定点/浮点、位运算、字节序 | `codec.js`（二进制帧、`writeFloatLE`）、`random.js`（`Math.imul`、无符号右移） |
| | 循环不变式、闭式公式、数值守卫 | `xpRequiredForLevel`、`_grantXp`（`world.js`） |
| | 模块化、纯函数、不可变数据 | `dungeon.js`（纯函数）、`definitions.js`（`Object.freeze`） |
| | 向量/矩阵几何 | `normalizedVector`、`rotate`、`worldToScreen`（`world.js` / `client.js`） |
| **数据结构与算法** | 哈希表 vs 数组、集合、队列、环形缓冲 | `Map`/`Set` 实体表、`pendingMobSpawns` 队列、`SampleWindow` 环形窗口 |
| | 有限状态机（FSM） | `_updateMobs` 怪物战斗状态机（`world.js`） |
| | 加权随机（前缀和抽样） | `rollItem` 稀有度抽样（`loot.js`） |
| | 排序 / argmin / argmax / 贪心 | `autoEquip`、`_autoAllocate`、`_trySpecialDrop`（`world.js`） |
| | 最近邻搜索、扫掠碰撞、计算几何 | `_nearestLivingPlayer`、`segmentHitsCircle`（`world.js`） |
| | 伪随机数发生器（PRNG）、哈希 | `mulberry32`、FNV-1a `hashSeed`（`random.js`） |
| **软件工程** | 分层架构、单一事实源、关注点分离 | 整体架构；`definitions.js` 为规则唯一来源 |
| | 接口契约、协议版本化、契约测试 | `protocol.js` 机器可读 schema + `protocol-conformance.test.js` |
| | 测试金字塔、依赖注入、可测性设计 | 确定性 `World` 单测 + CDP 浏览器 E2E |
| | 可观测性（liveness/readiness/metrics） | `/health` `/ready` `/metrics`（`server.js`） |
| | 协作流程、变更日志 | `collab/`、`CHANGELOG.md` |
| **操作系统** | 事件循环、非阻塞 I/O、定时器漂移 | `_startLoop` 时间累加器循环（`server.js`） |
| | 进程 vs 线程、`spawn`/`exec`、进程监督与回收 | `dungeon-transport.js` 子进程 |
| | 进程间通信（管道、消息帧） | `dungeon-ipc.js` 长度前缀帧 |
| | 文件系统原子性、`fsync`、权限位 | `_writeAccounts` 写临时文件+rename、`syncDirectory`、0600/0700 |
| | 流量控制 / 背压、令牌桶 | `_sendPayload` 背压、`_takeRateToken` 令牌桶 |
| | 信号处理、优雅停机 | `SIGINT/SIGTERM`、`close()`（`server.js`） |
| **计算机网络** | TCP / HTTP / WebSocket 握手 | `upgrade` 事件、`/ws` 限制（`server.js`） |
| | 协议设计、消息帧、字节序 | `codec.js`、`dungeon-ipc.js` |
| | 可靠有序、序列号、防重放 | `input.seq` 单调门（`world.js`） |
| | 实时同步：客户端预测与和解、插值 | `predictLocalPlayer`、`interpolateEntities`（`client.js`） |
| | 快照 vs 增量、二进制压缩 | `codec.js` `binary1`（约为 JSON 的 1/3） |
| | 反向代理、TLS、Origin/CSWSH 防护 | `deploy/`、`_originAllowed`（`server.js`） |
| **数据库** | 事务、ACID、连接池、回滚 | `postgres-store.js` `BEGIN/COMMIT/ROLLBACK` |
| | schema 迁移、版本表 | `crimson_schema_migrations`（`postgres-store.js`） |
| | UPSERT、参数化查询、幂等键 | `ON CONFLICT DO UPDATE/NOTHING`、`event_id` 唯一键 |
| | 审计日志、投递语义 | `crimson_audit_log`、at-least-once → exactly-once |
| **计算机安全 / 密码学** | 单向哈希、恒定时间比较 | `hashSecret`（SHA-256）、`timingSafeEqual`（`session.js`） |
| | 令牌、一次性恢复码、凭据轮换 | `createSessionToken`、`createRecoveryCode`（`session.js`） |
| | 先写后提交、幂等重试 | nextToken 提交协议（`server.js`） |
| | 输入不可信、路径穿越、原型污染 | `isInside`、`validateAccountRecord`（`server.js`） |
| | 能力令牌、fencing token、时序攻击防护 | 副本 HMAC 票据（`dungeon-ticket.js`） |
| **计算机图形学 / 人机交互** | 渲染循环、等距投影、相机 | `frame`、`worldToScreen`、相机平滑（`client.js`） |
| | 离屏缓存、脏矩形、剔除、深度排序 | 主题/地面缓存、`forEachVisibleTile`（`client.js`） |
| | 粒子系统、对象池、游戏手感 | 飘字、命中闪白、效果池上限（`client.js`） |
| | 事件驱动输入、焦点管理、响应式布局 | 焦点守卫、`matchMedia`、可拖拽 HUD（`client.js`） |
| | 音频合成（加法合成、包络） | Web Audio `sfx`（`client.js`） |
| **分布式系统** | 状态机复制、确定性、总序 | 副本按 `playerId` 排序输入（`dungeon-simulation.js`） |
| | 检查点 / 快照 / 故障转移 | `createCheckpoint`/`restoreCheckpoint` |
| | fencing token、脑裂防护、epoch | `workerEpoch` 身份校验（`server.js`/`dungeon-transport.js`） |
| | 幂等、去重账本、exactly-once 效果 | `dungeon.rewarded` 集合、`settlementId` |

---

## 2. 计算概论与程序设计基础

这一章面向刚入门的学生：不谈系统架构，只谈「一段好代码长什么样」。项目里到处是可以逐字讲解的微型范例。

### 2.1 数、位与字节序

**二进制帧编码器**（`src/server/codec.js`）是讲「计算机如何存数」的绝佳教材。它把高频实体数组打包成小端字节流：

- `writer.f32(x)` 用 `writeFloatLE`（`codec.js:77-81`）把 JS 的 64 位 double 截断成 IEEE-754 32 位单精度浮点写入缓冲区——顺势讲**浮点精度损失**：解码端 `f32()` 特意 `Math.round(value*1000)/1000`（`codec.js:264-266`）来让往返比较可读。
- 帧头是 `u8` 魔数 `0xB1` + `u32` 长度（`codec.js:34-35, 221-222`），讲**小端（little-endian）字节序**与「为什么要有 magic number / 版本标签」。
- 怪物的多个布尔标志压进**一个字节**：`(elite?1:0)|(boss?2:0)|(alive?4:0)`（`codec.js:150`），解码端用**位与**取回：`enemy.elite=(flags&1)!==0`（`codec.js:337-339`）。这是位运算与位掩码的干净例子。

**PRNG**（`src/server/random.js`）只有 42 行，却密集使用位运算：`Math.imul` 做 32 位整数乘法、`>>> 0` 强制无符号、`^ >>>` 异或移位混合。`hashSeed` 是标准 **FNV-1a** 哈希（`random.js:4-11`），`createRandomFromState` 是 **mulberry32** 发生器（`random.js:21-27`）。

> 📎 **课堂讨论**：为什么游戏要自己写 PRNG，而不用 `Math.random()`？（答案：需要可**播种**、可**序列化状态**，才能复现和存档——见 [3.6](#36-伪随机数与可复现性) 与 [10 章](#10-分布式系统副本-worker-案例研究)。）

### 2.2 闭式公式、循环不变式与数值守卫

经验值曲线是一个漂亮的**闭式函数**：

```js
// world.js:3123 附近  xpRequiredForLevel(level)
const base = 75 + (level - 1) * 55;
return round(base * (1 + (level - 1) / 60));   // 超线性：每级所需经验单调递增
```

而 `_grantXp`（`world.js:2475` 附近）用一个 **`while` 循环**把「一次击杀可能连升多级」处理干净，并在 `LEVEL_CAP=1000` 处封顶——这是讲**循环不变式**（每轮扣掉当前等级所需经验、等级 +1）和**边界条件**的现成例子。

数值守卫无处不在：移动用 `Math.min(speed*dt, distance)` 防止**过冲**（overshoot）；伤害用 `Math.max(1, ...)` 保证至少造成 1 点；`clamp`（`world.js:3281`）把坐标钳在竞技场边界内。

### 2.3 模块化、纯函数与不可变数据

- **纯函数**：`src/server/dungeon.js` 顶部注释直言「本模块刻意保持纯粹，使布局、缩放、奖励都易于测试」。`createDungeonPlan()` 的输出**只依赖输入参数**，无副作用，返回 `Object.freeze(...)`。这是**引用透明性**的教科书示范。
- **不可变数据**：`definitions.js` 里所有规则表都用 `Object.freeze` 深度冻结（`MOB_TYPES`、`ARCHETYPES`、`SKILL_BEHAVIORS`……）。讲「配置即数据」「防止运行时被意外篡改」。
- **声明式 vs 命令式**：技能行为 `SKILL_BEHAVIORS`（`definitions.js:306`）是**声明式**的——每个技能是 `dash`/`fan`/`burst` 三种原语的序列，由 `World._castBehavior` 解释执行。改一个技能只改数据，不碰逻辑。这引出「数据驱动设计」这一核心工程思想。

### 2.4 向量与几何（线性代数的第一次应用）

- 单位向量归一化 `normalizedVector`（`world.js:3234`）；
- 朝向 `directionTo`（`world.js:3242`）；
- **2×2 旋转矩阵** `rotate`（`world.js:3250`）用于把技能弹幕呈扇形/环形展开；
- 等距投影 `worldToScreen`（`client.js:1528`）是一个 2:1 的仿射变换。

> 🧪 **实验建议（入门）**：让学生修改 `definitions.js` 里某职业普攻的 `damage`/`range`，重启服务器观察变化，理解「规则集中定义」；再让他们给 `rotate` 写单元测试，验证旋转 90° 后向量分量。

---

## 3. 数据结构与算法

`world.js`（约 3300 行的权威模拟）是本课程最富矿的一章。

### 3.1 用对容器：Map / Set / 数组 / 队列

- **哈希表**：玩家、怪物、投射物、掉落全部用 `Map` 存储，按字符串 id 做 O(1) 增删查（`world.js:172-175`）。队伍、组队邀请、副本实例同理。讲 **哈希表 vs 线性数组的取舍**。
- **集合去重**：每个投射物带 `hitIds:new Set()`（`world.js:2344`）对「贯穿」命中去重，O(1) 判重；副本的 `members`/`remaining`/`rewarded` 也都是 `Set`。
- **时间有序队列**：`pendingMobSpawns`（`world.js:176`）是延迟事件队列，每 tick 由 `_processMobSpawns` 过滤到期项。讲**延迟任务队列 / 定时器堆**的朴素实现。
- **有界环形缓冲**：审计日志用数组 + `shift()` 在超限时淘汰最旧项（`world.js:470-482`）；运行时指标用 `SampleWindow`（`server.js:2114`）维护最近 600 个样本的滑动窗口。

### 3.2 有限状态机：怪物 AI

`_updateMobs`（`world.js:2052-2107`）是一台**手写有限状态机**，每 tick 对每只怪物跑一遍。状态与转移：

```
巡逻 Patrol ──发现玩家──> 追击 Chase ──进入射程──> 前摇 Windup ──前摇结束──> 命中 Impact
   ^                          │                                                  │
   └──────── 脱战 Leash ◄──── 目标超出牵引半径 / 进入安全区 ◄─────────────────────┘（冷却后回到追击/巡逻）
```

- **前摇（windup）**是一个「有预警的两段式攻击」：先广播 `windup` 事件、记 `attackResolveAt = time + attackWindup`，到时再结算 `impact`（`world.js:2093-2104` / `2061-2077`）。这让客户端能画出蓄力预警——顺带讲**为什么瞬时事件在网络游戏里必须状态化**。
- 每种怪的前摇/冷却/射程/护甲**数据驱动**自 `MOB_TYPES`（`definitions.js:21`）。

> 📎 **课堂讨论**：把这段代码和「形式语言与自动机」课的 DFA 定义对照——状态集、转移函数、每 tick 读一个「输入符号」（世界快照）。

### 3.3 加权随机抽样（前缀和）

`rollItem`（`loot.js:69-93`）按稀有度权重抽样：权重随等级线性增长，求总权重后 `roll = rng()*total`，再**线性扫描累减**直到 `roll<0` 命中——这正是**加权随机 / 轮盘赌选择**的标准算法（前缀和抽样）。紧接着用一个 `while(budget>0)` 循环把属性预算随机撒到四维属性上。

### 3.4 排序、极值与贪心

- **多维打分归一为标量**：`itemPower(item)`（`world.js:3133`）把装备的多项加成加权求和成一个可比较的分数（属性 ×10、伤害 ×400、防御 ×600……）。讲**比较器设计 / 多准则决策**。
- **argmax 择优**：`autoEquip`（`world.js:1315`）对每个部位在背包里做最大值扫描，只有严格更优才换装；戒指位用 `reduce` 找**最弱的一枚**替换。
- **argmin 淘汰**：背包满时 `_updateDrops`（`world.js:2813`）扫描最弱物品淘汰。
- **贪心比例分配**：`_autoAllocate`（`world.js:1254`）反复挑「当前 `已加点/权重` 最小」的属性加点，逼近目标权重 `ALLOC_WEIGHTS`；技能点则排序后补最低等级的技能槽。讲**贪心算法**。
- **过滤 + 排序流水线**：`_trySpecialDrop`（`world.js:2922`）先按 `minLevel` 过滤特殊掉落池，再按稀有度 tier 降序排序，让更稀有的池先掷。

### 3.5 最近邻搜索与扫掠碰撞（计算几何）

- **最近邻**：`_nearestLivingPlayer`（`world.js:2672`）、`_autoEngage`（`world.js:2989`）是 O(n) 线性扫描，用**平方距离**比较（`dx*dx+dy*dy < best`）避免开方。项目**刻意没有**空间索引（网格/四叉树）——这是一个绝佳的**复杂度权衡与优化空间**讨论点。
- **扫掠碰撞（连续碰撞检测）**：`segmentHitsCircle`（`world.js:3259`）把圆心投影到投射物这一 tick 走过的线段上、参数 `t` 钳在 `[0,1]`，比较平方距离与半径。这解决了「子弹太快穿过目标」（tunneling）问题。讲**点到线段距离 / 连续碰撞**。
- **椭圆命中测试**：`_zoneAt`（`world.js:3040`）用 `(dx/rx)²+(dy/ry)²≤1` 判断点是否落在主题分区椭圆内。

### 3.6 伪随机数与可复现性

`random.js` 的 mulberry32 发生器暴露 `getState()/setState()`，因此整个世界的随机流可以**保存与恢复**（`world.js` 的 `getRandomState`/`restoreRandomState`）。这把「PRNG」从算法课的孤立知识点，连接到软件工程的**可测性**与操作系统的**确定性回放**。`test/random.test.js` 验证同种子重放出相同序列、状态可序列化、非法状态被拒。

### 3.7 定步长积分（游戏循环里的算法）

`World.update(dt)`（`world.js:1616`）是**固定步长积分 + 最大子步钳制**：

```js
const steps = Math.max(1, Math.ceil(dt / 0.05));
const step  = Math.min(dt, 0.5) / steps;   // 0.5s 上限，防止一次卡顿让实体穿墙
```

每个子步按固定顺序推进：过期副本 → 玩家 → 传送门 → 怪物 → 投射物 → 掉落 → 补怪。位置更新是显式 **Euler 积分** `pos += dir*speed*dt`。这是数值方法与游戏引擎的交点。

> 🧪 **实验建议（进阶）**：让学生给 `world.js` 加一个**均匀网格空间索引**，把 `_nearestLivingPlayer` 从 O(n) 降到近似 O(1)，并用 `test/stress.test.js` 量化怪物数量增大时的收益。这是数据结构课的完整小项目。

---

## 4. 软件工程

### 4.1 架构：服务器权威与单一事实源

项目的第一性原理写在 `CLAUDE.md` 与 `docs/ARCHITECTURE.md`：**客户端发送意图，服务器验证并拥有一切结果**。落地方式：

- 规则只有**一个**来源 `definitions.js`；`publicArchetypes()`（`definitions.js:718`）在下发给客户端前**主动剥离**服务器专属数值（伤害、射程），从架构上杜绝「客户端成为规则来源」。
- 客户端 `public/data.js` 只放**表现数据**（中文标签、配色、精灵调色板），数值在运行时由 `mergeArchetypes`（`client.js:621`）从服务器合并。

讲**关注点分离**、**信任边界**、**为什么反作弊的根基是架构而非补丁**。

### 4.2 接口契约：机器可读协议 + 契约测试

`src/server/protocol.js` 把整个协议写成**机器可读的 schema**（`PROTOCOL` 常量，`protocol.js:259`）：所有客户端命令、服务器消息、事件、错误码的字段规格，配一套迷你规格语言（`?` 可选、`|null` 可空、`$array`/`$map`、strict 对象）。

配套的 `test/protocol-conformance.test.js` 做三件事，堪称**契约测试**的范本：

1. **逐字段严格校验**真实服务器输出——出现任何未文档化的字段即失败（`protocol.js:504-506`）。
2. **源码扫描双向对账**：正则扫 `world.js` 的 `case "..."`、`_emit("...")`、`WorldError("...")`，确保「实现的命令/事件/错误码」与「文档的清单」**双向一致**（`protocol-conformance.test.js:144-187`）。
3. **协议版本化**：`PROTOCOL_VERSION`（`definitions.js:3`）在破坏性变更时递增，握手不一致返回 `PROTOCOL_MISMATCH`。

> 📎 **课堂讨论**：这是「文档会腐烂」的工程解法——把文档变成**可执行的、会自检的**测试。对比 IDL（Protobuf/Thrift）的作用。

### 4.3 测试金字塔与可测性设计

项目呈现清晰的**测试金字塔**：

| 层 | 位置 | 特点 |
| --- | --- | --- |
| 快速确定性单测（底座） | `test/*.test.js`（`node:test`） | 直接驱动 `World`，注入 RNG、手动步进时间，无网络无真实时钟 |
| 协议契约测试（中段） | `protocol-conformance.test.js` | 对真实服务器输出做严格校验 |
| 浏览器端到端（顶端） | `test/browser/*.mjs` | 自研 CDP 驱动真实 Chrome，走真实协议 |

**可测性是设计出来的**：因为 `World` 接受 `{rng, spawnMobs, mobTargetCount}` 等选项、`update(dt)` 手动步进、事件走同步队列 `drainEvents()`，所以「模拟 = (种子, 命令序列, dt 序列) 的纯函数」，可以 `assert.deepEqual` 两个世界的快照完全相等（`server-world.test.js:38`）。这是**依赖注入**与**纯函数式内核**带来的红利。

自研 CDP 驱动（`test/browser/helpers.mjs`）本身就是一个教学案例：它用裸 `ws` 实现了一个「迷你 Playwright」，通过 Chrome DevTools Protocol 的 JSON-RPC 发真实鼠标/键盘事件、拦截资源请求、捕获运行时异常。讲**端到端测试、测试隔离（随机端口 + 临时目录）、真实输入 vs 合成事件**。

### 4.4 可观测性

三个探针分工明确，对应工业界 liveness/readiness 惯例：

- `/health`：纯存活探针，永远 200，报告进程/在线数/内存（`server.js:1603`）。
- `/ready`：流量就绪探针，持久化失败、tick 陈旧、事件循环 p99 超阈、快照 p99 超阈、WebSocket 积压超限任一命中即返回 503（`_readinessStatus`, `server.js:1479`）。
- `/metrics`：Prometheus 文本，导出 RSS/heap、tick、lag、快照耗时等（`server.js:1519`）。

### 4.5 协作与变更管理

仓库演示了 AI/人协作的**基于文件的事实源**流程（`collab/`）：认领任务、签名、交接说明、评审打包。`CHANGELOG.md` 只记录玩法/协议变更。这是**软件配置管理 / 团队协作**的现实样本。

---

## 5. 操作系统

Node.js 单线程事件循环模型，让操作系统的很多概念以**用户态可见**的方式出现，特别适合教学。

### 5.1 事件循环、定时器漂移与「死亡螺旋」

服务器主循环 `_startLoop`（`server.js:610`）是一个**时间累加器定步长循环**：

```js
const interval = 1000 / this.tickRate;               // 20Hz → 50ms
this._timer = setInterval(() => {
  const elapsed = now - lastTime;
  this._runtime.eventLoopLagMs.add(Math.max(0, elapsed - interval));   // 测量事件循环滞后
  backlog = Math.min(backlog + elapsed, interval * 5);                 // 追赶，但封顶 5 步
  while (backlog >= interval) { backlog -= interval; this.world.update(1/this.tickRate); }
}, interval);
```

注释直言：当事件循环繁忙、定时器迟触发时，世界用**额外的固定步**追赶，而不是悄悄变慢；同时用 5 步上限**防止死亡螺旋**（每次追赶又让下次更迟）。这是讲**调度延迟、定时器不精确、实时系统追帧**的一流案例。事件循环滞后（event-loop lag）被采样进 `SampleWindow` 算 p99，直接接入就绪探针。

### 5.2 进程 vs 线程、`spawn`、监督与回收

副本系统（`src/server/dungeon-transport.js`）用 `child_process.spawn` 启动**真正的操作系统子进程**（独立地址空间、隔离的崩溃域）运行副本模拟：

- `spawn(process.execPath, [entrypoint], {stdio:["pipe","pipe","pipe"]})`（`dungeon-transport.js:106`）。
- 通过 `child.once("exit", ...)` **收割**子进程退出（`dungeon-transport.js:111`），`child.on("error")` 检测崩溃。
- 主进程用 `Map` 维护「每实例一个 transport」的**监督注册表**（`server.js:176`），崩溃时回收并以**递增 epoch** 重启（见 [10 章](#10-分布式系统副本-worker-案例研究)）。
- 停服时 `Promise.allSettled` 有界地关闭全部 worker（`server.js:568`）。

> 📎 **课堂讨论**：代码里叫 "worker"，实际是**进程**不是线程——正好讲进程与线程的隔离性权衡（一个副本崩溃不拖垮主进程）。

### 5.3 进程间通信：管道与消息帧

IPC 走**标准输入/输出管道的字节流**（不是共享内存）。`dungeon-ipc.js` 实现**长度前缀帧**：4 字节大端头 + JSON 负载（`dungeon-ipc.js:14-17`），接收端在 `while(buffer.length>=header)` 里**跨 chunk 重组**半包（`dungeon-ipc.js:26-46`），并设 1 MiB 帧上限防内存耗尽。这是「流 vs 数据报」「粘包/拆包」的干净示例。

### 5.4 文件系统：原子性、fsync、权限位

账号 JSON 存档 `_writeAccounts`（`server.js:363`）是**崩溃一致文件更新**的经典「写临时文件 → fsync → rename」惯用法：

```js
await writeFile(tempPath, payload, { mode: 0o600 });   // 写到 .tmp
await syncFile(tempPath);                               // fsync 文件内容
await copyFile(old, bakPath);                           // 旧副本留作 .bak
await rename(tempPath, this.persistPath);               // 原子 rename(2)
await syncDirectory(dir);                               // fsync 父目录，保住目录项
```

- **`rename(2)` 的原子性**保证进程半路死掉也不会损坏存档（注释 `server.js:383`）。
- **为什么目录也要 fsync**：`rename` 产生的新目录项本身要落盘，否则掉电可能丢（注释 `server.js:424`）。这是操作系统课「write-back cache / fsync 语义」最难讲清、这里却有真实动机的一点。
- **Unix 权限位与最小权限**：存档含凭据摘要，文件 0600、目录 0700（`server.js:49-50`），且用显式 `chmod` 修正已存在文件（`mkdir/writeFile` 的 mode 只在创建时生效且受 umask 影响）。

### 5.5 背压与令牌桶

- **背压（flow control）**：`_sendPayload`（`server.js:1320`）读 `socket.bufferedAmount`（发送队列深度）：≥256 KiB 时对**可丢弃的快照帧**跳帧，连续跳 50 帧后暂停该连接的事件投递，积压达 2 MiB 才硬断开。快照是「可丢弃状态帧」，慢连接绝不能拖住模拟循环。
- **令牌桶限流**：`_takeRateToken`（`server.js:1370`）是标准令牌桶——按 `(now-refilledAt)*refillPerSecond` 回填、封顶 `capacity=120`、每条消息取 1 令牌、不足则丢弃。讲**流量整形**。

### 5.6 信号与优雅停机

`close()`（`server.js:550`）+ `SIGINT/SIGTERM` 处理器（`server.js:2167`）：清定时器、终止套接字、等待在途的安全命令队列与连接清理、最后做一次带健康检查的存档，并用 `shutdownPromise` 保证幂等。所有定时器都 `unref()` 以便进程能干净退出。

> 🧪 **实验建议**：让学生在写存档的 `rename` 前 `kill -9` 服务器，验证 `.bak` 回退与 `.tmp` 残留处理；再故意注释掉 `syncDirectory`，讨论「测试能过但掉电会丢」的可怕之处。

---

## 6. 计算机网络

### 6.1 从 TCP 到 WebSocket 握手

- HTTP 层只接受 GET/HEAD，正确返回 `Allow` 头与状态码（`server.js:1589`）。
- WebSocket 升级**只允许 `/ws`**：`httpServer.on("upgrade", ...)`（`server.js:243`）手动路由 HTTP `Upgrade` 握手，非 `/ws` 直接写 `404` 并销毁套接字。讲**协议切换（protocol switching）**。
- 消息帧有 16 KiB 上限，库层（`maxPayload`）与应用层双重强制（`server.js:930`）。拒绝二进制、非法 JSON、非对象、未知 `type`。

### 6.2 协议设计与字节序

见 [2.1](#21-数位与字节序) 的 `codec.js`。要点：自定义 `binary1` 帧把高频实体数组打包成小端二进制，低频/深层部分（世界元数据、接收者自己的完整条目）仍以内嵌 JSON 承载。**实测二进制约为 JSON 体积的 1/3**（`test/codec.test.js`）。这是「同一协议，两种编码」的对照——讲带宽/CPU 权衡。副本 IPC 的长度前缀帧（[5.3](#53-进程间通信管道与消息帧)）是另一种帧格式。

### 6.3 可靠有序与防重放：序列号

`input.seq` 单调递增；`setInput`（`world.js:1000`）里 `if (seq < player.inputSeq) return` **丢弃过期/乱序输入**。这是「在不可靠/乱序到达上重建有序语义」的最小实现，也是防重放的基础。副本票据的单调 `sequence`（`dungeon-ticket.js`）是同一思想在**分布式 fencing**上的应用。

### 6.4 实时同步：客户端预测与和解

这是网络游戏最核心的技术，`public/client.js` 有完整实现，注释块 `client.js:3870` 直接讲清了模型：

- **本地预测（dead reckoning）**：`predictLocalPlayer`（`client.js:3879`）用服务器权威的 `moveSpeed` 在本地立即推进自己，键盘移动 `speed*(sprint?1.42:1)*dt`（`SPRINT_FACTOR` 与服务器一致）。
- **软和解**：预测的同时以 `pull = 1 - exp(-Δt*0.004)` 轻轻拉向最新快照。
- **硬回正（snap）**：若与服务器位置差 > 240 像素（传送/重生/被拒移动），直接吸附到服务器位置。
- **其他实体插值**：`interpolateEntities`（`client.js:3921`）用 `factor = 1 - exp(-kΔt)` 做**帧率无关的指数平滑**。
- **输入节流 + 序列号**：`sendInput`（`client.js:3955`）限 20Hz、带单调 `seq`；`undefined` 的指令字段被 `JSON.stringify` 丢弃，于是服务器保留上一条指令——一个巧妙的「缺省=保持」协议设计。

> 📎 **课堂讨论**：为什么客户端预测能同时给出「零延迟手感」与「服务器权威防作弊」？服务器的 `seq` 门（[6.3](#63-可靠有序与防重放序列号)）是这份契约的权威一半。

### 6.5 断线重连、心跳、后台节流

- **心跳**：网关每 15 秒 `ping`，下一轮未 `pong` 则强制终止（`server.js:855`）。讲**keepalive / 活性检测**。
- **重连宽限**：非主动断线默认保留席位 5 分钟（`server.js:960`），同名有效凭据可接管原对象。讲**会话/席位预留与资源回收**。
- **客户端指数退避重连**：`min(8000, 700*2^attempt)`（`client.js:406`）。
- **Page Visibility 节流**：客户端在 `visibilitychange` 时发 `clientState`，服务器把后台标签移出快照接收者，恢复时立即补发全量快照——**用页面可见性 API 做资源控制**。

### 6.6 生产网络与安全边界

`deploy/` 提供 nginx/Caddy 反代样例（TLS 终止、WSS）。`_originAllowed`（`server.js:1364`）在 WS 升级时校验 `Origin`，防**跨站 WebSocket 劫持（CSWSH）**；反代与应用做同样检查形成纵深防御。

---

## 7. 数据库

项目提供两套存储后端，正好对照「文件 vs 数据库」。JSON 后端见 [5.4](#54-文件系统原子性fsync权限位)；本章讲 PostgreSQL（`src/server/postgres-store.js`）。

### 7.1 事务与 ACID

`saveAccounts()`（`postgres-store.js:82`）从连接池取专用连接，`BEGIN`（`:108`）… `COMMIT`（`:138`），出错 `ROLLBACK`（`:140`），`finally` 里 `client.release()`。账号与待确认审计**在同一事务提交**，保证原子性。讲**事务、连接池、回滚**。

### 7.2 schema 迁移与版本表

`initialize()`（`postgres-store.js:20`）先独立创建/检查 `crimson_schema_migrations` 版本表，读 `MAX(version)`，若**数据库 schema 比服务端新则拒绝启动**（防止旧代码改坏新表），再创建/升级业务表并 `INSERT ... ON CONFLICT DO NOTHING` 记录已应用版本。这是 Flyway/Alembic 式**迁移追踪**的最小实现。

### 7.3 UPSERT、参数化查询、幂等键

- **集合式 UPSERT**：从 JSON 数组参数 `jsonb_array_elements($1::jsonb)` 批量 `INSERT ... ON CONFLICT (account_key) DO UPDATE`（`postgres-store.js:110`）。
- **参数化查询**：一切走 `$1` 绑定，天然防 **SQL 注入**。
- **幂等审计**：审计表对 `event_id` 建**唯一索引**，插入以 `ON CONFLICT (event_id) DO NOTHING` 收尾（`postgres-store.js:54, 135`）。同一审计事件重试因唯一键去重——把「至少一次投递」变成「效果上恰好一次」。

### 7.4 投递语义与健康预检

即使没有东西要写，空刷也会发 `SELECT 1`（`postgres-store.js:99`）做**预检/活性探测**，避免「服务其实连不上库却一直报健康」。JSON 后端的审计是 **at-least-once**（append 成功但 fsync 结果不明时同 UUID 可能物理重复，消费者需按 `id` 去重）；PostgreSQL 由唯一键在存储层去重。这是分布式课「投递语义」在存储层的具体呈现。

> 🧪 **实验建议**：让学生用 `tools/migrate-postgres.mjs` 把 JSON 存档导入 PostgreSQL，再故意重放同一批审计，观察唯一键如何去重；对比 JSON 后端可能出现的重复行。

---

## 8. 计算机安全与密码学

「不信任客户端」是贯穿全项目的安全公理。本章汇总密码学与安全工程落点。

### 8.1 凭据的单向哈希与恒定时间比较

`src/server/session.js`（仅 45 行，密度极高）：

- `hashSecret`：`createHash("sha256")...digest("hex")`（`session.js:28`）。存档**只存 64 位十六进制摘要**，绝不存明文令牌。
- `secretMatches`：用 `timingSafeEqual`（`session.js:38`）做**恒定时间比较**，防**时序侧信道攻击**。
- 校验时严格要求摘要形如 `^[0-9a-f]{64}$`。

> 📎 **课堂讨论**：这里用**无盐 SHA-256** 而非 bcrypt/argon2，为什么可接受？——因为令牌是 `randomBytes(32)` 的**高熵随机值**（256 位），不是低熵人类口令，无需抗暴力/抗彩虹表的慢哈希。这是一个很好的「密码学要看威胁模型」讨论。

### 8.2 令牌、一次性恢复码、凭据轮换

- 会话令牌 `createSessionToken`：`randomBytes(32).toString("base64url")`（`session.js:5`），256 位 bearer 令牌。
- 一次性恢复码 `createRecoveryCode`：随机码 + 7 天 TTL，只存哈希（`session.js:17`），使用后立即消费（`world.js` 里 `delete record.recovery`）。
- 轮换 `rotateSession`：立即废止旧 bearer、启用客户端预存的新令牌并审计。

### 8.3 先写后提交：跨越丢包的凭据一致性

这是本项目最精巧的安全协议，讲**分布式一致性遇上凭据管理**：客户端**先在本地生成并保存** `nextToken`，服务器命令处理顺序严格为：

```
执行命令 → 捕获安全副作用 → 持久化到durable存储(await) → 标记committed → 才向客户端下发 session 令牌
```

（`server.js:1097-1132`）。于是**即使「提交成功」的响应在网络上丢了**，客户端仍可用预存的 `nextToken` **幂等重试**（`world.js` 的 `isRetry` 分支），而持久层与日志**从不保存明文**。`normalizeNextToken`（`session.js:9`）强制 `43-128` 位 base64url 语法。失败时 `_restoreSecurityCheckpoint`（`server.js:1244`）像事务一样**回滚**内存凭据。

### 8.4 输入不可信：注入、穿越、污染、DoS

- **路径穿越防护**：`isInside`（`server.js:2030`）用 `path.relative` 拒绝逃出静态根的 `../` 请求。
- **原型污染防护**：加载账号时用 `Object.fromEntries` 重建对象，使 `__proto__` 成为**自有数据属性**而非触发原型 setter（注释 `server.js:1801`）；`isPlainObject` 拒绝非普通原型。
- **有界数值校验**：`optionalInteger`/`validateNumberMap`（`server.js:1947`）给所有持久化数值设上下界，配合 `Number.isSafeInteger` 防整数溢出。
- **DoS 边界**：16 KiB 消息上限、令牌桶、1 MiB 帧上限、背压硬断开——层层限制资源占用。
- **世界层白名单校验**：`sanitizeName`（去控制字符、截 20 字）、`finitePoint`（`Number.isFinite` + 钳到 ±10 万）、布尔用 `=== true` 强校验——服务器**从不信任**客户端的坐标、瞄准幅度、伤害值。

### 8.5 能力令牌与 fencing（分布式安全）

副本票据 `dungeon-ticket.js` 是 **HMAC-SHA256 签名的能力令牌**：`signTicket` 用 `createHmac("sha256", secret)`，校验用 `timingSafeEqual` + 过期窗口，单调 `sequence` 作为 **fencing token** 在准入时挡住陈旧票据（防止被替换/重放的旧 worker 抢占）。见 [10 章](#10-分布式系统副本-worker-案例研究)。

> 🧪 **实验建议（安全）**：让学生扮演攻击者，直接用脚本连 `/ws` 发伪造的 `input`（超大坐标、负伤害、乱序 seq），观察服务器如何逐一拒绝；再尝试请求 `/../src/server/session.js` 观察路径穿越防护。理解「客户端是敌对的」。

---

## 9. 计算机图形学与人机交互

浏览器客户端 `public/client.js`（约 4600 行）用**原生 Canvas 2D**，没有任何渲染框架，是图形学入门的透明教材。

### 9.1 渲染循环与等距投影

- **单一 rAF 泵**：`frame(time)`（`client.js:3991`）计算 `delta = min(50, time-last)`（封顶避免后台切回时的巨跳），依次做 插值 → 环境 → 发送输入 → 绘制，再 `requestAnimationFrame`。
- **画家算法分层**：`drawWorld`（`client.js:1550`）按序绘制 主题层 → 大气 → 地块 → 地标 → 角色光 → 物体 → 环境 → 调色 → 小地图 → 光标。
- **2:1 等距投影**：`worldToScreen`（`client.js:1528`）是仿射变换，`TILE_W=96, TILE_H=48`；`screenToWorld`（`client.js:1535`）反变换用于点击移动与瞄准。
- **相机指数跟随**：`cameraFactor = 1 - exp(-Δt*0.005)` 平滑跟随本地玩家。

### 9.2 离屏缓存、脏矩形、剔除、深度排序

图形学性能优化在这里全是真的：

- **离屏缓存**：主题背景 `drawThemeCanvas`（`client.js:1565`）和地面地块 `rebuildGroundCache`（`client.js:2272`）渲染进离屏 canvas，只在相机漂出边距、主题切换、视口变化时才重建——**脏矩形 / 滚动缓存**。
- **可见块剔除**：`forEachVisibleTile`（`client.js:2249`）只遍历屏幕内的等距菱形块。
- **预渲染光晕精灵**：`glowSprite`（`client.js:1617`）缓存径向渐变，避免每帧昂贵的 `shadowBlur`。
- **深度排序**：`drawObjects`（`client.js:2882`）按 `(y+x)` 排序保证前后遮挡正确。
- **程序化精灵**：`drawHumanoid` 及 7+ 种怪物全用 canvas 图元（矩形、弧、二次曲线）绘制，装备从调色板叠加；若 WebP 立绘已加载则改用照片式贴图，否则回退到程序化角色。

### 9.3 粒子、对象池与「游戏手感」

- **飘字与命中反馈**：`updateEntities`（`client.js:741`）在快照间**差分 HP**，掉血 push 上升飘字 + 5 个火花粒子，命中怪物置 130ms 闪白。
- **对象池上限**：`drawEffects`（`client.js:3785`）过滤过期项并把效果池封顶 160，保证大范围 AoE 也不拖垮帧循环。讲**对象池与预算上限**。
- **预警可视化**：`drawEnemyWindup`（`client.js:3417`）把 [3.2](#32-有限状态机怪物-ai) 的前摇状态画成虚线 + 生长的目标椭圆。

### 9.4 事件驱动输入与人机交互

- **焦点守卫（可访问性）**：`keydown`（`client.js:4469`）若事件目标是 input/textarea/select/button/contenteditable，则**抑制游戏热键**，Esc 失焦、Enter 聚焦聊天。这是把「玩游戏」与「填表单」正确分离的 HCI 细节。
- **坐标空间转换**：`currentMove`（`client.js:3939`）把 WASD 归一化再旋转 45° 到等距世界轴。
- **指针捕获与点击移动**：`pointerdown`（`client.js:4536`）左键 `pickEnemy`（屏幕空间最近敌人）否则下达移动指令，右键普攻；`setPointerCapture` 处理拖动。
- **响应式/移动端**：`matchMedia("(max-width:760px)")`（`client.js:4266`）切换桌面/移动 HUD 档，手风琴面板，320px 下仍可操作；可拖拽面板位置持久化。E2E 在 390px/320px 视口测试。

### 9.5 音频合成

`initAudio`/`sfx`（`client.js:312`）用 **Web Audio** 纯合成音效：振荡器 + 增益 + `exponentialRampToValueAtTime` 包络 + 可选滑音，**无任何音频素材**。升级、Boss、掉落等事件映射到不同音符（`client.js:1247`），和弦用 `setTimeout` 错开。讲**加法合成、ADSR 包络、自动播放策略需手势解锁**（首次 `pointerdown` 时 `audioCtx.resume()`）。

> 🧪 **实验建议（图形）**：让学生给 `glowSprite` 关掉缓存改成每帧 `shadowBlur`，用浏览器性能面板量化帧时间劣化，亲眼看见「缓存换填充率」的意义。（注意：本机为无 GPU 的高负载 headless 环境，性能数字仅作相对对比。）

---

## 10. 分布式系统：副本 worker 案例研究

副本子系统（`dungeon-*.js` + `server.js` 中的调度）是一个**浓缩的分布式系统案例**：主进程是协调者，副本 worker 是可失败的工作副本，两者用「至少一次投递」的通道通信，却要保证「效果上恰好一次」。非常适合分布式系统课整章使用。

### 10.1 确定性状态机复制（SMR）

- 副本模拟是**确定性状态机**：种子 PRNG（[3.6](#36-伪随机数与可复现性)），且每 tick 内**按 `playerId` 排序**应用输入（`dungeon-simulation.js:97`），保证任何副本以相同顺序应用输入、演化出相同状态。这是 **SMR / 总序（total order）** 的核心要求。
- 实例生成是**纯函数**（`dungeon.js`），同 `instanceId` + 同队伍均等级 → 同一副本，测试与压测完全可复现。

### 10.2 检查点、快照与故障转移

- **周期检查点**：每 N tick 做一次 `createCheckpoint`（`dungeon-simulation.js:112, 132`），快照**包含 RNG 状态**，故恢复后能续跑同一随机流。
- **富类型序列化**：自定义 `encodeValue`/`decodeValue`（`dungeon-simulation.js:266`）跨 JSON 边界保留 `Map`/`Set`。
- **故障转移**：worker 崩溃后，`open` 消息携带检查点，新 worker `restoreCheckpoint` 续接（`dungeon-worker.js:126`）。检查点用 `instanceId` 绑定，防跨实例误恢复；`stateHash`（`dungeon-simulation.js:215`）做状态指纹以检测分歧。

### 10.3 epoch fencing 与脑裂防护

worker 以**单调递增的 `workerEpoch`** 启动（`server.js:699`）。每条响应都带 `{protocolVersion, instanceId, workerEpoch}`，三者任一不匹配即拒绝（`dungeon-transport.js:162`, `dungeon-worker.js:184`）。于是一个被替换的**僵尸 worker** 的迟到回复会被无视——这正是 **fencing token** 防脑裂的教科书应用。副本准入还用票据的单调 `sequence` 做同样的 fencing。

### 10.4 至少一次投递 → 恰好一次效果

这是本案例的高潮，讲**幂等接收者**：

- 通道是 at-least-once：`settle` 可能被重试/重复投递。
- 但结算是**幂等**的：`settleDungeon` 一进来先检查终态 `if (dungeon.settlement) return {..., duplicate:true}`（`world.js:914`），重试无法二次进入奖励循环。
- **去重账本**：`dungeon.rewarded` 是 `Set`，逐成员发奖前 `if (rewarded.has(id)) continue`（`world.js:952`），保证同一成员不会重复领奖。
- **幂等键**：`settlementRequestId ??= "${id}:state-${version}"`（`server.js:834`）让重试碰撞到同一 id；输入按单调 seq 去重；检查点持久化 item/drop 的 id 序列，故障转移后**不会重铸重复物品 id**。
- **乐观并发**：结算/失败都校验 `stateVersion` 必须匹配，否则 `DUNGEON_STATE_STALE`。

### 10.5 容量、超时与孤儿回收

- **准入控制**：全局最多 32 个副本实例，超限 `DUNGEON_CAPACITY`（`world.js:719`）。
- **tick 合并（背压）**：`_queueDungeonTick`（`server.js:758`）保证每实例只有一个在途 tick，重叠的 tick 被**合并**、`pendingDt` 累积——用有界消费者吸收抖动。
- **看门狗超时**：`_expireDungeons`（`world.js:892`）在 15 分钟未完成时 `failDungeon(id, "timeout")`。
- **孤儿回收**：`_tickDungeonWorkers`（`server.js:806`）回收任何「实例已不存在」的 transport——分布式版的僵尸/孤儿收割。

> 📎 **课堂讨论**：把这一节和「两阶段提交 / Paxos / Raft」对照——这里没有共识算法，而是靠**单一协调者 + 幂等 + fencing** 拿到实用的正确性。讨论其适用边界（单机主进程即单点）。

---

## 11. 课程实验与作业设计

下面按由易到难给出可直接布置的实验，每个都标注对应课程与验收方式。

### 11.1 入门级（计算概论 / 程序设计）

1. **改数值、读架构**：修改 `definitions.js` 中某职业普攻数值，重启验证；写一段话说明「为什么客户端改不了这个数值」。
2. **给几何函数写单测**：为 `rotate`、`normalizedVector`、`clamp` 补 `node:test` 用例，覆盖边界（零向量、超长向量、越界坐标）。
3. **新增一种药剂**：在 `loot.js`/`definitions.js` 加一种恢复道具，跑通商店购买与 `use` 命令。

### 11.2 数据结构与算法

4. **空间索引优化**：给 `world.js` 加均匀网格，把最近邻/碰撞从 O(n) 降为近似 O(1)，用 `test/stress.test.js` 量化加速比。（配套：写一份复杂度分析。）
5. **A\* 寻路**：给怪物 `_patrolMob` 换成带障碍的 A\* 或流场寻路，比较与随机游走的行为差异。
6. **实现自己的 PRNG**：替换 `random.js` 的 mulberry32 为 xorshift128，验证 `test/random.test.js` 仍通过（状态可序列化、可复现）。

### 11.3 软件工程

7. **扩展协议 + 契约测试**：新增一个客户端命令（如 `emote`），完整更新 `protocol.js` schema、`world.js` 实现、`protocol-conformance.test.js`，让源码扫描对账通过。
8. **提高覆盖率**：为一个尚未覆盖的错误码写确定性单测。
9. **加一条 readiness 检查**：在 `_readinessStatus` 增加一项（如「掉落数量异常」），并导出到 `/metrics`。

### 11.4 操作系统

10. **崩溃一致性实验**：见 [5.6](#56-信号与优雅停机) 的建议——在 `rename` 前后 `kill -9`，验证 `.bak` 恢复；去掉目录 fsync 讨论风险。
11. **令牌桶调参**：改 `rateLimit` 的 `capacity/refillPerSecond`，用脚本洪泛消息，观察 `RATE_LIMITED` 与 CPU 占用。
12. **写一个新副本 worker 消息**：给 IPC 协议加一条消息类型，走完帧编解码与 worker 校验。

### 11.5 计算机网络

13. **实现客户端二进制解码**：目前浏览器客户端只用 JSON；让学生在 `client.js` 实现 `binary1` 解码（参照 `codec.js` 的 `decodeSnapshotBinary`），协商 `codec:"binary1"` 并测带宽下降。
14. **增量快照**：设计并实现「只发变化实体」的增量快照，与全量快照比较带宽/复杂度。
15. **注入延迟与丢包**：在客户端 `send`/`connect` 插入人工延迟与丢包，观察预测/和解在高延迟下的表现，调 `pull`/`snap` 参数。

### 11.6 数据库 / 安全

16. **迁移与去重**：用 `tools/migrate-postgres.mjs` 导入 JSON，重放审计验证 `event_id` 去重。
17. **写一次 schema migration**：给账号表加一列，正确递增 `STORE_SCHEMA` 并让旧库自动升级、新库拒绝旧代码。
18. **攻击者视角**：见 [8.4](#84-输入不可信注入穿越污染dos)/[8.5] 的建议——脚本伪造恶意输入，逐条触发防护并写报告。

### 11.7 综合大作业（分布式 / 图形）

19. **PvP 原型**：在服务器权威约束下设计一套最小 PvP 规则集与匹配，讨论作弊面。
20. **新猎场 + 新怪 FSM**：加一张主题地图、一种带新攻击模式（如召唤）的怪物状态机，前后端打通。

---

## 12. 术语表与延伸阅读

### 12.1 术语速查

| 术语 | 含义 | 本项目落点 |
| --- | --- | --- |
| Server-authoritative（服务器权威） | 服务器验证并拥有一切结果，客户端只发意图 | 全局约束 |
| Fixed timestep（定步长） | 用固定 dt 推进模拟，保证确定性 | `world.js` `update`、`server.js` `_startLoop` |
| Client prediction / reconciliation | 本地预测 + 服务器和解，兼顾手感与权威 | `client.js` `predictLocalPlayer` |
| Backpressure（背压） | 消费者跟不上时反压/丢弃，防拖垮 | `server.js` `_sendPayload` |
| Token bucket（令牌桶） | 限流算法 | `server.js` `_takeRateToken` |
| FSM（有限状态机） | 状态 + 转移函数 | `world.js` `_updateMobs` |
| Idempotency（幂等） | 重复执行效果相同 | `world.js` `settleDungeon`、`event_id` |
| Fencing token | 单调令牌，挡住陈旧/僵尸副本 | `workerEpoch`、票据 `sequence` |
| Checkpoint（检查点） | 可恢复的状态快照 | `dungeon-simulation.js` |
| Atomic rename | 写临时文件+rename 保证崩溃一致 | `server.js` `_writeAccounts` |
| At-least-once → exactly-once | 至少一次投递 + 幂等接收 = 恰好一次效果 | 副本结算、审计去重 |
| CSWSH | 跨站 WebSocket 劫持 | `_originAllowed` |

### 12.2 仓库内延伸阅读

- `docs/ARCHITECTURE.md`——协议表、数据流与安全、就绪阈值全清单。
- `docs/DUNGEON_WORKERS.md`——副本 worker 的设计细节。
- `docs/PERFORMANCE.md`——性能与压测说明。
- `docs/GAME_TUTORIAL.md`——面向玩家的游戏教程（可作为「需求/产品」视角的对照材料）。
- `CHANGELOG.md`——玩法/协议演进史，适合讲「变更如何被记录」。
- `collab/`——人机协作的基于文件的工作流。

### 12.3 建议的授课路线

- **一学期「用一个游戏学计算机」通识课**：按第 2 → 3 → 6 → 5 → 8 章推进，每章配 [11 章](#11-课程实验与作业设计)对应实验。
- **数据结构与算法**：聚焦第 3 章 + 实验 4/5/6。
- **操作系统**：聚焦第 5、10 章 + 实验 10/11/12。
- **计算机网络**：聚焦第 6 章 + 实验 13/14/15。
- **软件工程**：聚焦第 4 章 + 实验 7/8/9，强调契约测试与可测性设计。

---

## 贡献者

本手册与《深红中继（CRIMSON RELAY）》项目由以下贡献者共同完成：

- **GMyhf** — 项目主创与维护者（人类作者）
- **Claude**（Anthropic）— AI 协作者：功能实现与代码复核
- **Codex**（OpenAI）— AI 协作者：功能实现与代码复核

项目采用人／AI **基于文件的协作流程**（见 `collab/`）：认领任务、签名、交接、互为复核——Claude 与 Codex 交替担任「实现方」与「复核方」，每次变更都经对方评审后合入。这套流程本身也是第 [4.5 节](#45-协作与变更管理)所讲「软件配置管理／团队协作」的现实样本。

---

> **给教师的一句话**：这个项目最大的教学价值，不在于它用了多少高级技术，而在于它把「课本原则」都落成了**可运行、可断点、可修改**的代码，并在注释里诚实地写下「为什么这么做」。带学生 `git clone`、`npm test`、设一个断点，比讲十页 PPT 更有效。
