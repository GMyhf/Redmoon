# 副本 Worker 设计

## 范围与现状

当前副本运行态属于主进程的 `World`：`World.dungeons` 以实例 ID 保存成员、剩余敌人、完成/奖励状态和 `startedAt`/`expiresAt`；`enterDungeon` 负责校验队伍并调用纯函数 `createDungeonPlan`，副本敌人、投射物和掉落仍进入主世界集合。`world.update(dt)` 同时推进普通地图和副本，退出或超时时由 `_destroyDungeon` 清理实例实体。断线玩家在默认保席期内仍保留 `mapId`、队伍和副本成员席位，恢复连接时复用原玩家 ID。

`src/server/dungeon.js` 的 `createDungeonPlan(...)` 已经是确定性纯函数。它只依赖 `instanceId`、队伍平均等级和地图尺寸，返回固定敌人编队、出生点和奖励，因此可直接成为 worker 的计划生成器；不应把客户端或 worker 输出当作规则来源。

目标是将每个副本的模拟迁入独立 worker，并让玩家断线后凭带版本票据在原 worker 或新 worker 上续接。主进程仍是连接、账号、队伍和奖励账本的权威边界。

## 载体选型

| 载体 | 优点 | 代价与风险 |
| --- | --- | --- |
| `worker_threads` | Node 内置；结构化克隆传递对象；低 IPC 延迟；可复用现有 JS/ESM 和注入 `rng` 的测试；worker 退出后主进程仍可重建实例 | 与主进程共享 Node 运行时和部署单元；不能提供完整的进程/资源隔离；需要严格限制消息大小和 worker 内存行为 |
| `child_process` / 独立进程 | 崩溃、内存和权限边界更清晰；可独立重启、限额和跨机器扩展；更接近长期水平扩展形态 | 需要序列化协议、进程监督、启动握手和额外部署；IPC 延迟/故障路径更多；本地开发和确定性测试成本更高 |

**首期使用受监督的 `child_process`，同时保留 `DungeonWorkerTransport` 抽象。** 副本需要真正的崩溃/资源隔离，并为以后跨机横扩保留路径；因此首期就落实序列化协议、启动握手、退出检测和进程重启边界。主进程不依赖 worker 的内存对象，只依赖带 request/sequence 的消息，因此以后可以把 transport 换成跨机实例服务而不改变票据和游戏消息语义。

进程由主进程监督，使用 stdin/stdout（或等价的单一 framed IPC 通道）传输结构化消息；不得把 JSON 行边界直接当作完整消息边界，必须有长度/类型校验和最大帧限制。票据签名密钥只放在主进程或票据服务中，不下发给 child process。

## 版本票据

票据是主进程签发的、不可由客户端修改的能力证明。客户端可以携带票据请求续接，但不能决定实例状态、玩家位置、命中、伤害或奖励。建议使用 HMAC-SHA256（或部署已有的等价签名服务），签名覆盖规范化 JSON，不把密钥发送给 worker。

```js
/** @typedef {Object} DungeonTicket
 * @property {string} kind                 // "crimson-dungeon"
 * @property {string} instanceId           // 唯一实例 ID，例如 vault-7
 * @property {number} schemaVersion        // 票据结构版本，初始为 1
 * @property {number} protocolVersion      // 对齐 PROTOCOL_VERSION
 * @property {number} averageLevel         // createDungeonPlan 的输入
 * @property {string[]} party              // 签发时的稳定 player/account IDs
 * @property {number} issuedAt             // 主进程逻辑时间（秒或毫秒，统一约定）
 * @property {number} expiresAt            // 保席/实例最终过期时间
 * @property {number} sequence             // 实例内单调递增票据序号
 * @property {string} keyId                // 签名密钥版本，便于轮换
 * @property {string} signature             // HMAC，覆盖上述字段
 */
```

签发时主进程验证队首、全员在线/存活/同图、队伍容量和全局容量，生成 `instanceId`，记录 `party` 快照并把 `sequence` 置为 1。`party` 是授权边界，不是实时奖励名单：成员离线可保席，主动 `dungeonLeave`、保席过期或账号移除会撤销该成员席位。票据中的 `expiresAt` 不得晚于实例 `dungeonDuration`；续接只能延长连接等待，不能延长副本生命周期。

校验顺序必须是：解析大小上限 → `kind`/`schemaVersion`/`protocolVersion` → 时间窗口 → 签名 → `instanceId` 当前记录 → 成员身份与席位 → `sequence`。旧 `schemaVersion` 或 `protocolVersion` 直接返回版本错误，不做字段猜测或向后兼容拼接；这与现有 `PROTOCOL_VERSION` 的拒绝旧协议方式一致。重放同一票据只能得到同一个席位状态，不能创建第二个实例或重复结算。票据泄露的风险与当前 bearer session token 相同，必须通过短过期时间、TLS 和 session/seat 撤销降低风险。

