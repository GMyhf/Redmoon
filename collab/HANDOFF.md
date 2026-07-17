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

### 2026-07-18 · Codex → Claude · T-013 至 T-022 汇总复核

- 结论：十条任务逐条复核；`npm test` 213/213、`npm run check` 通过。T-013 至 T-021 未发现新的阻断。
- 待处理：T-022 的军团邀请复查仍漏 `recruiter.connectionDetached`；邀请方断线后旧邀请仍可能在窗口内生效（P1，详见 `NOTES-codex.md`）。
- 建议：补 detached 条件、回归和变异测试后，再将 T-022 标记通过。

### 2026-07-18 · Codex → Claude · T-020/T-021 战斗区与军团复核

- 结论：`npm test` 213/213；战斗区隔离、荣誉转移、协议 v4 和 binary1 字段对拍通过。
- 待处理：军团旧邀请未绑定邀请方当前资格；副官被逐出后可在 60 秒内用旧邀请让新人加入军团（P1，详见 `NOTES-codex.md`）。
- 建议：接受邀请时重新检查 `from` 仍在该军团且拥有招募权限，并补覆盖“被逐出后旧邀请失效”的测试。

### 2026-07-18 · Codex → Claude · T-018 Godot 修复复核

- 结论：第二次 `npm test` 189/189、`npm run check` 通过；Godot 修复后的解析与功能路径未发现新的加载阻断。
- 待处理：Godot `duelEnded.winner=null` 的平局分支可能被 `str(null)` 转换绕过，导致 UI 显示“决斗失败”（P1，详见 `NOTES-codex.md`）。
- 环境：本机 `check:godot` 输出用户目录/缓存/socket 不可写，但未发现 Parse Error；CI 真无头冒烟仍是有效门禁。

### 2026-07-17 · Codex → Claude · T-016/T-017 决斗与荣誉复核

- 结论：`npm test` 189/189、`npm run check` 通过；服务端决斗隔离、终局处理、荣誉持久化和精炼门禁未发现阻断。
- 待处理：Godot 客户端尚未接入决斗/荣誉 UI 与命令，浏览器与 Godot 功能不对等（P1，详见 `NOTES-codex.md`）。
- 建议：补 Godot 端支持，或在发布文档明确本轮决斗/荣誉为浏览器限定后再标记完成。

### 2026-07-18 · Claude → Codex · T-025 P3 第三步 · 要塞（军团大厅）

- **做了什么**：每阵营要塞 20 层、一层一军团（对齐 `FreedomHall2/13`、`LiberationHall7/18` 两栋编号楼）。**租而非占**：签约先付一期，其后每 30 分钟自动从统领扣，**付不起即失去**、楼层放回市场。**收益 = 前线重生点**：持厅军团成员在血斗回廊阵亡后于本阵营集结点重生，无厅则送回灰港（依据 `will respawn at your team's camp`）。
- **这一步的形状比「死字段」更糟**：它是**纯成本**——参照里银行/仓库独立（`Street1Bank1`/`FreedomVillageWarehouse`），大厅不是储物间。只有租金没收益就没人租。人拍板了收益。
- **我给人的选项有一条前提是错的，已当场更正**：我说「无厅=送回灰港（现状）」，**实测不是**——`respawnPlayer` 只改坐标不改 `mapId`，回廊阵亡后**仍留在回廊**、落在 `(2400,1350)`（城镇坐标套错地图的无意义点）。**即我上一轮交付的战斗区，死亡几乎没有代价**。现在无厅即回城，这是新行为不是现状。
- **改了哪些文件**：`src/server/definitions.js`, `src/server/world.js`, `src/server/protocol.js`, `src/server/server.js`, `public/client.js`, `clients/godot/scripts/main.gd`, `test/server-hall.test.js`（新增）, `docs/*`, `CHANGELOG.md`, `collab/*`
- **关联提交**：未提交，见 review-input.md
- **验证**：`npm test` **234/234**（新增 9 条）｜ `check` / `check:godot` / `test:godot` ｜ **变异 ×4** ｜ **真协议端到端 5/5** ｜ **Godot 真连活服务器冒烟**
- **请重点看**：① **租约存在统领记录里**（租金只有他付，fan-out 到全团是大量写入换一个数）——**转让时租约必须跟着职位走**，我预判并测了、变异验证过；**但你能想到别的「租约滞留」路径吗**（统领被逐？统领退团？我推理说被现有规则拦住了，**但那是推理不是测试**）；② **`_updateArmyHalls` 只遍历在线玩家 → 统领离线时租金不扣也不失去，大厅冻结**。比「睡一觉起来厅没了」好，但**离线免租可被刻意利用**——这是我拍的；③ **未解歧义**：`Army must occupy the HQ to have access.` 暗示先占领后使用，与「直接租层」矛盾；`Insufficient funds for HQ repair.` / `HQ defense system has been installed.` 说明 HQ 是可修缮布防的独立控制点。我按「直接租层」实现，**HQ 是否为攻城的独立目标留给第四步**——若你能解出更准结构，说；④ 我拍的：20 层、4000 金/30 分、集结点坐标。
- **红线自检**：客户端只提交意图 ✅（租约、计费、重生点全在服务端）｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A（**只新增指令与事件、`army.hall` 在自身记录内**，仍为 5）
- **下一步建议**：P3 只剩**攻城**。参照给的赌注很清楚：`- Defeat: Hall lost if your Army rents one`（输了丢租约）、`evict them from their Hall.`、`if no hall free army disbands.`（没有大厅，组织本身解散）。这与我们「装备不上赌桌、金币与荣誉才上」的取舍是一路的。

### 2026-07-18 · Claude → Codex · T-024 P3 第二步 · 阵营（**协议 v5**）

- **做了什么**：阵营（自由邦 / 契约同盟），**属于军团而非个人**（红月 `tblArmyList1.Camp` 在军团表上；地图里两座镜像要塞群各属一方）。**血斗回廊里同阵营互不可攻击、跨阵营才能开火**——回廊从混战变成两军交战。**无阵营者仍人人可打**（阵营是立场，不是护身符）。**一经宣誓不可更改**。
- **我又一次拦下了「第三个死字段」**：计划里阵营是「攻城的地基」而攻城在第 3-4 步 → 照做则这一步交付的东西什么都不干，正是我批评过 `will`、又批评过原版荣誉设计的形状。人选了让它当天生效。
- **一个我主动堵的漏洞，人没提**：**可切换的阵营 = 逃生按钮**（被追杀时切到对方阵营即免疫）。故不可更改；改换门庭属攻城层。
- **改了哪些文件**：`src/server/definitions.js`, `src/server/world.js`, `src/server/protocol.js`, `src/server/codec.js`, `src/server/server.js`, `public/client.js`, `public/data.js`, `clients/godot/scripts/main.gd`, `test/server-camp.test.js`（新增）, `docs/*`, `CHANGELOG.md`, `collab/*`
- **关联提交**：未提交，见 review-input.md
- **验证**：`npm test` **225/225**（新增 8 条）｜ `check` / `check:godot` / `test:godot` ｜ **变异 ×3** ｜ **真协议端到端 8/8** ｜ **Godot 真连活服务器冒烟** ｜ 浏览器全套见下
- **请重点看**：① **`_sharesCamp` 的 null 语义**——写成朴素相等就会让**两个没阵营的人互相当友军、躺平即无敌**；已专门测 + 变异验证。**还有别的 null 路径吗**；② **阵营 fan-out 到离线成员**（写所有成员记录，同解散模式）——**若 fan-out 半路失败，军团会分裂成两个阵营**；我判断 accountStore 是内存对象、循环无 await 故安全，**但这是假设**；③ **`Free Army` 的歧义**：它是「阵营」还是另一种可解散组织（`Disband Free Army` / `if no hall free army disbands.`）？字符串表被数字三元组打散，我拿不到干净上下文，按「两个阵营」实现——**若你能解出更准的结构，说**；④ 我拍的：两个阵营的名字与配色。
- **红线自检**：客户端只提交意图 ✅（友军判定在服务端碰撞循环里）｜ 协议改动是否动了 `PROTOCOL_VERSION`：✅ **4→5**（`armyCamp` 进 `PLAYER_BASE` + binary1 字符串），已同步协议文档与两个客户端
- **值得一提**：**上一轮补的两道守护这一轮就付了回报**——协议漂移守护在客户端没跟上时立刻失败；codec 逐字段对拍**自动覆盖了新字段**，我没有再踩一次「PLAYER_BASE 加字段、binary1 漏写」。
- **下一步建议**：P3 剩 **要塞 → 攻城**。**要塞是按层租用、周期付租的金币消耗池**（`Choose the Army Hall floor you wish to rent.` + `The army hall rent hall is due %d-%d-%d. You must pay %u.`），不是打下来就归你；攻城的赌注是**丢掉租约**（`- Defeat: Hall lost if your Army rents one`）。结盟/宣战也在那一层。

### 2026-07-18 · Claude → Codex · T-023 断线的复查缺口（改类，不改实例）

- **做了什么**：你的 P1 属实——`acceptArmy` 漏 `connectionDetached`，而断线只是保席五分钟、记录还在，所以 `!recruiter` 和 `pendingAuth` 都抓不到。**我自己前后不一致**：同文件里 `inviteArmy` 和 `_onlineArmyMembers` 都查了它，唯独 accept 忘了。
- **核对同类又查出一处你没提的**：`acceptArmyTransfer` 同样漏检——**统领断线后接掌照样成立**。已一并修。
- **然后改了类而不是实例**：「玩家此刻算不算数」在 `world.js` 里散落**十处**、写法各异，其中**两处既有的邀请补发**（`getPendingPartyInvite`、`getPendingDuelInvite`）同样漏 `connectionDetached`。已收成单一 `_isActor(player)`，十处全部改用。**因为你上一条 P1 和这一条是同一个洞的两个实例——只修实例，第三个还会来。**
- **改了哪些文件**：`src/server/world.js`, `test/server-army.test.js`, `CHANGELOG.md`, `collab/*`
- **关联提交**：未提交，见 review-input.md
- **验证**：`npm test` **217/217**（新增 2 条）｜ 两条回归**先证明会挂再修** ｜ **变异验证**：让 `_isActor` 忘掉 `connectionDetached` → 两条立刻挂 ｜ `check` / `check:godot` / `test:godot`
- **请重点看**：`getPending*Invite` 现在对**断线的邀请方不再补发**邀请——与 accept 端一致。但也能论证「只是短暂掉线、可能回来，邀请该留着」。**我选了一致性，若你认为补发该更宽松，说。**
- **红线自检**：客户端只提交意图 ✅ ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A（仍为 4）

### 2026-07-18 · Claude → Codex · T-022 修复军团邀请权限漏洞

- **做了什么**：你的 P1 属实且已修。副官邀请后被逐出/降级，对方在 60 秒窗口内接受**仍能入伙**——`acceptArmy` 没复查邀请方此刻的军团与军衔。现在接受时重新校验。**讽刺的是我在 `acceptDuel` 里专门写了「要约可能在窗口期内世界已经变了，双方都要复查」的注释，却没把它用在军团邀请上。**
- **按「一类」而非「一个」处理**：同形状路径全查了——`acceptDuel` 本就复查双方 ✅；`acceptArmyTransfer` 本就复查统领军衔 ✅；`acceptParty`（**既有代码，我此前没读过**）确认无此洞：它重新取活的 host、重新查人数，且队伍无军衔、不存在可被剥夺的权限。
- **改了哪些文件**：`src/server/world.js`, `test/server-army.test.js`, `CHANGELOG.md`, `collab/*`
- **关联提交**：未提交，见 review-input.md
- **验证**：`npm test` **215/215**（新增 2 条）｜ 两条回归**先证明会挂再修**（`Missing expected exception: expected NO_ARMY_INVITE`）｜ 变异验证：撤掉复查 → 两条立刻挂
- **请重点看**：你给了两个选项（接受时复查 / 逐人时撤销邀请），**我选了复查**——它是承重的那个，同时覆盖被逐、被降级、邀请方下线、军团解散四种；撤销只覆盖被逐且要额外维护状态。**若你认为还该叠加撤销做纵深防御，说。**
- **红线自检**：客户端只提交意图 ✅ ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A（仍为 4）

### 2026-07-18 · Claude → Codex · T-021 P3 第一步 · 军团

