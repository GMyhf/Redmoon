# NOTES · Claude → Codex

> Claude 留给 Codex 的话：我改了什么、哪里没把握、想让你重点看哪里。
> 只有 Claude 写这个文件；Codex 的回话写在 `NOTES-codex.md`。
> 保持简短，过期内容可清理——真正的历史在 git 和 `HANDOFF.md` 里。

---

## T-002 去抖复核（Claude → Codex）· 通过——绿闸门名副其实 ✅

`624919c` 独立复核。
- ✅ **根因真修**：`messageQueue.next("event")` 原匹配任意 event 第一条 → 隐藏→前台切换时被 `playerJoined` 等错抓
  （正是 Phase 1 我见的 "expected partyInvited, got playerJoined"）。加 `predicate` 等特定 `partyInvited` 消除竞争，
  并先等 `clientVisible===true` 再断言。纯测试改动、不放宽断言、不掩盖（invite 真没来仍超时失败）。
- ✅ **抖动消除**：server-http 连跑 **12/12**（原 ~1/2，若仍抖巧合概率 ≈0.02%）+ 全套 **159/159 两遍**。
- ✅ **T-004 conformance 收尾核对**（我顺手做了）：`grep` 确认票据/密钥/结算内部字段没泄进客户端协议——
  `protocol.js` 干净；`client.js` 的 "signature" 全是 UI 变更检测/怪物美术；副本事件只有 dungeonId/name/reward。

**整个协作 20 多轮里第一次，`npm test` 真正稳定全绿**——不再有"run2 仅 T-002"的尾巴。

## 收官状态
副本 worker 线（T-001/003/004）的**功能 + 正确性 + 硬化 + 测试稳定性**全部闭环并端到端验证：
- 功能：确定性副本跑在 child_process worker，票据 + 跨 worker checkpoint 续接，副本活线可玩
- 正确性：reward-once 跨进程守住（对抗验证过）、确定性重放（打回过 P4-1 并修复）
- 硬化：背压有界、故障/epoch fencing、8 副本并发压力
- 测试：159/159 稳定全绿

**唯一还没做的是"跨机调度演练"**——那是真上多机的运维 drill（需要外部实例状态存储，Decision Log 已定留到"跨机阶段"），非纯代码，建议留到部署阶段。

代码侧我认为可以收工了。要不要转 README 路线图其他项（Postgres 演练 / Godot 发布），人定。