## 续接时序

```text
客户端 -- dungeonEnter --> 主进程
主进程 -- open(ticket, plan, seed) --> worker
主进程 -- dungeonTicket/event --> 成员连接

客户端断线
  主进程保留账号、party、seat 和 ticket，停止该玩家输入
  worker 继续按逻辑时间推进，但不接受 detached 玩家的意图

客户端 -- join/reconnect + ticket --> 主进程
主进程校验 bearer、票据、party seat 和过期时间
主进程 -- attach(ticket, playerState) --> 当前 worker
worker -- attached(snapshot, workerEpoch) --> 主进程
主进程恢复连接并发送 snapshot；玩家沿用原 playerId/mapId
```

续接不要求回到原 worker。主进程的 `instanceId -> workerId/workerEpoch` 路由表先尝试原 worker；worker 无响应或已退出时，主进程可从当前进程内存中的最新检查点重建新 worker，再用同一票据和最新权威状态 `restore`。未完成的输入队列、可序列化随机源状态、敌人/投射物/掉落和 `remaining` 集合必须包含在检查点中；不能只凭 `createDungeonPlan` 重新生成，否则会回滚战斗状态。

降级路径如下：

- 票据无效、过期、成员不在 `party` 或席位已撤销：拒绝续接，保留现有 bearer 的正常错误语义，不创建实例。
- worker 超时但检查点完整：标记旧 worker `fenced`，递增 `workerEpoch`，恢复到新 worker；旧 worker 的迟到消息全部丢弃。
- worker 崩溃且无可用检查点：实例失败，所有仍有席位的成员回城，发出一次 `dungeonFailed(reason: "worker_lost")`，不发完成奖励。
- worker/实例容量满：玩家仍可保留当前保席直到 `expiresAt`；续接返回可重试的容量错误，不把席位转给未授权玩家。
- 主进程重启：首期不承诺无损恢复；未恢复实例统一标为失败，成员回城且不发完成奖励。跨进程/跨机版本再引入外部检查点存储。

## 主进程与 Worker 消息契约

所有消息都带 `protocolVersion`、`instanceId`、`requestId` 和 `workerEpoch`。主进程只接受匹配当前路由 epoch 的响应；消息采用结构化数据并限制深度、实体数和字节大小。`tick` 的输入是主进程批准的意图和逻辑 `dt`，不是客户端原始消息。

| 方向 | 型别 | 必要字段 | 语义 |
| --- | --- | --- | --- |
| 主进程 → worker | `open` | `ticket`, `plan`, `rngState`, `now`, `tickRate` | 创建实例；worker 校验票据摘要并初始化可恢复随机源 |
| 主进程 → worker | `attach` | `ticket`, `playerId`, `playerState`, `lastInputSeq` | 恢复一个已授权席位；重复 attach 必须幂等 |
| 主进程 → worker | `input` | `playerId`, `seq`, `intent` | 经过主进程身份/席位校验的玩家意图；旧序号丢弃 |
| 主进程 → worker | `tick` | `tickId`, `dt`, `serverTime`, `inputs` | 在确定性边界推进一次模拟 |
| 主进程 → worker | `detach` | `playerId`, `seatExpiresAt` | 停止该玩家输入并保留席位 |
| 主进程 → worker | `restore` | `checkpoint`, `workerEpoch` | 新 worker 从最新权威检查点恢复 |
| 主进程 → worker | `recycle` | `reason`, `finalSequence` | 停止实例、释放实体并确认不再发消息 |
| worker → 主进程 | `ready` | `instanceId`, `workerEpoch`, `stateHash` | `open`/`restore` 完成，可接受 tick |
| worker → 主进程 | `tickResult` | `tickId`, `stateVersion`, `snapshot`, `events`, `checkpoint?` | 返回权威状态增量/事件；仅检查点周期或显式请求时附带 checkpoint |
| worker → 主进程 | `settle` | `settlementId`, `instanceId`, `members`, `reward`, `stateVersion` | 副本完成请求结算；同一 `settlementId` 只允许一次 |
| worker → 主进程 | `expired` | `instanceId`, `reason`, `members`, `stateVersion` | 超时或 worker 侧终止建议；最终清理由主进程确认 |
| worker → 主进程 | `error` | `requestId`, `code`, `retryable`, `stateVersion` | 可分类处理的错误，不暴露内部堆栈 |
| 双向 | `heartbeat` | `lastTickId`, `stateVersion` | 监测卡死；超时触发 fencing/恢复流程 |

`settle` 是请求，不是奖励事实。主进程以事务/幂等记录先占用 `settlementId`，验证实例状态、成员资格和 `stateVersion` 后，再逐成员发放 XP、金币和复苏露；重复消息、重试、worker 重启恢复都只能返回已结算结果。首期沿用现有行为，只对结算时仍在副本地图且未奖励的成员结算，离线成员不补领。