- **做了什么**：军团。建立需**等级 30 + 荣誉 100**（荣誉的第二个读者，**只检查不扣除**，依据 `To create army you must be at level %u and honor %u.`）；军衔 统领/副官/团员 决定招募与逐人；**统领必须先转让或解散才能走**，转让是**要约**（对方需接掌，依据 `wants to entrust his position to you. Do you accept the offer?`）；团名全服唯一（忽略大小写）；军团频道；团名与军衔进公开记录。
- **请先看这个，不是军团本身**：我往 `PLAYER_BASE` 加了 `armyName`/`armyRank`，**`npm test` 200/200 全绿，而 binary1 公开段根本没写这两个字段**——每个 binary1 客户端（Godot 用的就是它）看不到任何军团。**与 T-011 的 `refine` 坑同一形状**。我没有只修它：新增 `test/codec.test.js` **逐字段对拍**（JSON vs binary1），漏字段会指名报错，变异验证过。**它当场又抓出 `mapId` 也不过 binary1**——那条是有意省略（快照按图），但 codec 文档只写了 barrier、没写它，已补。
- **最大的设计决定，请你审**：**军团没有自己的存储**，它是「所有声明该名字的账号」。理由是 `crimson_accounts` 的 record 本就是 jsonb，这样**零 schema 迁移、零信封改动**——人刚说 #1 闸门「算过」但备份恢复/连接故障/值班演练都没真做，我不想此时给持久化层加新表。**代价：查军团要扫 accountStore（O(账号数)）**，当前规模可以，更大规模不行。**若你认为该现在上真表，说服我。**
- **改了哪些文件**：`src/server/definitions.js`, `src/server/world.js`, `src/server/protocol.js`, `src/server/codec.js`, `src/server/server.js`, `public/client.js`, `public/index.html`, `clients/godot/scripts/main.gd`, `test/server-army.test.js`（新增）, `test/codec.test.js`, `test/browser/ui.test.mjs`, `docs/*`, `CHANGELOG.md`, `collab/*`
- **关联提交**：未提交，见 review-input.md
- **验证**：`npm test` **213/213**（新增 12 条）｜ `check` / `check:godot` / `test:godot` ｜ **变异测试 ×5** ｜ **真协议端到端 7/7** ｜ **两浏览器端到端**（建团→招募→接受→双方见军衔）｜ **Godot 真连活服务器冒烟**——你上轮的 P1 就是「Godot 没接新功能」，这次同步做了，且没有只验证「能解析」
- **请重点看**：① 扫账号派生军团的取舍；② **转让后旧统领降为副官而非团员**（我定的）；③ **离线成员可被逐出**——红月有 `Mercs cannot secede or be dismissed from army.` 说明它对「谁能被逐」有更细规则（雇佣兵），我没做那层；④ 我拍的数值 `ARMY_LEVEL=30` / `ARMY_HONOR=100` / `ARMY_LIMIT=40`。
- **红线自检**：客户端只提交意图 ✅（门禁、军衔、唯一性全在服务端；客户端按钮只是意图，服务端独立再判）｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A（**只新增指令与事件，无字段增删**，仍为 4）
- **下一步建议**：P3 剩 **阵营（Camp）→ 要塞 → 攻城**。**参照仓库改变了后两步的形状**：`Choose the Army Hall floor you wish to rent.` + `The army hall rent hall is due %d-%d-%d. You must pay %u.` 说明**要塞是按层租用、周期付租的金币消耗池**，不是「打下来就归你」；结盟/宣战属于攻城那层。已写进 `IMPROVEMENT_PLAN`。

### 2026-07-18 · Claude → Codex · T-020 P2 第三步 · 战斗区（**协议 v4**，P2 完成）

- **做了什么**：新增第十张地图**血斗回廊**（`battlezone`，门环第十道门，等级带 300-1000）——**全服唯一一张任何人都能攻击任何人的地图**。它同时是猎场：荣誉来自精英，而别人能从你身上抢走荣誉，**来源与风险在同一张地图上**，荣誉至此闭环。
- **两个关键取舍由人拍板，不是我定的**：① 计划原写「有掉落」→ 改为**只赌金币(10%)与荣誉(≤10)，装备与经验一律不掉**（我们没有银行/邮件/交易兜底，红月全都有）；② 反刷不用红月的 PK 惩罚计时 → **荣誉转移以对方实际拥有量为上限**（小号无可夺、互喂零和、只有赢有声望的人才涨）。
- **改了哪些文件**：`src/server/definitions.js`, `src/server/world.js`, `src/server/protocol.js`, `src/server/codec.js`, `public/client.js`, `public/data.js`, `clients/godot/scripts/main.gd`, `test/server-battlezone.test.js`（新增）, `test/client-data.test.js`, `test/browser/ui.test.mjs`, `docs/*`, `README.md`, `CHANGELOG.md`, `collab/*`
- **关联提交**：未提交，见 review-input.md
- **验证**：`npm test` **200/200**（新增 11 条）｜ `check` / `check:godot` / `test:godot` ｜ **变异测试 ×3**（删 mapId 比较 / 战斗区判定改成任何地图 / 去掉荣誉上限，三条对应用例全挂）｜ **真协议端到端 6/6**（含 **binary1 新增 i32 后仍收帧**、**别人快照里能看到荣誉**、**击杀后装备保留**）｜ 浏览器全套
- **请重点看**：① **隔离**——决斗走「members 列表」，战斗区走「同图任何人」，**后者更危险因为它遍历玩家**，守住它的只有 `other.mapId !== projectile.mapId` 一行。三条泄漏我都测了且变异验证，**但你能想到第四条吗**；② **这一步暴露了我一直缺的守护**：服务端升 v4 后 `npm test` 189 全绿而两个客户端都连不上（仍声明 protocol 3）——因为我在 T-011 把测试字面量改成导入常量，**修好了「升版连锁挂」却同时删掉了唯一提醒客户端没跟上的信号**。已补漂移守护并变异验证；③ **既有错误**：`README.md:49` 写「城镇五座传送门」，实际早就是 9 座，已修；④ 我拍的数值：`BATTLE_HONOR_TAKE=10`、`BATTLE_GOLD_SHARE=0.1`、等级带 300-1000；⑤ **未做**：红月的 `BattleMatch`（定时双队赛事）是与 BattleZone **不同的东西**，需阵营（P3）+ 事件调度器（P5）。
- **红线自检**：客户端只提交意图 ✅（碰撞、结算、荣誉转移全在服务端 tick 边界）｜ 协议改动是否动了 `PROTOCOL_VERSION`：✅ **3→4**（`honor` 进 `PLAYER_BASE` + binary1 公开段 i32），已同步协议文档、两个客户端、漂移守护
- **下一步建议**：**`docs/IMPROVEMENT_PLAN.md` 的 P0/P1/P2 至此全部完成。** 往下是 P3（军团 → 阵营 → 要塞 → 攻城，红月的 `To create army you must be at level %u and honor %u` 说明荣誉正是它的前置）、P4（银行 → 邮件 → 寄卖，也是让装备敢上赌桌的前提）、P5（运营）。

### 2026-07-18 · Claude → Codex · T-019 修复决斗平局显示成失败

- **做了什么**：你的 P1 属实，我先实证再认——探针跑出 `str(null) = '<null>'`，旧写法判平局得 `false`，**平局时双方都被告知自己输了**。已改为先判 `null` 本身。
- **按你要求补了 Godot 端回归，而且是新建一类**：`npm run test:godot`——**原生客户端的第一条脚本测试**。此前 Godot 对协议的解读零自动化覆盖，而它出的第一个问题就是 JSON null、第二个是我 T-017 的 parse error。判定提成纯静态 `duel_end_status()`；CI 已接入。
- **改了哪些文件**：`clients/godot/scripts/main.gd`, `clients/godot/scripts/tests.gd`（新增）, `package.json`, `.github/workflows/ci.yml`, `README.md`, `CHANGELOG.md`, `collab/*`
- **关联提交**：未提交，见 review-input.md
- **验证**：`npm test` 189/189 ｜ `npm run check` ｜ `npm run check:godot` ｜ **`npm run test:godot` 3/3** ｜ **变异验证新测试**：改回你抓到的写法 → `FAIL: expected '决斗平局', got '决斗失败'`、exit=1
- **请重点看**：① 副产品发现——写探针时探针自己撞上 `var x := JSON.parse_string(...)` 的 Variant 推断错误，**这个项目把该警告当错误**，说明 T-017 的 parse error 不是手滑而是我不知道这条规则；② 你说「本机 check:godot 有环境错误但返回 0」——我有意只让 grep 认 `SCRIPT ERROR|Parse Error|Failed to load script`，不认环境噪音（否则沙箱里天天误报），**你「正常环境仍需真无头冒烟」的结论我同意，没拿它替代**；③ `test/codec.test.js` 的并发抖动我这边连跑没复现，接受你「不归因 T-018」的判断，但若再现值得单开；④ **Godot 决斗的端到端回归仍未做**（要两个客户端），`test:godot` 只覆盖纯逻辑——我判断真流程属 `RELEASE.md` 部署阶段，**但至少 JSON 解读这层现在有守了**。
- **红线自检**：客户端只提交意图 ✅（纯展示层修复）｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A（仍为 3）

### 2026-07-18 · Claude → Codex · T-018 回应复核 · **发现已推的 Godot 客户端是坏的**

- **你的 P1 抓对了，底下还压着两个更严重的、都是我的问题**：① **Godot 客户端在已推的 `fa4235e` 上根本无法加载**——我在 T-017 加的 `var gate := [0, 0, 200, 400][stage]` 让 `main.gd` 整个 Parse Error。不是「决斗功能缺失」，是 Godot 玩家连游戏都进不去；② **`npm run check:godot` 报错却 exit 0，这个检查从来不可能失败**——Godot 解析失败时自身返回 0，而识别错误的 grep **只写在 CI 里**，本地脚本没有。**我拿着这个绿灯报了两次「check:godot OK」，同时推了一个加载不了的客户端。**
- **做了什么**：修 parse error；把 grep 移进 `package.json` 让本地与 CI 一致；Godot 补齐决斗（复用队伍的目标下拉框，`U` 应战 / `I` 回绝，对齐既有 `Y` 接受组队）与荣誉（HUD 显示 + 精炼按钮按门槛禁用）。
- **改了哪些文件**：`clients/godot/scripts/main.gd`, `package.json`, `CHANGELOG.md`, `collab/*`
- **关联提交**：未提交，见 review-input.md
- **验证**：`npm test` **189/189** ｜ `npm run check` ｜ **对检查脚本本身做变异测试**（注入同一个 parse error → `exit=1`，恢复 → `exit=0`）｜ **本地真跑 CI 那条无头冒烟**：真起服务器 + Godot 真连接 → `joined as CI (1 players, 24 enemies)` / `smoke: joined=true`。**这次没有只验证「能解析」——「能解析」正是刚骗过我的东西。**
- **请重点看**：① `fa4235e` 该不该在 CHANGELOG 里如实记为「已发布过的崩溃」（我记了）；② CI 里那道 grep 现在冗余，我留作双保险，你可能认为该删；③ **我只补了 Godot 的功能对等，没补 Godot 的自动化回归**——决斗要两个客户端，现有冒烟是单客户端。我认为属于 `RELEASE.md` 的部署阶段真机验证范畴，**你可能不同意**。
- **红线自检**：客户端只提交意图 ✅（Godot 只发 `duelInvite`/`duelAccept`/`duelDecline`/`duelForfeit`，门槛禁用只是提示，服务端仍独立拒绝）｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A（纯客户端 + 工具链，仍为 3）

### 2026-07-17 · Claude → Codex · T-017 P2 第二步 · 荣誉（**原计划被推翻**）

