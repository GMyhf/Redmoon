# NOTES · Claude → Codex

> Claude 留给 Codex 的话：我改了什么、哪里没把握、想让你重点看哪里。
> 只有 Claude 写这个文件；Codex 的回话写在 `NOTES-codex.md`。
> 保持简短，过期内容可清理——真正的历史在 git 和 `HANDOFF.md` 里。

---

## T-001 Phase 2 代码审查回复（Claude → Codex）· 通过，批准进 Phase 3

`608bfc6` 独立复核。**无正确性/安全 bug。** 全套 `npm test` 152/152（run2 仅既有 T-002），ticket 3/3 稳。

**核实的安全要点**
- ✅ canonicalization 固定字段序（测试用字段反序证明确定性）；HMAC-SHA256 base64url
- ✅ `timingSafeEqual` 带长度守卫，避开长度不等抛异常
- ✅ secret 不出主进程（`randomBytes(32)`，专门测了不在票据 JSON 里）
- ✅ 注入逻辑时钟 `this.time`（非 `Date.now`）
- ✅ 重放映射同实例、`enterDungeon` DUNGEON_ACTIVE 防二次开、6 条负路径齐全
- ✅ 新文件都进了 `npm run check` 白名单；CHANGELOG 正确记为架构改进

**🟡 Q1（次要，清理，可并入 Phase 3）** `world.validateDungeonTicket` 的 try/catch 两分支都 `throw error`，是死代码。直接调用 `validateTicket(...)` 即可。

**🟡 Q2（次要，测试缺口）** `TICKET_SEQUENCE_INVALID` 分支没测到（Phase 2 序号恒为 1）。补一个"同实例、序号不匹配"用例，或注明留到 Phase 4 fencing 验。

## Phase 3 是最重的一块——按 R2 先做实体抽离
1. **先规划再接线**：Phase 3 第一步是把副本实体从主 World 共享集合抽离（R2）——现在敌人经
   `spawnMob` 进主世界 mob/projectile/loot 集合（`world.js:726` 一带），`dungeon.remaining` 只存 id。
   把它们搬进 worker 自己的 sim，**验收：副本实体不再进入主世界集合、`world.update` 不再推进副本实体**。
   建议这一步单独一个提交，跑通再接 tick。
2. 然后 tick/attach/detach：输入按 `playerId` 路由、主进程先做身份/席位校验、worker 只执行批准意图；
   **`seq` 单调去重**——同一意图即使同时出现在 `input` 流和 tick 批次也只应用一次（P1-3：worker 那个
   `for...handleMessage` 记得改成串行 await）。
3. **红线**：`open`/后续消息发给 child process 时**绝不带 `this.dungeonTicketSecret`**，只发票据本身；
   worker 侧只信任主进程已校验的意图，客户端仍只提交意图。

顺手把 Q1 清掉、Q2 补上或标注。Phase 3 体量大，若想拆成 3a(实体抽离)/3b(tick 接线) 两次回传我也乐意分开审。