## 接口草案

以下是 transport 无关的 JSDoc 草案，不代表完整实现。`DungeonWorkerHandle` 的方法应返回可等待的确认，所有超时都由主进程控制。

```js
/** @typedef {{ send(message: object): Promise<void>, close(): Promise<void> }} DungeonWorkerTransport */

/** @typedef {Object} DungeonWorkerHandle
 * @property {(ticket, plan, options) => Promise<{stateVersion: number}>} open
 * @property {(playerId, ticket, playerState) => Promise<void>} attach
 * @property {(playerId, intent) => Promise<void>} input
 * @property {(tickId, dt, serverTime, inputs) => Promise<object>} tick
 * @property {(playerId, seatExpiresAt) => Promise<void>} detach
 * @property {(checkpoint, nextEpoch) => Promise<void>} restore
 * @property {(reason) => Promise<void>} recycle
 */

/** @param {{ workerId: string, epoch: number, transport: DungeonWorkerTransport }} options */
export function createDungeonWorkerHandle(options) {
  // Implementation will fence stale epochs and correlate requestId responses.
}

/** Worker entry; transport may later be worker_threads or child_process. */
export async function runDungeonWorker({ transport, rng, clock }) {
  // Accept open/attach/input/tick/detach/restore/recycle only after handshake.
}
```

`rng` 和 `clock` 必须是可注入的逻辑依赖；生产环境使用可序列化的 PRNG 状态，测试使用固定 seed 和 `world.update(dt)` 风格的显式推进。worker 不读取真实墙上时钟来决定过期，不接受客户端时间，也不直接写账号存储。

## 实现里程碑

每个阶段都应保持可回滚；除 Phase 0 外，不先引入客户端票据字段。阶段之间的依赖和验收标准如下：

### Phase 0：可 seed、可恢复的 PRNG

- 将副本使用的 `World` 随机源从不透明函数改成带 seed、可读取/恢复状态的 PRNG；保留测试注入 RNG 的能力。
- 盘点并覆盖副本 tick 中全部随机调用（掉落、伤害浮动、怪物巡逻和复苏露等），禁止 restore 后隐式回到 `Math.random`。
- 新增确定性测试：相同 seed 的 RNG 序列一致，保存并恢复 PRNG 状态后后续序列一致；完整 World tick 重放留到 Phase 4。
- 验收：`npm test`、`npm run check`，并确认现有 `dungeon.js` 纯函数测试不变。

### Phase 1：child process transport 与握手

- 新增 transport、worker 入口和 framed IPC；实现 `open`、`ready`、`heartbeat`、`error`、正常 `recycle`。
- 主进程监督启动超时、异常退出、stdout/stderr 隔离、帧大小和协议版本；worker 只接受受支持的消息型别。
- 验收：真实 child process 的启动/关闭/损坏帧/超时测试；迟到消息不会影响其他实例。

### Phase 2：票据签发与席位校验

- 主进程实现票据 canonicalization、HMAC、`schemaVersion`/`protocolVersion`、过期和序列号校验；签名密钥不出主进程。
- `dungeonEnter` 生成票据并建立 `instanceId -> workerEpoch` 路由；重复票据不能创建第二个实例。
- 验收：合法票据、旧版本、篡改、过期、错误成员、重放和容量满测试；暂不改变线上客户端协议，除非明确升级。

### Phase 3a：副本实体抽离（已完成）

- 每个实例拥有独立的 `mobs`、`projectiles`、`drops` 集合；副本实体不再进入主 `World` 的共享集合。
- 主 World 的普通地图维护、tick、投射物和掉落循环只遍历主集合；副本地图快照从实例集合读取，保持线上实体形状兼容。
- 验收：副本进入后主集合没有 `dungeonId` 实体，`world.update(dt)` 不移动副本敌人，副本投射物/掉落进入实例集合并在销毁时清理。

### Phase 3b：tick、attach、detach 和状态投递

- 将副本输入按 `playerId` 路由到 child process；主进程先做身份/席位校验，worker 只执行批准意图。
- 实现 `tick`/`tickResult`，`seq` 单调去重；同一意图即使同时出现在 `input` 流和 tick 批次中也只能应用一次。
- 实现 detached 席位、原 `playerId`/`mapId` 续接和快照/事件回传。
- worker 在 child 内以独立 `DungeonSimulation` 推进 plan 实体和玩家状态，使用实例自己的 `rngState`；主进程 secret 不下发。
- Phase 3b 的 checkpoint 只返回 RNG 状态和版本元数据；Phase 4 改为保存完整实体、输入和实例状态。
- 验收：断线保席、错误 bearer、重复 seq、输入跨 tick、主动离开和实例销毁测试。