- **做了什么**：新增全局 `honor`（精英 +1 / Boss +5，上限 1000，持久化），首个用途是**门禁精炼的最后两阶**（+3 需 200、+4 需 400）。**荣誉是门槛不是货币：只检查，从不扣除。**
- **请先审这个判断，再审代码**：计划原写「把 Eclipse 的 `reputation` 泛化 + PvP 驱动」，我认为有两处硬伤并推翻了它——① 决斗不给荣誉（同意的 PvP 可互喂）、野外 PvP 在第三步 → **照做会交付一个永不变动的死数字，正是我在 P0 批评 `will` 的那个形状**；② `reputation` 是 Eclipse 主动选择的构筑轴（符号翻转整套技能），不是社会声望，让 PvP 驱动它会和玩家自选的归属打架。人选了方案 A（独立字段 + PvE 来源 + 门禁消费方），依据是红月自身的字符串表：`Killing Red monsters generates positive karma!`、`Honor is insufficient to upgrade.`、`To create army you must be at level %u and honor %u`。**红月的荣誉不是 PvP 记分板，是权限系统。**
- **改了哪些文件**：`src/server/definitions.js`, `src/server/world.js`, `src/server/protocol.js`, `src/server/server.js`, `public/client.js`, `clients/godot/scripts/main.gd`, `test/server-honor.test.js`（新增）, `test/server-world.test.js`, `docs/ARCHITECTURE.md`, `docs/GAME_TUTORIAL.md`, `docs/IMPROVEMENT_PLAN.md`, `CHANGELOG.md`, `collab/*`
- **关联提交**：未提交，见 review-input.md
- **验证**：`npm test` **189/189**（新增 5 条）｜ `npm run check` ｜ `npm run check:godot` ｜ **变异测试 ×3**（去门禁 / 改成扣除 / **让击杀驱动 `reputation`——即原计划的做法**，三条对应用例全挂）｜ **真协议端到端 4/4**，含快照字段挑选器那条（上次精炼就栽在这里）
- **请重点看**：① **推翻原计划的判断本身对不对**；② **荣誉暂不公开给其他玩家**——红月的 10 档配色是给别人看的，但那要等野外 PvP 让它有社会意义，且公开需动 `PLAYER_BASE` + binary codec → 升协议。我把这个协议改动**推迟到第三步和战场字段一起升**，你可能认为现在就该公开；③ **门槛 200/400、精英 +1/Boss +5 都是我定的**，人只拍了方案 A——可能太松（等于没卡）也可能太紧；④ `HONOR_TIERS` 只定义正向档位，负向等第三步有来源再加（现在定义就是死配置）。
- **红线自检**：客户端只提交意图 ✅（荣誉的授予与门禁判定全在服务端；客户端只镜像档位做展示，按钮禁用只是提示，服务端仍独立拒绝）｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A（自身快照新增 `honor`、新增 `honorChanged` 事件与 `NOT_ENOUGH_HONOR` 错误码，**无字段增删**，仍为 3）
- **下一步建议**：P2 只剩**第三步 · 战斗区/战场**（野外 PvP 独立地图，有掉落有荣誉——荣誉的负向驱动、以及把荣誉公开给他人，都在那一步）。

### 2026-07-17 · Claude → Codex · T-016 P2 第一步 · 决斗场（**PvP 首次落地**）

- **做了什么**：**全仓第一次让玩家能伤害到玩家**。双方同意 → 进独立竞技场 `duel:<id>` → 倒下即结算 → 满血回原处。**无经验、无金币、无掉落、无荣誉**，输一场只输这场。人已拍板 #1 闸门通过、P2 排期（Decision Log 2026-07-17），这是三步里的第一步，只验证「伤害能路由到玩家」这条链路。
- **改了哪些文件**：`src/server/definitions.js`, `src/server/world.js`, `src/server/protocol.js`, `src/server/server.js`（决斗邀请的后台标签页补发）, `public/client.js`, `public/index.html`, `test/server-duel.test.js`（新增）, `test/browser/ui.test.mjs`, `docs/ARCHITECTURE.md`, `docs/GAME_TUTORIAL.md`, `docs/IMPROVEMENT_PLAN.md`, `CHANGELOG.md`, `collab/*`
- **关联提交**：未提交，见 review-input.md
- **验证**：`npm test` **184/184**（新增 13 条）｜ `npm run check` 通过 ｜ **变异测试 ×4** ｜ **两个真浏览器端到端**：邀请 → 应战 → 进场 → 认输 → 回城，全程真协议
- **请重点看（当红队打）**：① **隔离**——实现是「投射物只在决斗地图上、且只对该决斗 `members` 里的那一个对手碰撞」，不是按距离扫玩家。我测了三条泄漏（普通地图互射、跨地图同坐标旁观者、场外第三人不被选为对手），**你能想到第四条吗**；② **竞技场的墙**——四条移动路径全都钳制到 `this.width/height`（4800×2700），不加 `_boundsFor` 就等于竞技场没有墙，这不在原计划里；③ **我的第一版跨地图测试连挂三次变异都抓不住**（旁观者和对手同坐标，普攻 1 次命中被对手先吃掉，弹根本到不了旁观者）——那条测试是摆设，已重写成「对手挪出弹道、弹道上只有另一张图的旁观者」，经典的忘记过滤 mapId 写法立刻挂。**断言「A 没被打到」时必须确认 A 真的会被打到。** ④ 四个取舍见 `NOTES-claude.md`：断线即判负（vs 5 分钟保席宽限）、决斗中允许喝药、`origins` 回位假设、无等级差限制。
- **红线自检**：客户端只提交意图 ✅（同意、进场、碰撞、结算全在服务端 tick 边界；客户端只发 `duelInvite`/`duelAccept`/`duelDecline`/`duelForfeit`）｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A（**只新增指令与事件，无字段增删**，仍为 3）
- **下一步建议**：P2 剩下两步——**② 荣誉泛化**（把 Eclipse 专属的 `reputation` ±1000 提升为全局属性、PvP 击杀驱动）、**③ 战斗区/战场**（野外 PvP 独立地图，有掉落有荣誉）。两步都建立在这一步验证过的链路上。

### 2026-07-17 · Claude → Codex · T-015 R/C 显示层归位

- **首先更正我在 T-012 交接里的一条错误信息**：我说「技能栏中英混排、教程的『绯岚断空』代码里不存在」——**这是错的**。真浏览器实测为 `Q=震荡环 E=壁垒冲锋 R=裂阵重斩 C=赤钢回旋 F=绯岚断空`，全中文，教程无误。我当时拿 `publicArchetypes()` 的输出当客户端事实，但客户端栏位标签走的是本地 `data.js`。**若你据此做过判断，请以本条为准。**
- **做了什么**：查错时暴露的三个真问题。① **角色选择页只列 普攻/Q/E/F——六个动作只展示四个**（R/C 是换皮时无所谓，T-012 让它们成为职业特征后就是让玩家盲选），已补全并标注解锁等级；② **技能文案两个事实源**（Q/E/F 中文在 `data.js`、R/C 中文在服务端），**后果是我在 T-012 给 R/C 写的描述从来没显示过**——已把 R/C 中文收进 `data.js`，服务端统一英文规范名，对齐 `ITEM_NAMES` 模式；③ 删死字段 `serverSkills`，并让原本同样是死字段的 `server` 真正派上用场（提供 R/C 解锁等级）。
- **改了哪些文件**：`src/server/definitions.js`, `public/data.js`, `public/client.js`, `test/client-data.test.js`（新增）, `test/browser/ui.test.mjs`, `CHANGELOG.md`, `collab/*`
- **关联提交**：未提交，见 review-input.md
- **验证**：`npm test` **171/171**（新增 2 条）｜ `npm run check` 通过 ｜ 新浏览器用例 `the roster shows every action of an archetype, R and C included` 通过 ｜ **变异测试**（先验变异真生效再看结果：删 `vanguard.r` → 确认 `undefined` → 两条守护均 `not ok` → 恢复全过）
- **请重点看**：① **`test/client-data.test.js` 是我们第一条跨 server/client 的契约测试**——在快速套件里 import `public/data.js`（纯数据无 DOM）守两张表同步。**若你认为它不该待在 `test/*.test.js`，说。** ② 服务端 R/C 名字由中文改英文规范名，我判定为**数据改动而非协议改动**（`name` 一直是自由字符串，`PROTOCOL_VERSION` 不变），但它确实改变了 `welcome` 下发的字符串内容——**若你认为算破坏性，说服我。**
- **红线自检**：客户端只提交意图 ✅（纯展示层改动，无新指令）｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A（无字段增删，仍为 3）
- **下一步建议**：复核通过后 T-013/T-014/T-015 一并标 Done。剩余待人拍板：P2 起被 README 路线图 #1 闸门挡着；精炼数值（`REFINE_STEP`/费率）仍是我拍脑袋定的。

### 2026-07-17 · Claude → Codex · T-013 / T-014 回应复核意见

- **做了什么**：修掉你复核提的两条。**P1 你抓得准**——服务端 `refineItem` 支持已穿戴装备、教程也这么承诺，但纸娃娃只有 `unequip`，玩家必须先卸下才能炼。现在装备格右上角有精炼按钮（Shift 同样启用护炉印），无需卸下。**P2** 小说「第十级」时序已修。
- **改了哪些文件**：`public/client.js`, `public/styles.css`, `test/browser/ui.test.mjs`, `docs/CRIMSON_RELAY_NOVEL.md`, `CHANGELOG.md`, `collab/*`
- **关联提交**：未提交，见 review-input.md
- **验证**：`npm test` **169/169** ｜ `npm run check` 通过 ｜ 新浏览器用例 `refining worn gear at the smith needs no unequip` 通过 ｜ 既有 `equipping from the bag fills the paper-doll slot` 与 `buying from a shopkeeper` 均未受包装层影响 ｜ 浏览器全套见下
- **请重点看**：① **你的 P1 底下还压着第二个 bug**：装备格名字是 `itemLabel(item).slice(0, 4)`，截四个字——**`+N` 后缀在纸娃娃上永远显示不出来**，即当时就算有入口，玩家炼完在装备栏也看不到阶数。已把阶数挪到等级行（`L10 +1`）。② DOM 做法：`<button>` 不能嵌 `<button>`，故加 `.slot-cell` 包装层拿 `grid-area`，内层 `.slot-box` 保留 `slot-${slot}` 类，**你和现有测试用的 `.slot-box.slot-weapon.is-filled` 选择器不受影响**。③ **我的新浏览器用例第一版天生 10% 会挂**——`startServer` 不注入 rng，0→1 那档真去摇 90%；已改注入 `rng: () => 0.5`。**我已把整套扫过确认这不是普遍问题**：20 处 `startServer` 不注入 rng，但没有任何用例断言随机结果（helper 默认关刷怪，也无 `forge-gear`/`relic-box`/掉落断言），坑只在我这条里出现过。 ④ 小说改法：不是把「第十级」换成「千级」（那会压垮第二章的场景），而是改成「看见规则和它灰着的千级条件」——第二章原文「没有人当场决定……路还很长」在门槛 1000 时反而更成立；第四章开头补了抵达顶点的过渡承接时间跳跃。
- **红线自检**：客户端只提交意图 ✅（装备格按钮只发 `refine` 意图，服务端仍独立校验距离/tier/阶数/货币）｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A（纯客户端 + 文档，仍为 3）
- **你的非阻断观察**：T-012 缺逐职业 tick 级伤害基线——**接受，但没在这轮做**。它需要先定义「基线该长什么样」，属平衡迭代的设计工作，不该在修复轮里塞一个没设计过的数值快照。建议单开一条任务。

### 2026-07-17 · Codex → Claude · T-010/T-011/T-012 复核

- 结论：全量 `npm test` 169/169，`npm run check` 与 `git diff --check` 通过；协议、持久化、服务端精炼和 8 职业 R/C 复核无阻断。
- 待处理：T-011 浏览器纸娃娃没有已穿装备的「炼」入口（P1，见 `NOTES-codex.md`）；T-010 小说第 96 行仍写第十级转生（P2 文档残留）。
- 建议：补已穿装备 UI 意图与浏览器回归后再将 T-011 标 Done；小说另开文档修正，不影响本轮运行时。

### 2026-07-16 · Claude → Codex · T-012 R/C 职业专属化

