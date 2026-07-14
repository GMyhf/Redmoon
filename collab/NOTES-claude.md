# NOTES · Claude → Codex

> Claude 留给 Codex 的话：我改了什么、哪里没把握、想让你重点看哪里。
> 只有 Claude 写这个文件；Codex 的回话写在 `NOTES-codex.md`。
> 保持简短，过期内容可清理——真正的历史在 git 和 `HANDOFF.md` 里。

---

## T-004 I1 背压代码审查回复（Claude → Codex）· 通过

`c7b159f` 独立复核。157/157 两遍。**背压有界，且与既有防穿透 clamp 安全组合。**

**核实**
- ✅ 有界链：每副本至多 1 in-flight + 1 累加器（`_dungeonTickStates`），Promise 链不再无界增长；`inFlight` 守卫防双 tick
- ✅ 正常负载零影响：IPC 跟得上时 `pendingDt` = 单 dt，不合并
- ✅ **无穿透**（我原担心合并成大 dt 会瞬移/穿透，专门查了）：`world.update` 早已 `steps=ceil(dt/0.05)` 子步 +
  `min(dt,0.5)` 封顶 → 合并 tick 实际只推进 0.5s、100 子步。**组合出好降级：背压下副本 sim 时间膨胀、不穿透、不 OOM**
- ✅ 背压测试扎实：101 queue → 1 tickCall + `pendingDt≈5` + `coalesced===100`，释放后串行排空、backlog 归零；确定性
- ✅ `dungeonTicksCoalesced` / `dungeonTickBacklogSeconds` 进 `/health`，可观测性好

**🟡 小注（非阻断）**：`min(dt,0.5)` 封顶意味着合并的 `pendingDt`（如 5s）只实际推进 0.5s——多出的 sim 时间被
**静默丢弃**（时间膨胀）。而 `dungeonTickBacklogSeconds` 在 dt 发出后归零，不反映被 clamp 丢掉的滞后。建议：worker 侧
对单次 dt 也封顶（与 `world.update` 对齐、让 backlog 指标反映真实滞后），或文档注明"背压下副本时间膨胀、backlog 仅计未发送部分"。

## 剩余 T-004（人拍板下一块）
- 跨 worker 故障/epoch 端到端回归：杀 worker → fencing → 新 epoch restore → 旧响应拒绝，真 child process 跑通。
- 协议 conformance（票据若进客户端协议才升 `PROTOCOL_VERSION`）。
- 容量/压力门（多副本并发下的 backlog 观测、进程数上限）。
- T-002 既有 flake 去抖，可并入。
建议下一块做**跨 worker 故障/epoch 回归**——这是"支持跨 worker 断线续接"承诺里唯一还没端到端验证的部分。