### Phase 4：周期检查点、restore 与 fencing

- worker 检查点保存完整 `World` 运行态：players、mobs、projectiles、drops、pending 输入、`remaining`、逻辑时间/ tick、实体序列、特殊掉落计数、事件队列和 PRNG 状态；内容通过 JSON-safe 的 `Map`/`Set` 编解码跨 IPC。
- 新 child process 可在 `open({ checkpoint })` 或已打开 worker 的 `restore(checkpoint)` 中恢复；恢复后继续 tick 必须与原 worker 的 snapshot、事件和后续 RNG 逐项一致。
- worker 失联后递增 `workerEpoch`，启动新 child process 并 restore；transport 对 `protocolVersion`、`instanceId`、`workerEpoch` 和 `requestId` 做响应 fencing，旧进程的迟到响应全部拒绝。
- 首期检查点只保存在主进程内存；主进程重启时未恢复实例失败、成员回城、不发奖励。
- 验收：真实 child restore、恢复后继续战斗、epoch 身份拒绝、检查点大小/版本和状态 hash 测试。
- 追加验收：从 checkpoint 创建新 worker，使用相同输入和 `dt` 重放，事件、实体状态和 RNG 后续序列逐项一致。

### Phase 5：结算幂等与回收

- 实现 `settlementId` 生成、主进程幂等记录、`stateVersion` 校验和一次性奖励发放；worker 的 `settle` 永远只是请求。
- 实现完成/超时/worker_lost 的单次事件、成员回城、mob/projectile/drop 清理和 child process 回收。
- 结算只奖励当时仍在副本地图且未奖励的成员，离线成员不补领。
- 验收：重复 settle、主进程重试、worker 重启后重复 settle、成员提前离开和超时测试。

### T-003：主进程集成（已完成）

- `GameServer` 在 `dungeonEnter` 后启动 child worker，attach 所有成员；固定主循环将已校验输入路由到 worker，
  并把 worker snapshot/events 按原地图/成员作用域回投给客户端。
- worker 副本实体使用 dungeon mode，不进入主 World 的普通奖励和 respawn 路径；`tickResult.stateVersion` 回写实例，
  完成请求经 `World.settleDungeon` 幂等结算。主动离开、断线、超时、worker 失败和停服均回收 transport。
- 集成未改变 server↔client 协议；后续 Phase 6 继续覆盖跨 worker 故障恢复和跨机调度。

### Phase 6：协议与回归闸门

- 副本 tick 调度必须对每个实例保持单个 in-flight IPC 请求；主循环追赶期间合并逻辑 `dt`，不得追加无界 Promise 链，并暴露合并/落后度量。
- 真实 child process 回归覆盖旧 worker 关闭、新 `workerEpoch` 从 checkpoint 恢复、恢复后继续 tick，以及旧 epoch 迟到响应被 fencing 拒绝。
- 并发压力回归覆盖多个慢 worker：每个实例独立限制 in-flight 请求，合并 backlog 可观测并在 worker 恢复后归零。
- 仅在需要浏览器/Godot 携带票据时，才同步修改 `PROTOCOL_VERSION`、`src/server/protocol.js`、`docs/ARCHITECTURE.md` 和 conformance tests。
- 补齐端到端 WebSocket 续接、child process 故障、容量限制和确定性压力测试；更新 CHANGELOG.md 记录架构改进。
- 验收：`npm test`、`npm run check`，以及适用的 `npm run test:browser`/`npm run check:godot`。

## 安全与测试闸门

- 服务端仍验证所有输入、目标、距离、技能冷却和地图归属；worker 只执行已授权意图，客户端永远不提交伤害、位置、XP 或奖励。
- 每个实例使用 `instanceId + workerEpoch + stateVersion` fencing；旧 worker 的 `tickResult`、`settle` 和 `expired` 必须被主进程拒绝。
- 覆盖确定性 plan、票据签发/拒绝/过期/重放、断线后同 ID 续接、跨 worker restore、迟到消息、容量满、worker 崩溃和超时。
- 覆盖奖励幂等：重复 `settle`、重复连接、主进程重试和恢复后再次结算都不能重复增加 XP、金币或复苏露。
- 若票据或续接字段进入 browser/Godot 的 server↔client 协议，必须同步提升 `PROTOCOL_VERSION`、`src/server/protocol.js`、`docs/ARCHITECTURE.md` 和 conformance tests；仅内部 worker 消息不应暴露在线协议字段。

## 已定边界

- 首期载体为受监督的 `child_process`/独立进程；`DungeonWorkerTransport` 仍需保留以便未来跨机扩展。
- 首期不要求主进程重启无损恢复；未恢复实例失败，成员回城，不发奖励。
- 首期不允许离线补领；只结算完成时仍在副本地图且未奖励的成员。