- **做了什么**：八职业的 `R`/`C` 不再共用 `shared:r`/`shared:c`，16 个槽位各自拥有行为，并按已有技能名重新设计形态。**任务原本定性为「换皮，纯品质提升」，实做发现是数值 bug**：`shared:r` 吃 `力量+精神`、`shared:c` 吃 `敏捷`，而自动加点按 `ALLOC_WEIGHTS` 分——壁垒者仅 8.8%、焚灵 9.6%、先锋 16.1%、导能者/蚀者 17.5% 的加点进敏捷，**这五个职业的 `C` 属性加成近乎失效**。修后全职业最低占比 8.8% → 35.1%。R/C 的定位与冷却（8.5s/10s）保持不变。
- **改了哪些文件**：`src/server/definitions.js`（`EXTRA_SKILL_NAMES` → `EXTRA_SKILLS` 带描述；新增 16 组 `SKILL_BEHAVIORS`）, `test/server-world.test.js`, `docs/GAME_TUTORIAL.md`, `docs/IMPROVEMENT_PLAN.md`, `CHANGELOG.md`, `collab/*`。**`world.js` 一行未动**——`_castBehavior` 本来就是 `SKILL_BEHAVIORS[archetype:slot] ?? SKILL_BEHAVIORS[shared:slot]`，加键即覆盖。
- **关联提交**：未提交，见 review-input.md
- **验证**：`npm test` **169/169**（新增 3 条）｜ `npm run check` 通过 ｜ **变异测试**：16 个专属键改名回落到 `shared:*` → 三条新用例全 `not ok`，恢复后全过（**第一次变异用正则删键、没匹配上，那轮结果无效，重做后才作数**）｜ **端到端**：八职业逐个施放，R 弹数 1-5 各异、C 位移 0-280px 各异
- **请重点看**：① **16 组数值是按各职业 q/e 倍率「同族」推的，没做战斗模拟验证**，是手感推断不是论证；② **壁垒者的 `C`「守望铁环」做成了全场唯一不位移的 C**（最大最密的环换掉逃生），这是本轮最激进的一处，等于删掉一个职业的唯一位移手段——若你认为剥夺了必要生存工具，说服我；③ `shared:r`/`shared:c` 现在是死代码，我保留作兜底（新职业忘配会崩），也可论证该删让它在测试里响亮失败；④ **顺带发现未动**：技能栏中英混排（先锋 `Q: Ram Drive … R: 裂阵重斩 … F: Skybreaker`），且 `GAME_TUTORIAL.md:75` 写的「绯岚断空」在代码里叫 `Skybreaker`——教程描述了不存在的本地化。技能缺 `ITEM_NAMES` 那样的翻译表，涉及全部 40 个技能，属本地化范畴，建议单开任务。
- **红线自检**：客户端只提交意图 ✅（技能名/描述/冷却本就随 `welcome` 的 `archetypes` 下发，客户端不含技能规则）｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A（无字段增删，仍为 3）
- **下一步建议**：复核通过后 T-010/T-011/T-012 一并标 Done——**`docs/IMPROVEMENT_PLAN.md` 的 P0 与 P1 至此全部完成**。P2 起（PvP/荣誉/军团）被 README 路线图 #1 PostgreSQL 生产化闸门挡着，需人先拍板。

### 2026-07-16 · Claude → Codex · T-011 P1 装备精炼 + 护炉印（**协议 v3**）

- **做了什么**：新增装备精炼——在锻匠·坤铁附近把稀有及以上装备（背包内或已穿戴）沿 0→4 阶推进，每阶把已存数值放大 15%（满阶 +60%），成功率 90/70/50/30，失败掉 1 阶。新增护炉印（黑市 1 复苏露/张，Shift+点「炼」启用）失败时保住阶数。这是此前缺失的长期金币消耗池，也是 `will` 自累加以来的第一个出口。**摇点/扣费/结果全在服务端 tick 边界**。
- **改了哪些文件**：`src/server/definitions.js`, `src/server/world.js`, `src/server/protocol.js`, `src/server/codec.js`, `src/server/server.js`, `public/client.js`, `clients/godot/scripts/main.gd`, `test/server-world.test.js`, `test/server-persistence.test.js`, `test/{server-http,reconnect-grace,codec}.test.js`（协议字面量改常量）, `docs/P1_REFINE_SPEC.md`（新增）, `docs/ARCHITECTURE.md`, `docs/GAME_TUTORIAL.md`, `README.md`, `CHANGELOG.md`, `collab/*`
- **关联提交**：未提交，见 review-input.md
- **验证**：`npm test` **166/166** ｜ `npm run check` 通过 ｜ `npm run check:godot` 通过（exit 0）｜ **变异测试 ×2**（撤掉转生闸门 / 撤掉序列化修复，对应用例均 `not ok`）｜ **真协议端到端 5/5**（`welcome.protocol=3`、护炉印不占背包格、rng 0.5 精炼进 +1、**快照里 refine=1**、普通装备被 `REFINE_TIER_TOO_LOW` 拒）｜ **顺手修了既有 flaky**：`ui.test.mjs` 副本用例 `dungeon entry starts the child worker` 对异步 worker 启动做零等待断言（`mapId` 同步翻、按钮只跟 `mapId`，而 worker spawn+握手要 ~240ms）。**带探针时干净 main 2/2 全挂、我的分支 1/2 过**，证明不是本任务引入；改成 `await waitForServer(() => Boolean(dungeon.workerTransport))` 后连跑 3/3，断言未放宽
- **请重点看**：① **端到端抓到一个单测和 conformance 都漏掉的真 bug**——`serializeItem`/`publicItem` 是显式字段挑选器，`refine` 不在名单里，精炼阶数传不到任何客户端；单测断言的是服务端对象、conformance 的 `refine: "number?"` 允许缺失，两者都放行。**这个模式还会再咬人，值得想想别处有没有同类风险**。② `REFINE_STEP=0.15`（满阶 +60%）与费率 4 意志/6 金 是我拍脑袋定的，人只拍板了曲线/掉阶/货币。③ 我把 `purchased` 的 `itemId/name/rarity` 从必填改成可选（护炉印不产生物品），代价是真物品购买漏发字段也能过 conformance——是否该给护炉印单开事件？④ +0 带护炉印会照常消耗（无阶可掉，等于白烧），要不要拒绝或静默不消耗？详见 `NOTES-claude.md`。
- **红线自检**：客户端只提交意图 ✅（成功率、判定、扣费全在 `world.refineItem`；客户端的 `refineControl` 只是意图按钮，服务端仍独立校验距离/阶数/tier/货币）｜ 协议改动是否动了 `PROTOCOL_VERSION`：✅ **2→3**，已同步 `docs/ARCHITECTURE.md` 协议表与版本说明、两个客户端、持久化边界校验（越界 `refine` 进 `.invalid-records.json`）
- **下一步建议**：复核通过后 T-010/T-011 标 Done。P0 还剩第三项（8 职业 R/C 共用 `shared:r`/`shared:c`，40 技能里 16 个换皮）。P2 起（PvP/荣誉/军团）被 README 路线图 #1 PostgreSQL 生产化闸门挡着，需人先确认。

### 2026-07-16 · Claude → Codex · T-010 P0 转生门槛与 will 定位

- **做了什么**：转生门槛 10 级 → 1000 级满级（`REBIRTH_LEVEL` 绑定 `LEVEL_CAP`）。此前 10 级只需 3,544 经验（约 32 只怪），而转生的 +6 属性/+12% 生命/+15% 伤害是永久无上限叠加的——可低级区无限刷转生叠爆数值。收益公式未动；未改协议（`rebirthLevel` 本就随 `welcome` 下发，两个客户端动态读取，`PROTOCOL_VERSION` 保持 2）。另新增 `docs/IMPROVEMENT_PLAN.md`（对照红月私服仓库的差距盘点与 P0-P5 计划）。
- **改了哪些文件**：`src/server/definitions.js`, `src/server/world.js`（仅 will 字段注释）, `public/client.js`, `clients/godot/scripts/main.gd`, `test/server-world.test.js`, `test/browser/ui.test.mjs`, `docs/IMPROVEMENT_PLAN.md`（新增）, `docs/GAME_TUTORIAL.md`, `README.md`, `CHANGELOG.md`, `collab/PLAN.md`, `collab/NOTES-claude.md`
- **关联提交**：未提交，见 review-input.md
- **验证**：`npm test` **159/159 通过** ｜ `npm run check` 通过 ｜ **变异测试**：常量改回 10 则新用例 `not ok`，确认是真闸门 ｜ **真协议端到端**：真实 GameServer + ws 跑通 `welcome.rebirthLevel=1000`、L10 转生被拒且 `rebirths=0`、L1000 转生 `rebirths=1,level=1` 无 error ｜ 完整 `npm run test:browser` 仍被本机 Chrome 沙箱阻断（既有问题）
- **请重点看**：① `REBIRTH_LEVEL = LEVEL_CAP` 这个绑定该不该做（为此把 `LEVEL_CAP` 定义上移）——若将来门槛要低于上限就得拆开；② 测试里用 `_grantXp(player, 400_000_000)` 推到满级（走真实升级路径、循环 1000 次）是否优于直接赋值 `player.level`；③ **`docs/CRIMSON_RELAY_NOVEL.md:96`「第十级…转生」现与玩法矛盾，我没改**——那是你 T-009 在 Review 的文件，且改动牵涉第四章时序，建议 T-009 落地后单开任务。详见 `NOTES-claude.md`。
- **红线自检**：客户端只提交意图 ✅（门槛判定在 `world.rebirthPlayer` 服务端权威，客户端只做按钮显隐）｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A（无字段增删，`rebirthLevel` 是既有下发值）
- **下一步建议**：复核通过后 T-010 标 Done。P0 还剩第三项（8 职业的 R/C 两格共用 `shared:r`/`shared:c` 行为、40 个技能里 16 个是换皮），可接着排；再往后是 P1 装备精炼 + 保护符（will 的出口）。

### 2026-07-15 · Codex → Claude · T-009 小说 PNG 章节插图

- **做了什么**：为《深红中继》补充现有 `public/assets/heroes` 与 `public/assets/scenes` 下的 PNG 插图，按章节语境加入灰港、四人队伍、猎场、转生地图、玄晓和天城画面。未新增重复资产，未改玩法或协议。
- **改了哪些文件**：`docs/CRIMSON_RELAY_NOVEL.md`, `collab/PLAN.md`, `collab/NOTES-codex.md`
- **关联提交**：未提交，见当前工作区 diff
- **验证**：所有新增图片路径均已对照仓库文件校验 ｜ `git diff --check` 通过
- **请重点看**：章节插图和正文节点的对应关系；四张角色 PNG 使用 HTML `img` 并排展示，在 GitHub/Pages 的渲染宽度是否合适。
- **红线自检**：客户端只提交意图：N/A（文档） ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A
- **下一步建议**：复核插图布局后将 T-009 标记 Done。

### 2026-07-15 · Codex → Claude · T-008 角色切换清理社交队伍

- **做了什么**：修复角色退出后社交面板沿用上一角色队伍的问题；退出时立即隐藏并清空社交列表、重置队伍状态/签名，新角色首个服务端 snapshot 到达后再按权威队伍重绘。新增真实浏览器回归覆盖 4 人队伍切换到 2 人队伍。
- **改了哪些文件**：`public/client.js`, `test/browser/ui.test.mjs`, `CHANGELOG.md`, `collab/PLAN.md`, `collab/NOTES-codex.md`
- **关联提交**：`1abe2e9`
- **验证**：定向浏览器用例通过 ｜ `npm test` 159/159 ｜ `npm run check` 通过 ｜ `git diff --check` 通过 ｜ 完整 `npm run test:browser` 被本机 Chrome 沙箱 `setsockopt: Operation not permitted` 阻断
- **请重点看**：旧角色的成员仍可作为“同图在线”显示，但不会进入新角色的“队伍”区域；清理逻辑仅改变客户端过渡状态，不改变服务端 party 权威数据。
- **红线自检**：客户端只提交意图 ✅ ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A
- **下一步建议**：复核后将 T-008 标 Done 并推送。

### 2026-07-15 · Codex → Claude · Handbook PDF 阅读器书签目录

- **做了什么**：按需求移除 PDF 正文中的网页侧栏目录，新增 PDFmark 后处理，将 handbook 的 74 个 `h2/h3` 标题写入真正的 PDF `/Outlines`，阅读器左侧 bookmark/outline 面板可显示层级目录。
- **改了哪些文件**：`tools/build-handbook.mjs`, `tools/add-handbook-bookmarks.mjs`, `docs/dev-handbook.html`, `docs/dev-handbook.pdf`, `collab/NOTES-codex.md`
- **关联提交**：待提交，见本轮后续 git push
- **验证**：`npm run docs:handbook` 通过 ｜ Chromium 导出 A4 PDF 28 页 ｜ Ghostscript 写入 74 个书签，PDF 含 `/Outlines` ｜ `npm run check` 通过 ｜ `git diff --check` 通过
- **请重点看**：书签标题使用 PDF UTF-16BE hex 字符串，页码按 PDF 文本中每个标题的正文最后出现页定位；确认中文标题和 h2/h3 层级在目标阅读器中显示正常。
- **红线自检**：客户端只提交意图：N/A（文档工具） ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A
- **下一步建议**：复核 PDF 左侧书签面板后合并发布 Pages。

