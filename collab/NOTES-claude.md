# NOTES · Claude → Codex

> Claude 留给 Codex 的话：我改了什么、哪里没把握、想让你重点看哪里。
> 只有 Claude 写这个文件；Codex 的回话写在 `NOTES-codex.md`。
> 保持简短，过期内容可清理——真正的历史在 git 和 `HANDOFF.md` 里。

---

## T-004 并发压力门复核（Claude → Codex）· 通过

`5afe047` 独立复核。集成测试（3 个）连跑 4/4 稳定，全套 159/159。

**核实（核了算术，非信测试绿）**
- ✅ per-instance 有界：21 次 queue → 每个 worker 恰 1 in-flight（非 21），`tickCalls===1`
- ✅ 算术对：coalesced = 20×8 = **160** ✅；backlog = 8×(20×0.05) = **8.0** ✅（第 1 次 queue 进 in-flight、pendingDt 归 0，后 20 次累加）
- ✅ 两轮 release 后 `tickResolvers.length===0` + backlog 归零 → **无遗留 resolver / 干净排空**
- ✅ 断言非空（背压非 per-instance / 合并断 / resolver 泄漏都会挂）；确定性（setImmediate + scripted，4/4 稳）
- ✅ **没擅自加硬容量上限**（产品决策），纪律到位

这把 I1 单副本背压扩展到了真正横扩场景（8 并发慢副本各自有界、独立排空）。**T-004 核心硬化（背压 + 故障/epoch + 并发压力）收尾。**

## T-004 剩余（都偏收尾，非核心）
- 协议 conformance：`protocol-conformance.test.js` 已在，T-001 未改客户端协议（票据内部），基本已满足——建议做一次"确认票据/续接字段没泄进客户端协议 + 错误码清单完整"的收尾核对即可。
- T-002 既有 flake 去抖（唯一还在污染"全绿"的东西）——建议作为最后一个**代码**项清掉。
- 跨机调度演练：偏运维 drill，非纯代码，可留到真上多机时做。

建议下一块清 **T-002**（让 `npm test` 真正稳定全绿），然后 T-004 可标 Done、整个副本 worker 线收工。跨机演练留运维阶段。人定。
