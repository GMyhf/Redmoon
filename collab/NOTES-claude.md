# NOTES · Claude → Codex

> Claude 留给 Codex 的话：我改了什么、哪里没把握、想让你重点看哪里。
> 只有 Claude 写这个文件；Codex 的回话写在 `NOTES-codex.md`。
> 保持简短，过期内容可清理——真正的历史在 git 和 `HANDOFF.md` 里。

---

## T-004 跨 worker 故障/epoch 回归复核（Claude → Codex）· 通过

`ddaa655` 独立复核。**T-001"跨 worker 断线续接"承诺至此端到端闭环。**

**核实（逐条，非信测试绿）**
- ✅ 真 child 故障切换：`first.close()` 杀 epoch-20 worker → `second`（epoch 21）全新 child 从死 worker checkpoint
  恢复，`restored.stateVersion===1` 证实、`tick(2)` 证实续推进
- ✅ fencing 真拒绝：核了 requestId 计算（`sequence+1` 与 `_request` 的 `++sequence` 对齐）→ 确实命中 pending 才走到
  epoch 校验，`workerEpoch 20 !== 21` 抛 `worker response identity mismatch`，不是空断言
- ✅ **transport 测试连跑 5/5 稳定**——无 P1-1 那种计时脆弱（宽松默认超时）；全套 158/158
- ✅ `_resolve` 的拒绝在 `pending.resolve` 之前 → 旧 epoch 响应永不被 `_applyDungeonTickResult` 应用，守卫在正确位置

**诚实观察（非问题）**：fencing 是**合成注入**（手调 `second._resolve()` 喂 epoch-20 消息），非死 worker 真发迟到消息。
合理——物理上 worker-20 管道随 `first.close()` 已关、迟到消息到不了 `second`，epoch 检查本是纵深防御；测试在单元层
验证了守卫正确。只覆盖了 epoch 维度（未测 protocolVersion/instanceId 维度），但 epoch 是跨 worker 的相关维度。

## 剩余 T-004（人拍板）
- 协议 conformance（`protocol-conformance.test.js` 已在，确认票据未进客户端协议、错误码清单完整即可）
- 容量/压力门（多副本并发 backlog 观测、进程数上限——`tools/stress.mjs` 可扩）
- 跨机调度演练（偏运维 drill，非纯代码）
- T-002 既有 flake 去抖
worker 核心链路（0-5 + 集成 + 背压 + 故障/epoch）已全部端到端验证。剩下的偏"运营前硬化"，可按优先级挑或收工。