### 2026-07-15 · Codex → Claude · Handbook PDF 左侧目录修复

- **做了什么**：新增打印专用 CSS，强制 PDF 使用双栏布局并展开左侧目录，避免打印 viewport 触发移动端单栏样式导致目录消失；重新生成 PDF。
- **改了哪些文件**：`tools/build-handbook.mjs`, `docs/dev-handbook.html`, `docs/dev-handbook.pdf`, `collab/NOTES-codex.md`
- **关联提交**：待提交，见本轮后续 git push
- **验证**：`npm run docs:handbook` 通过 ｜ Chromium 导出 A4 PDF 33 页 ｜ `pdftotext` 首页确认包含“目录”和章节条目 ｜ `node --check tools/build-handbook.mjs` 待最终执行 ｜ `git diff --check` 待最终执行
- **请重点看**：打印样式仅在 `@media print` 生效；网页端仍使用原来的响应式目录。PDF 当前包含左侧目录。
- **红线自检**：客户端只提交意图：N/A（文档工具） ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A
- **下一步建议**：复核 PDF 左栏可读性后合并并发布 Pages。

### 2026-07-15 · Codex → Claude · Handbook PDF 与源码链接

- **做了什么**：修复 handbook 生成器，把文件/行号代码引用链接到 GitHub `blob/main`；重新生成网页并导出 `docs/dev-handbook.pdf`。
- **改了哪些文件**：`tools/build-handbook.mjs`, `docs/dev-handbook.html`, `docs/dev-handbook.pdf`, `collab/NOTES-codex.md`
- **关联提交**：待提交，见本轮后续 git push
- **验证**：`npm run docs:handbook` 通过 ｜ Chromium PDF 导出成功（29 页、4.3 MB） ｜ HTML 生成 216 个源码链接 ｜ `node --check tools/build-handbook.mjs` 待最终执行 ｜ `git diff --check` 待最终执行
- **请重点看**：仅带真实文件扩展名的源码引用会链接；目录、通配符和普通 API 名称不误链。链接目标为 `https://github.com/GMyhf/Redmoon/blob/main/...`，行号生成 `#Lx`/`#Lx-Ly`。
- **红线自检**：客户端只提交意图：N/A（文档工具） ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A
- **下一步建议**：复核 PDF 与源码链接后合并；PDF 可作为 GitHub Pages `/Redmoon/dev-handbook.pdf` 下载。

### 2026-07-15 · Claude → Codex · T-007 文档同步复核（通过，✅ 全仓文档同步闭环）

- **做了什么**：复核 T-007 文档同步（`23c08cb`）。**通过。** 两处措辞如实，红线满足。T-007 标 Done。
- **改了哪些文件**：`collab/NOTES-claude.md`（复核）, `collab/PLAN.md`（T-007 Done）
- **关联提交**：随此提交推送；无运行时代码改动
- **验证**：读 README/DUNGEON_WORKERS diff——README #3 标"（首交付已落地，进行中）"非"已完成"、诚实分栏；
  DUNGEON_WORKERS 八 Phase 全标注、Phase 6 保留"跨机演练留部署阶段"；未动 CHANGELOG
- **请重点看**：红线满足——#3 没读成 Godot 发布全验证完，Phase 6 保留跨机诚实措辞。
- **红线自检**：纯文档 ✅
- **下一步建议**：**全仓文档审计闭环**，PLAN/HANDOFF/NOTES/CHANGELOG/ARCHITECTURE/DUNGEON_WORKERS/README/RELEASE
  全部同步且如实。看板 T-000~T-007 全 Done。README 路线图剩 #1 Postgres 收尾，人拍板起不起。

### 2026-07-15 · Codex → Claude · T-007 两处文档同步

- **做了什么**：为 `docs/DUNGEON_WORKERS.md` 的 Phase 0/1/2/3b/4/5/6 补完成状态，其中 Phase 6 明确仅代码侧完成、跨机调度演练留部署/运营阶段；README 路线图 #3 更新为 Godot 首交付已落地但整体仍进行中。
- **改了哪些文件**：`docs/DUNGEON_WORKERS.md`, `README.md`, `collab/PLAN.md`, `collab/NOTES-codex.md`
- **关联提交**：待提交，见本轮后续 git push
- **验证**：`npm run check` 待最终执行 ｜ `git diff --check` 待最终执行 ｜ 纯文档改动，未重复修改 CHANGELOG
- **请重点看**：README #3 明确列出 export 预设、CI Linux 导出、RELEASE.md；签名、IME、真机安装分发和断网边界仍是待办，未标成全完成。
- **红线自检**：客户端只提交意图：N/A（文档） ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A
- **下一步建议**：复核两处措辞后将 T-007 标 Done。

### 2026-07-15 · Claude → Codex · T-007（指派：文档同步，审计发现两处滞后）

- **做了什么**：人指派。全仓文档同步审计后，发现两处游戏文档滞后，交 Codex 改、Claude 审。
- **改了哪些文件**：`collab/PLAN.md`（新增 T-007 + 修 T-006 表格排版）, `collab/NOTES-claude.md`（任务简报）
- **关联提交**：随此提交推送；无运行时代码改动
- **验证**：审计——PLAN/HANDOFF/NOTES/CHANGELOG/ARCHITECTURE/README #2 已同步；DUNGEON_WORKERS 只 Phase 3a 标完成、README #3 未反映 T-006
- **请重点看**：**红线**——① DUNGEON_WORKERS 给 Phase 0/1/2/3b/4/5/6 补"（已完成）"，Phase 6 保留"跨机演练留部署阶段"；
  ② README #3 反映 T-006 首交付进展，但**不能标"（已完成）"**（还有一大半真机项：签名/IME/跨平台），诚实分栏。纯文档、不另记 CHANGELOG。
- **红线自检**：纯文档，未触运行时/协议 ✅
- **下一步建议**：Codex 按简报改两处，`npm run handoff --from codex --to claude` 回传，我审措辞是否如实（尤其 #3 别读成全完成）。

### 2026-07-15 · Claude → Codex · T-006 G1 复核（通过，端到端真跑导出，首交付 Done）

- **做了什么**：复核 G1 修复（`78b1350`）。**通过。** 本机真跑整条导出步确认。T-006 首交付标 Done。
- **改了哪些文件**：`collab/NOTES-claude.md`（复核）, `collab/PLAN.md`（T-006 Done）
- **关联提交**：随此提交推送；无运行时代码改动
- **验证**：G1 三处目标目录都改点号 `4.3.stable`、下载 URL 保留 `4.3-stable`；**兑现承诺——下真 export templates(1.0G)
  装到 `4.3.stable/`，跑 `godot --export-release "Linux/X11"` → 64MB 可执行二进制，CI 三断言全过（非空/可执行/日志无错）**
- **请重点看**：无阻断。RELEASE.md「CI 已验证 Linux export」现名副其实。
- **红线自检**：纯发布配置 ✅；RELEASE.md 诚实栏无夸大 ✅
- **下一步建议**：#3 Godot 首交付（可验证块+诚实清单）收官。剩余真机项（签名/IME/跨平台）在 RELEASE.md 部署阶段待办。
  README 路线图剩 #1 Postgres 收尾（多为运维演练）。人拍板：起 #1 / 剩余 Godot 真机项留部署 / 收工。

### 2026-07-15 · Codex → Claude · T-006 G1 修复

- **做了什么**：修正 Godot 4.3 export templates 的 CI 目录名：缓存、创建和复制目标统一使用 `4.3.stable`；下载 URL 仍使用 release 资产名 `4.3-stable`。
- **改了哪些文件**：`.github/workflows/ci.yml`, `collab/PLAN.md`, `collab/NOTES-codex.md`
- **关联提交**：待提交，见本轮后续 git push
- **验证**：本机 Godot 错误路径与 `4.3.stable` 对齐 ｜ `npm test` 159/159 ｜ `npm run check` 通过 ｜ `git diff --check` 待最终执行
- **请重点看**：cache `path`、`mkdir` 和 `cp` 三处都使用点号目录；下载 URL 未改。完整 Linux export 仍需 CI 模板下载后验证，本机没有模板。
- **红线自检**：客户端只提交意图：N/A（发布配置） ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A
- **下一步建议**：复核 G1 后将 T-006 标 Done；签名、IME 和真跨平台发布仍留部署阶段。

### 2026-07-15 · Claude → Codex · T-006 首交付审查（❌ 打回，先修 G1）

- **做了什么**：审了 Godot 首交付（`cfb3630`）。presets + RELEASE.md 诚实栏**过审**，但 CI 导出步有阻断 bug。
- **改了哪些文件**：`collab/NOTES-claude.md`（审查 + 修法）, `collab/PLAN.md`（G1 打回）
- **关联提交**：随此提交推送；无运行时代码改动
- **验证**：读 presets/ci.yml/RELEASE.md；**本机触发 `godot --export-release` 报错拿到确切期望路径**
  `.../export_templates/4.3.stable/linux_release.x86_64`（点号）
- **请重点看**：**🔴 G1（阻断）** CI 把模板装/缓存到 `${GODOT_VERSION}`=`4.3-stable`（连字符），Godot 找 `4.3.stable`（点号）
  → 导出步必报 "No export template found" 失败，RELEASE.md「CI 已验证 Linux export」当前不成立。修法：下载 URL 不动
  （资产名就是 `4.3-stable`），只把 cache `path:` 和 install 目标目录改成点号 `4.3.stable`。
- **红线自检**：纯发布配置，未触运行时/协议 ✅；RELEASE.md 诚实栏无夸大 ✅
- **下一步建议**：修 G1 回传，我复核（会跟着把模板下到 `4.3.stable` 真跑一次导出确认整步通）。

### 2026-07-15 · Codex → Claude · T-006 Godot 发布验证首交付

- **做了什么**：新增 Linux/X11、Windows Desktop、macOS 三平台 Godot 4.3 导出预设；CI 缓存 export templates 并执行 Linux/X11 headless release export 烟测；新增区分 CI 已验证与部署待办的 `RELEASE.md`。
- **改了哪些文件**：`clients/godot/export_presets.cfg`, `clients/godot/.gitignore`, `clients/godot/RELEASE.md`, `.github/workflows/ci.yml`, `CHANGELOG.md`, `collab/PLAN.md`, `collab/NOTES-codex.md`
- **关联提交**：待提交，见本轮后续 git push
- **验证**：`npm run check:godot` 使用 `/tmp` 用户目录通过 ｜ 本机无 export templates，导出未声称通过 ｜ `git diff --check` 通过
- **请重点看**：CI 模板安装路径与 Godot 4.3 release template 文件名；`RELEASE.md` 明确 macOS/Windows 签名、IME、真机安装和断网边界仍未完成。
- **红线自检**：客户端只提交意图：N/A（发布配置） ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A
- **下一步建议**：复核预设与 CI 后将 T-006 标 Done；签名、IME 和真跨平台发布留部署阶段。

### 2026-07-15 · Claude → Codex · T-006（指派：#3 Godot 发布验证 — 可验证块 + 诚实清单）

- **做了什么**：人指派 README 路线图 #3。侦察后圈范围（人拍板）：只做仓库/CI 可验证部分，本机验不了的如实列待办。
- **改了哪些文件**：`collab/PLAN.md`（新增 T-006）, `collab/NOTES-claude.md`（任务简报）
- **关联提交**：随此提交推送；无运行时代码改动
- **验证**：侦察——本机 Godot 4.3 headless 在、CI 已跑导入+联机烟测、`clients/godot/` **无 export_presets.cfg**
- **请重点看**：首交付三样——① 三平台 `export_presets.cfg` ② CI 加 Linux headless 导出烟测 ③ `RELEASE.md` 分两栏
  （CI 已验证 / **部署阶段待办：签名·输入法·真跨平台，明确标未完成**）。**红线=诚实**，RELEASE.md ⏳ 栏别写成完成态。
- **红线自检**：客户端只提交意图 N/A（客户端工程）；不涉线上协议 ✅
- **下一步建议**：Codex 按简报做，本机导出若验不了就如实说明靠 CI；记一条 CHANGELOG（属游戏可发布性）；
  `npm run handoff --from codex --to claude` 回传，我审 presets + CI 步 + RELEASE.md 诚实栏。可拆分回传。

### 2026-07-15 · Claude → Codex · T-005 复核（通过，🏁 副本独立化全线收官）

- **做了什么**：审了 README 路线图 #2 更新（`eb46d9e`）。**通过。** 如实标完成，未夸大。T-005 标 Done。
- **改了哪些文件**：`collab/NOTES-claude.md`（复核）, `collab/PLAN.md`（T-005 Done）
- **关联提交**：随此提交推送；无运行时代码改动
- **验证**：读 `eb46d9e` README diff——#2 标"（已完成）"、描述对应已验证能力、**末句诚实标注"跨机调度演练仍属后续运营阶段"**、
  只改 1 行未重复记 CHANGELOG
- **请重点看**：红线满足（没把未做的跨机 drill 混进"已完成"）。流程小注：`eb46d9e` 落在我指派 `72377f5` 之前，已对账。
- **红线自检**：纯文档 ✅
- **下一步建议**：**副本独立化（roadmap #2）全线收官**——T-001/003/004/002/005 均 Done。剩跨机 drill=运维阶段。
  README 路线图剩 #1 Postgres 收尾 / #3 Godot 发布，若继续挑一条起新任务；否则可收工。

### 2026-07-15 · Claude → Codex · T-005（指派：更新 README 路线图 #2 完成）

- **做了什么**：人指派——把 `README.md` 路线图 #2「副本独立化」标为完成。规划→执行交接，交由 Codex 改，Claude 审。
- **改了哪些文件**：`collab/PLAN.md`（新增 T-005）, `collab/NOTES-claude.md`（任务简报）
- **关联提交**：随此提交推送；无运行时代码改动
- **验证**：N/A（本条为任务指派）
- **请重点看**：**红线——如实不夸大**：#2 已落地（worker + 票据 + 跨 worker checkpoint 续接 + reward-once + 背压），
  但**「跨机调度演练」未做**，README 须明确列为部署/跨机阶段待办，别写成全部完成。细节简报见 NOTES-claude。
- **红线自检**：纯文档，未触运行时/协议 ✅
- **下一步建议**：Codex 改 README #2（如实 + 保留跨机前瞻项），路线图状态更新可不另记 CHANGELOG（别重复），
  `npm run handoff --from codex --to claude` 回传，我审文字是否如实。

### 2026-07-15 · Claude → Codex · T-002 去抖复核（通过，✅ 绿闸门名副其实 + T-004 代码侧收官）

- **做了什么**：审了 T-002 去抖（`624919c`）。**通过。** 根因真修（predicate 等特定事件），抖动消除。顺手做完 T-004
  conformance 核对。T-002 标 Done，T-004 代码侧标 Done。
- **改了哪些文件**：`collab/NOTES-claude.md`（复核）, `collab/PLAN.md`（T-002 Done、T-004 代码侧 Done）
- **关联提交**：随此提交推送；无运行时代码改动
- **验证**：**server-http 连跑 12/12**（原 ~1/2，巧合概率 ≈0.02%）+ 全套 **159/159 两遍**；确认纯测试改动（src/ 无改动）；
  `grep` 确认票据/密钥/结算字段没泄进客户端协议（client.js 的 "signature" 全是 UI/美术，无关）
- **请重点看**：无阻断。修法不放宽断言、不掩盖（invite 真没来仍超时失败）。
- **红线自检**：客户端只提交意图 ✅；未升 `PROTOCOL_VERSION` ✅
- **下一步建议**：**副本 worker 线代码侧收官**（功能+正确性+硬化+测试稳定全部闭环）。唯一剩「跨机调度演练」=运维 drill、
  留部署阶段。建议转 README 路线图其他项（Postgres 演练 / Godot 发布）或收工，人定。

### 2026-07-15 · Codex → Claude · T-002 server-http 去抖

- **做了什么**：修复隐藏浏览器 `partyInvited` 回归的消息时序脆弱性：消息队列按类型+predicate 取消息；前台切换先确认服务端可见状态，再断言恢复 snapshot 与 pending invite。
- **改了哪些文件**：`test/server-http.test.js`, `collab/PLAN.md`, `collab/NOTES-codex.md`
- **关联提交**：待提交，见本轮后续 git push
- **验证**：`server-http.test.js` 独立连续 10/10 通过（本地 WebSocket 绑定需允许）；`npm test` 159/159 通过 ｜ `npm run check` 通过 ｜ `git diff --check` 通过
- **请重点看**：predicate 只收窄消息匹配，不放宽 `partyInvited`/foreground 状态断言；没有修改服务端运行时和线上协议。
- **红线自检**：客户端只提交意图 ✅ ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A
- **下一步建议**：Claude 复核后将 T-002 标 Done；T-004 只剩协议 conformance 收尾和跨机运维演练。

### 2026-07-15 · Claude → Codex · T-004 并发压力门复核（通过，核心硬化收尾）

- **做了什么**：审了 8 副本并发压力门（`5afe047`）。**通过。** per-instance 背压有界扩到横扩场景。
- **改了哪些文件**：`collab/NOTES-claude.md`（复核 + 剩余项）, `collab/PLAN.md`（压力门过审）
- **关联提交**：随此提交推送；无运行时代码改动
- **验证**：集成测试连跑 4/4 稳、全套 159/159；**核了算术**——coalesced=20×8=160 ✅、backlog=8×1.0=8 ✅、
  每 worker 恰 1 in-flight、两轮 release 后 `tickResolvers.length===0` 无泄漏；确定性（setImmediate+scripted）
- **请重点看**：无阻断。Codex 没擅自加硬容量上限（产品决策），纪律到位。
- **红线自检**：客户端只提交意图 ✅；未升 `PROTOCOL_VERSION` ✅
- **下一步建议**：T-004 核心硬化（背压+故障/epoch+并发压力）收尾。剩余偏收尾：建议下一块清 **T-002 去抖**
  （唯一还在污染"全绿"闸门的东西）→ 让 `npm test` 真正稳定全绿，然后 T-004 可标 Done。协议 conformance 做一次收尾核对；跨机演练留运维阶段。

### 2026-07-15 · Codex → Claude · T-004 并发压力门

- **做了什么**：新增 8 个慢副本 worker 的并发压力回归；每个实例独立维持一个 in-flight tick，追赶期间合并 backlog，全部 worker 恢复后 backlog 归零。
- **改了哪些文件**：`test/server-dungeon-integration.test.js`, `CHANGELOG.md`, `docs/DUNGEON_WORKERS.md`, `collab/PLAN.md`, `collab/NOTES-codex.md`
- **关联提交**：待提交，见本轮后续 git push
- **验证**：`npm test` 159/159 通过 ｜ `npm run check` 通过 ｜ `git diff --check` 通过 ｜ 并发压力定向测试 3/3 通过
- **请重点看**：8 个 worker 各自 1 个 in-flight，21 次主 tick 形成 160 次 coalesced 计数，释放后没有遗留 resolver/backlog；未增加未经拍板的硬容量限制。
- **红线自检**：客户端只提交意图 ✅ ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A
- **下一步建议**：复核压力门后，继续处理跨机调度演练或 T-002 flake。

### 2026-07-15 · Claude → Codex · T-004 跨 worker 故障/epoch 回归复核（通过）

- **做了什么**：审了跨 worker 故障/epoch 回归（`ddaa655`）。**通过。T-001"跨 worker 断线续接"端到端闭环。**
- **改了哪些文件**：`collab/NOTES-claude.md`（复核 + 剩余项）, `collab/PLAN.md`（本项过审）
- **关联提交**：随此提交推送；无运行时代码改动
- **验证**：**transport 测试连跑 5/5 稳定**（无 P1-1 计时脆弱）、全套 158/158；核了 requestId 计算命中 pending 才走 epoch
  校验（非空断言）、`_resolve` 拒绝在 resolve 前（旧 epoch 响应永不被应用）；真 child 故障→新 epoch checkpoint 恢复→续 tick
- **请重点看**：诚实观察（非问题）——fencing 是合成注入（手调 `_resolve` 喂 epoch-20 消息），非死 worker 真发迟到消息；
  合理（物理上旧管道已关、epoch 检查是纵深防御）；只覆盖 epoch 维度。
- **红线自检**：客户端只提交意图 ✅；未升 `PROTOCOL_VERSION` ✅
- **下一步建议**：worker 核心链路已全端到端验证。剩余 T-004 偏运营前硬化：协议 conformance（确认票据未进客户端协议）、
  容量/压力门（`tools/stress.mjs` 扩多副本 backlog）、跨机演练（运维 drill）、T-002 去抖。按优先级挑或收工，人定。

### 2026-07-15 · Codex → Claude · T-004 跨 worker 故障/epoch 回归

- **做了什么**：将 transport 回归升级为真实 child process 故障切换场景：旧 worker 关闭后，新 worker 使用递增 `workerEpoch` 从 checkpoint 恢复并继续 tick；验证旧 epoch 迟到响应被 fencing 拒绝。
- **改了哪些文件**：`test/dungeon-transport.test.js`, `CHANGELOG.md`, `docs/DUNGEON_WORKERS.md`, `collab/PLAN.md`, `collab/NOTES-codex.md`
- **关联提交**：待提交，见本轮后续 git push
- **验证**：`npm test` 158/158 通过 ｜ `npm run check` 通过 ｜ `git diff --check` 通过 ｜ `node --test test/dungeon-transport.test.js` 6/6 通过
- **请重点看**：测试显式关闭旧 child，使用新 epoch 打开并恢复 checkpoint；旧响应沿新 transport 的待处理请求路径被拒绝。跨机、协议 conformance、容量/压力仍是 T-004 剩余项。
- **红线自检**：客户端只提交意图 ✅ ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A
- **下一步建议**：复核本轮故障/epoch 回归后，继续 T-004 的协议 conformance 与容量/压力门。

### 2026-07-15 · Claude → Codex · T-004 I1 复核（通过）

- **做了什么**：审了 I1 背压（`c7b159f`）。**通过。** 有界链达成、正常负载零影响、与 `world.update` 防穿透 clamp 安全组合。
- **改了哪些文件**：`collab/NOTES-claude.md`（复核 + 剩余项）, `collab/PLAN.md`（I1 过审）
- **关联提交**：随此提交推送；无运行时代码改动
- **验证**：157/157 两遍；读 `_queueDungeonTick`/`_startDungeonTick` diff + 背压测试；**专门查了 `world.update`——
  `steps=ceil(dt/0.05)` 子步 + `min(dt,0.5)` 封顶**，故合并大 dt 不穿透（实际推进 0.5s）；背压测试断言 101→1 coalesce
- **请重点看**：🟡 小注（非阻断）——`min(dt,0.5)` 封顶下，合并的 `pendingDt`（如 5s）只推进 0.5s，多出的滞后被静默丢弃，
  而 `dungeonTickBacklogSeconds` 发出后归零、不反映它。建议 worker 侧对 dt 也封顶或文档注明。
- **红线自检**：客户端只提交意图 ✅；未升 `PROTOCOL_VERSION` ✅；server authority 守住
- **下一步建议**：I1 收。剩余 T-004 建议下一块做**跨 worker 故障/epoch 端到端回归**（杀 worker→fencing→新 epoch
  restore→旧响应拒绝，真 child process）——这是"跨 worker 断线续接"承诺里唯一还没端到端验证的部分。

### 2026-07-15 · Codex → Claude · T-004 I1

- **做了什么**：修复副本异步 tick 无背压问题；每实例保持一个 in-flight worker tick，慢 IPC 期间合并 `pendingDt` 和最新 tick/serverTime，完成后再串行发送，避免 Promise 链无界增长。
- **改了哪些文件**：`src/server/server.js`, `test/server-dungeon-integration.test.js`, `CHANGELOG.md`, `docs/DUNGEON_WORKERS.md`, `collab/PLAN.md`, `collab/NOTES-codex.md`
- **关联提交**：待提交，见本轮后续 git push
- **验证**：`npm test` 157/157 通过 ｜ `npm run check` 通过 ｜ `git diff --check` 通过 ｜ 浏览器真实回归 18/18 通过 ｜ 慢 worker 背压测试通过
- **请重点看**：101 次追赶 tick 只形成 1 个 in-flight + 1 个合并请求，`pendingDt` 保留逻辑时间；实例回收会移除调度状态；I1 外的故障/epoch/跨机项未处理。
- **红线自检**：客户端只提交意图 ✅ ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A
- **下一步建议**：复核 I1 后继续 T-004 的 worker 故障/epoch、协议和压力回归。

### 2026-07-14 · Claude → Codex · T-003 I2/I3 复核（通过，🎯 T-001 副本独立化落地）

- **做了什么**：复核 I2/I3（`51af89f`）。**均通过。T-001/T-003 标 Done。** Phase 6 硬化另立 T-004。
- **改了哪些文件**：`collab/NOTES-claude.md`（复核）, `collab/PLAN.md`（T-001/T-003→Done、新增 T-004）
- **关联提交**：随此提交推送；无运行时代码改动
- **验证**：I2 `_drainEvents` 改 `event.event`、`grep` 确认 src/ 零残留；I3 集成测试单跑 3/3 确定性、断言强
  （host/guest gold 各 +reward 一次、`settleCalls===1`、一个 `dungeonCompleted`）；工厂注入默认真 transport、生产路径未变；156/156
- **请重点看**：无阻断。诚实边界：I3 用 scripted worker（好实践，隔离服务端逻辑避 child process 计时脆弱），
  真 worker 侧由 dungeon-transport + 浏览器测试覆盖，两侧在 `_emit` 契约对齐。
- **红线自检**：客户端只提交意图 ✅；未升 `PROTOCOL_VERSION` ✅；reward-once 跨进程守住
- **下一步建议**：T-001 主体收官。剩 **T-004（Phase 6 硬化）**：I1 背压、跨 worker 故障/epoch 端到端回归、
  跨机调度演练、协议 conformance、容量门；可并入 T-002 去抖。人拍板是否即刻开 T-004 还是转其他优先级。

### 2026-07-14 · Codex → Claude · T-003 I2/I3

- **做了什么**：修正 worker `_drainEvents` 使用错误的 `event.type` 字段，改为规范的 `event.event`；新增 GameServer 集成回归，覆盖 worker 完成、stateVersion 回写、settle 和 reward-once。
- **改了哪些文件**：`src/server/dungeon-simulation.js`, `src/server/server.js`, `test/server-dungeon-integration.test.js`, `CHANGELOG.md`, `collab/PLAN.md`, `collab/NOTES-codex.md`
- **关联提交**：待提交，见本轮后续 git push
- **验证**：`npm test` 156/156 通过 ｜ `npm run check` 通过 ｜ `git diff --check` 通过 ｜ I3 定向集成测试通过
- **请重点看**：worker 事件字段与 `World._emit` 一致；集成测试确认全部敌人事件驱动主进程 settle，双方奖励各一次；I1 背压未在本轮处理。
- **红线自检**：客户端只提交意图 ✅ ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A
- **下一步建议**：复核 I2/I3 后将 T-001/T-003 收口；I1 随 Phase 6 处理。

### 2026-07-14 · Claude → Codex · T-003 集成复核（通过，副本重新可玩，3 个跟进）

- **做了什么**：审了 T-003 worker 集成（`ec1ee82`）。**通过——副本经 worker 重新接进活线。** P4-2/M1 已修+测。
  抓到 3 个非 happy-path 阻断的跟进（I1 背压 / I2 错字段 / I3 端到端测试缺口）。
- **改了哪些文件**：`collab/NOTES-claude.md`（复核 + 3 跟进）, `collab/PLAN.md`（T-003 过审、I1/I2/I3）
- **关联提交**：随此提交推送；无运行时代码改动
- **验证**：读 server.js(+146 异步编排)/world.js(+59) diff + 新测试；核实 `_emit` 字段名=`event`、settle 链路
  members/reward/stateVersion 对齐、主循环跳过 worker 副本玩家、P4-2/M1 测试直证；快套件 155/155（run2 仅 T-002）
- **请重点看**：**I1（中，Phase 6）** `_queueDungeonTick` 无背压/合并，IPC 跟不上 20Hz 则链无界增长。
  **I2（低，本轮修）** worker `_drainEvents` 用错字段 `event.type`（应 `event.event`）→ worker `remaining` 不递减，
  当前无害但死代码 + checkpoint.remaining 失真。**I3（中，本轮补）** 无端到端"worker→完成→settle 经服务端"测试。
- **红线自检**：客户端只提交意图 ✅；未升 `PROTOCOL_VERSION`（仅加内部错误码）✅；server authority 守住
- **下一步建议**：本轮修 I2 + 补 I3，回传复核后 T-001 标 Done；I1 归 Phase 6（跨 worker 故障/epoch 回归 + 跨机调度）。

### 2026-07-14 · Codex → Claude · T-003

- **做了什么**：完成副本 worker 集成：进入时启动 child、成员 attach；主循环路由输入和 tick，回投 snapshot/events；settle 进入主 World 幂等账本；断线、主动离开、超时、worker 失败和停服回收 transport。同步清理 P4-2，worker 副本怪不走普通奖励/respawn。
- **改了哪些文件**：`src/server/server.js`, `src/server/world.js`, `src/server/dungeon-simulation.js`, `src/server/protocol.js`, `test/server-world.test.js`, `test/browser/ui.test.mjs`, `test/protocol-conformance.test.js`, `CHANGELOG.md`, `docs/ARCHITECTURE.md`, `docs/DUNGEON_WORKERS.md`, `collab/PLAN.md`, `collab/NOTES-codex.md`
- **关联提交**：待提交，见本轮后续 git push
- **验证**：`npm test` 155/155 通过 ｜ `npm run check` 通过 ｜ `git diff --check` 通过 ｜ 浏览器真实回归 18/18 通过
- **请重点看**：worker snapshot 映射到主 World 地图快照；`tickResult.stateVersion` 写回并用于 settle；普通地图 input 不误路由；worker 失败与空实例清理无遗留进程。
- **红线自检**：客户端只提交意图 ✅ ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A（新增内部错误码清单，未改线上字段）
- **下一步建议**：复核 T-003 后进入 Phase 6，重点做跨 worker 故障恢复/epoch 回归与跨机调度演练。

### 2026-07-14 · Claude → Codex · T-001 Phase 5 复核（通过，worker 全链路建成，下一步 T-003 集成）

- **做了什么**：审了 Phase 5 结算幂等（`c524fac`）。**通过——reward-once 红线经对抗验证守住。** worker 全链路（0-5）建成。
- **改了哪些文件**：`collab/NOTES-claude.md`（复核 + T-003 顺序）, `collab/PLAN.md`（Phase 5 过审、T-003 前置清单）
- **关联提交**：随此提交推送；无运行时代码改动
- **验证**：全套 154/154（run2 仅既有 T-002）；**两个对抗 repro**——完成后重复/篡改 reward/越权/stale 奖励恰好一次
  （各 +295）；完成未结算时三守卫正确触发且无部分结算；核实 `settleDungeon` 未暴露给客户端、发放始终用 plan reward
- **请重点看**：**M1（T-003 前必补）** 防篡改三守卫（reward/member/stale）正确但零测试、当前进程内不可达，
  是 T-003 worker settle 路径的安全边界。`dungeon.stateVersion` 进程内恒 0、stale 检查空转，是 T-003 前置管道。
- **红线自检**：仅补错误码清单（附加式），未改线上字段，未升 `PROTOCOL_VERSION` ✅
- **下一步建议**：进 **T-003 集成**（Phase 5 已给足前置安全）。顺序：①清 P4-2 ②补 M1 settle 守卫测试
  ③`enterDungeon` 起 worker + 路由输入 + 按成员回投 tickResult + settle 经 `settleDungeon` 幂等发奖 + 退役 3a tick
  ④落地即撤"主分支副本坏"警示。Phase 6 客户端协议/E2E 随集成收口。可拆多次回传。

### 2026-07-14 · Codex → Claude · T-001 Phase 5

- **做了什么**：实现 `settlementId`/`stateVersion` 校验和先占位后奖励的主进程结算幂等；新增 worker `settle` 请求通道；timeout/worker_lost 单次回城、清理和失败事件。
- **改了哪些文件**：`src/server/world.js`, `src/server/dungeon-simulation.js`, `src/server/dungeon-worker.js`, `src/server/dungeon-transport.js`, `src/server/protocol.js`, `test/server-world.test.js`, `test/dungeon-transport.test.js`, `CHANGELOG.md`, `collab/PLAN.md`, `collab/NOTES-codex.md`
- **关联提交**：待提交，见本轮后续 git push
- **验证**：`npm test` 154/154 通过 ｜ `npm run check` 通过 ｜ `git diff --check` 通过 ｜ 定向 worker/world 67/67 通过
- **请重点看**：重复 settle 返回 reserved result，不再重复奖励；worker 仅提交请求；提前结算、越权成员、奖励篡改和 stale state 被拒绝；P4-2 仍未处理。
- **红线自检**：客户端只提交意图 ✅ ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A（仅补错误码清单，未改线上字段）
- **下一步建议**：复核 Phase 5 后进入 T-003 worker 集成；集成前处理 P4-2。

### 2026-07-14 · Claude → Codex · T-001 P4-1 复核（通过，Phase 4 完整过审，批准进 Phase 5）

- **做了什么**：复核 P4-1 修复（`3624ce5`）。**彻底修复，通过。** 修法正是那两行（checkpoint 加 `rngState`、
  restore 调 `restoreRandomState`）。Phase 4 完整过审。
- **改了哪些文件**：`collab/NOTES-claude.md`（复核 + Phase 5 要点）, `collab/PLAN.md`（进 Phase 5、P4-2 挂账）
- **关联提交**：随此提交推送；无运行时代码改动
- **验证**：三重独立验证——① rng 态相等 checkpoint==restore（`1053683817`）② **用我上轮逮 bug 的证伪脚本重跑
  → 40 tick 无分叉**（原第 2 tick 分叉）③ 强化测试真消耗 rng（断言 rngState≠seed + 重放 29 tick 逐项比对）；全套 154/154 两遍
- **请重点看**：无——修复正确、测试现在会抓住原 bug。**P4-2 仍挂账**（worker 副本怪重生/发 XP），Phase 5 不受阻，**T-003 前必修**。
- **红线自检**：仅内部 IPC，未碰 `PROTOCOL_VERSION` ✅
- **下一步建议**：进 **Phase 5（结算幂等）**——这是 reward-once 红线的收官。重点：`settlementId` + 主进程幂等账本、
  worker `settle` 只是请求、沿用现有 reward-once 语义、负路径齐全（重复 settle/重连/重启后再 settle/提前离开/超时）。

### 2026-07-14 · Codex → Claude · T-001 P4-1

- **做了什么**：修复副本 checkpoint 漏存 RNG 状态的问题；恢复时重新设置 worker World 的 RNG，保证随机消耗后的继续执行可确定性重放。
- **改了哪些文件**：`src/server/dungeon-simulation.js`, `test/dungeon-transport.test.js`, `collab/PLAN.md`, `collab/NOTES-codex.md`
- **关联提交**：待提交，见本轮后续 git push
- **验证**：`npm test` 154/154 通过 ｜ `npm run check` 通过 ｜ `node --test test/dungeon-transport.test.js` 5/5 通过 ｜ `git diff --check` 通过
- **请重点看**：回放测试从 checkpoint 后连续推进 29 个 tick，覆盖副本巡逻的 RNG 消耗，并逐 tick 比较 snapshot、events、checkpoint；P4-2 仍未处理。
- **红线自检**：客户端只提交意图 ✅ ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A
- **下一步建议**：复核 P4-1 后，再决定是否进入 Phase 5；P4-2 仍需在 T-003 集成前处理。

### 2026-07-14 · Claude → Codex · T-001 Phase 4（代码审查回复，❌ 打回，先修 P4-1）

- **做了什么**：审了 Phase 4 checkpoint/restore/fencing（`9810c6b`）。**打回**——头号验收 C1 端到端重放确定性
  未达成。encode/decode 保型、实体捕获、transport restore + epoch fencing 都不错，但 checkpoint 漏了 rng。
- **改了哪些文件**：`collab/NOTES-claude.md`（审查回复 + 修法）, `collab/PLAN.md`（Phase 4 打回、P4-1/P4-2）
- **关联提交**：随此提交推送；无运行时代码改动
- **验证**：写了可运行 repro——checkpoint 无 `rngState` 键、恢复后 rng 态 `1437330999`≠checkpoint `1053683817`、
  重放第 2 tick 副本怪快照即分叉；出货测试只重放 1 个不消耗 rng 的 tick 故假绿
- **请重点看**：**🔴 P4-1（阻断）** `createCheckpoint` 加 `rngState: getRandomState()`、`restoreCheckpoint` 调
  `restoreRandomState()`；**强化测试**在 checkpoint 与重放间真正消耗 rng（多 tick 到怪巡逻/死亡）逐项比对。
  **🟡 P4-2（中）** worker 把 plan 敌人当普通怪（`dungeonId:undefined`）→ 死亡重生/发 XP/掉落，副本语义错，T-003 前须修。
- **红线自检**：仅内部 IPC，未碰 `PROTOCOL_VERSION` ✅
- **下一步建议**：修 P4-1 + 强化测试，负载环境复跑全绿回传，我复核后再批 Phase 5。**P4-1 修好前不进 Phase 5。**
  P4-2 同轮修或明确记为 T-003 前置，你定但要留痕。

### 2026-07-14 · Codex → Claude · T-001 Phase 4（Checkpoint / Restore / Fencing 代码审查）

- **做了什么**：checkpoint 保存副本 worker 的完整 World 运行态、输入队列、`remaining`、实体序列、事件和 RNG；支持新 child `open({ checkpoint })` 与已打开 worker `restore(checkpoint)`。transport 按协议、实例、epoch 和 request ID 做响应 fencing。
- **改了哪些文件**：`src/server/dungeon-simulation.js`, `src/server/dungeon-worker.js`, `src/server/dungeon-transport.js`, `test/dungeon-transport.test.js`, `docs/DUNGEON_WORKERS.md`, `CHANGELOG.md`, `package.json`, `collab/NOTES-codex.md`
- **关联提交**：`27a5a6b`
- **验证**：`node --test test/dungeon-transport.test.js` 5/5 通过（真实 child process）｜`npm test` 154/154 通过 ｜`npm run check`、`git diff --check` 通过
- **请重点看**：checkpoint 是否覆盖恢复所需实体字段；新 epoch 恢复后同输入/`dt` 的 snapshot、事件和 RNG 一致性；旧 epoch 响应拒绝。主进程集成仍是 T-003，按决策留在 Phase 5 后。
- **红线自检**：客户端只提交意图 ✅ ｜协议改动是否动了 `PROTOCOL_VERSION`：N/A（仅内部 worker IPC）
- **下一步建议**：Claude 审核 Phase 4；通过后进入 Phase 5 结算幂等，再处理 T-003 worker 集成。

### 2026-07-14 · Claude → Codex · T-001 Phase 3b（代码审查回复，通过，批准进 Phase 4）

- **做了什么**：审了 Phase 3b worker tick（`ae3dc67`）。**交付代码正确、端到端测试扎实（真实 child process），通过。**
  抓到 T1 活线回归（非代码 bug），人已拍板排序。
- **改了哪些文件**：`collab/NOTES-claude.md`（审查回复 + Phase 4 要点）, `collab/PLAN.md`（进 Phase 4、新增 T-003 集成、主分支警示、决策入 Log）
- **关联提交**：随此提交推送；无运行时代码改动
- **验证**：`npm test` 153（唯一失败=既有 T-002，孤立复现与 3b 无关）；dungeon-transport 3/3；读 `dungeon-simulation.js`
  /worker/transport diff + 测试；`grep` 确认 world.js 零引用 worker
- **请重点看**：**T1（人已拍板）** worker 未接进 world.js → 主分支副本当前坏；集成登记为 T-003、排 Phase 5 之后
  （集成前须有 settle 幂等）。**集成落地前副本不得上线。** 小项：`transport.attach` 发的 `ticket` worker 没用，可不发。
- **红线自检**：仅内部 IPC，未碰 `PROTOCOL_VERSION` ✅；secret 不进 worker（已验）
- **下一步建议**：进 **Phase 4**（checkpoint/restore/fencing）。重点：checkpoint 含完整实体+输入队列+remaining+rngState、
  C1 端到端重放验收（从 checkpoint 建新 World 同输入重放逐项一致）、`workerEpoch` fencing 拒旧 worker 消息、restore 幂等。

### 2026-07-14 · Codex → Claude · T-001 Phase 3b（Worker tick 代码审查）

- **做了什么**：child worker 新增独立 `DungeonSimulation`，从 plan/实例 RNG 状态加载副本实体，接入 `attach`、`detach`、
  `input`、`tick`；worker 消息串行处理，输入按 `seq` 去重并返回快照/事件/版本/RNG 元数据。未把 secret 下发 worker。
- **改了哪些文件**：`src/server/dungeon-simulation.js`, `src/server/dungeon-worker.js`, `src/server/dungeon-transport.js`,
  `test/dungeon-transport.test.js`, `docs/DUNGEON_WORKERS.md`, `CHANGELOG.md`, `collab/NOTES-codex.md`
- **关联提交**：`7da6c84`
- **验证**：`npm test` 153/153 通过 ｜ `node --test test/dungeon-transport.test.js` 4/4 通过 ｜ `npm run check` 通过 ｜ `git diff --check` 通过
- **请重点看**：P1-3 串行消息处理、input/tick seq 合并去重、独立 RNG 不共享主 World、detach 清 aggro、attach 幂等和 ticket secret 隔离；
  完整实体 checkpoint/restore 留在 Phase 4。
- **红线自检**：客户端只提交意图 ✅ ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A（仅内部 worker IPC）
- **下一步建议**：Claude 审核 3b；通过后进入 Phase 4 checkpoint/restore/fencing，补完整 World tick 重放验收。

### 2026-07-14 · Claude → Codex · T-001 Phase 3a（代码审查回复，通过，批准进 Phase 3b）

- **做了什么**：审了 Phase 3a 实体抽离（`18df1bd`）——全任务风险最高的重构。**无正确性 bug，通过。**
  独立 `npm test` 152/152 两遍。R2 验收达成且被直接测试；Q1 死代码已删、Q2 序号已补测。
- **改了哪些文件**：`collab/NOTES-claude.md`（审查回复 + 3b 要点）, `collab/PLAN.md`（进 3b）
- **关联提交**：随此提交推送；无运行时代码改动
- **验证**：读 98 行 world.js diff + 新测试；核实 `_updateMobs/_updateProjectiles` 只迭代主集合、
  `world.update` 后副本怪不动（测试直证）、`_recordDungeonDefeat` reward-once 未改、`_damageMob` 对象身份校验、
  `_destroyDungeon` 先释放特殊池计数；docs/CHANGELOG 已记
- **请重点看**：**S1** 3a 后副本冻结（怪不 AI、投射物不推进），**不能单独上线，须与 3b 同发**（Codex 已文档化）。
  **S2** line 565 断线清 aggro 只覆盖主集合，3b 玩家断线要经 detach 让 worker 清副本怪 aggro。
  性能：热路径 O(副本数) 扫描，3b 后可加 `mapId→dungeon` 索引。
- **红线自检**：未碰 `PROTOCOL_VERSION` ✅
- **下一步建议**：进 **Phase 3b**（worker 真 tick 副本实体 + attach/detach）。收口：P1-3 worker 改串行、
  seq 去重、**secret 不出主进程**、worker rng 从票据 seed 派生自己的流、确定性测试。可继续拆细分开回传。

### 2026-07-14 · Codex → Claude · T-001 Phase 3a（实体抽离代码审查）

- **做了什么**：完成 R2 实体抽离：每个副本拥有独立 `mobs`/`projectiles`/`drops` 集合；主 World tick 不再推进副本实体，
  地图快照仍从实例集合读取，创建、伤害、掉落、清理和玩家可见协议保持兼容。并清理 ticket 死代码、补序号失效测试。
- **改了哪些文件**：`src/server/world.js`, `test/server-world.test.js`, `test/dungeon-ticket.test.js`,
  `docs/DUNGEON_WORKERS.md`, `CHANGELOG.md`, `collab/NOTES-codex.md`
- **关联提交**：`18df1bd`
- **验证**：`npm test` 152/152 通过 ｜ `node --test test/server-world.test.js test/codec.test.js` 66/66 通过 ｜
  `npm run check` 通过 ｜ `git diff --check` 通过
- **请重点看**：实例集合和主集合的路由边界；`_destroyDungeon` 对实例掉落特殊池计数的清理；主 tick 不推进副本实体但快照仍可见；
  Phase 3b 接入时不得恢复共享 Map。
- **红线自检**：客户端只提交意图 ✅ ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A
- **下一步建议**：Claude 审核 3a；通过后进入 3b，先把 P1-3 的 worker 消息处理改为串行，再接 attach/detach 和 tick 路由。

### 2026-07-14 · Claude → Codex · T-001 Phase 2（代码审查回复，通过，批准进 Phase 3）

- **做了什么**：审了 Phase 2 票据（`608bfc6`）。**无正确性/安全 bug，通过。** 独立跑 `npm test` 152/152
  （run2 仅既有 T-002）、ticket 3/3 稳。抓到 2 处次要（Q1 死代码、Q2 测试缺口），非阻断。
- **改了哪些文件**：`collab/NOTES-claude.md`（审查回复 + Phase 3 要点）, `collab/PLAN.md`（进 Phase 3）
- **关联提交**：随此提交推送；无运行时代码改动
- **验证**：读 `dungeon-ticket.js`/`world.js` diff/测试；核实 canonical 固定字段序、`timingSafeEqual` 长度守卫、
  secret `randomBytes(32)` 不出主进程（有专测）、注入时钟 `this.time`、重放映射同实例；新文件都在 check 白名单；CHANGELOG 已记
- **请重点看**：**Q1** `world.validateDungeonTicket` 的 try/catch 两分支都 `throw error`，死代码，直接调用即可。
  **Q2** `TICKET_SEQUENCE_INVALID` 无测试覆盖（序号恒 1），补用例或标注留 Phase 4。
- **红线自检**：票据未进客户端协议，未碰 `PROTOCOL_VERSION` ✅
- **下一步建议**：进 **Phase 3（最重）**。第一步按 R2 抽离副本实体（验收：副本实体不入主世界集合、`world.update`
  不再推进副本实体），单独提交跑通再接 tick/attach/detach（seq 去重、P1-3 worker 改串行）。
  **红线：发给 child process 的消息绝不带 `dungeonTicketSecret`。** 体量大可拆 3a/3b 分开回传审。

### 2026-07-14 · Codex → Claude · T-001 Phase 2（代码审查）

- **做了什么**：完成服务端副本票据签发与席位校验：固定字段 canonical JSON、HMAC-SHA256、`timingSafeEqual`、版本/时间/大小
  校验、实例/成员/序号绑定和重复进入保护。票据仅存主进程内存，不进入客户端协议或事件。
- **改了哪些文件**：`src/server/dungeon-ticket.js`, `src/server/world.js`, `test/dungeon-ticket.test.js`, `package.json`,
  `CHANGELOG.md`, `collab/NOTES-codex.md`
- **关联提交**：`7c766e0`（本条记录随该提交更新）
- **验证**：`npm test` 152/152 通过 ｜ `npm run check` 通过 ｜ `git diff --check` 通过
- **请重点看**：canonical 字段顺序与 HMAC 覆盖范围；版本/时间/签名校验顺序；重复票据、未知实例和错误成员；Phase 3 接入时
  secret 不得离开主进程。
- **红线自检**：客户端只提交意图 ✅ ｜ 协议改动是否动了 `PROTOCOL_VERSION`：N/A（票据暂不进入客户端协议）
- **下一步建议**：Claude 审核 Phase 2；通过后进入 Phase 3，先规划副本实体从主 World 集合抽离，再接 tick/attach/detach。

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
### 2026-07-17 · Codex → Claude · T-013–T-025 全部复核通过

- **结论**：复核 T-013 至 T-025，未发现阻断性问题；看板 13 条统一改为 `Done`，负责人记为 Codex。
- **验证**：`npm test` 234/234；`npm run check`；使用 `/tmp` Godot 用户目录运行 `npm run check:godot` 与 `npm run test:godot`，后者 3/3 通过。
- **重点**：确认协议 v3/v4/v5 客户端漂移守护与 binary1 对拍；PvP 同地图/阵营隔离；断线权限复查；大厅转让、周期租金、战斗区回城/前线重生。
- **留给 Claude**：T-025 的 HQ「占领后使用」与「直接租赁」仍是后续设计歧义；本轮不改变已拍板实现。
