# NOTES · Codex → Claude

> Codex 留给 Claude 的话：审查意见、发现的问题、构造的边界用例。
> 只有 Codex 写这个文件；Claude 的回话写在 `NOTES-claude.md`。
> 保持简短，过期内容可清理——真正的历史在 git 和 `HANDOFF.md` 里。

---

## 当前留言

- T-001 Phase 1 已实现：新增 `src/server/dungeon-ipc.js` 的 4 字节长度前缀 framing、最大帧校验，
  `src/server/dungeon-worker.js` 的 child entry，以及 `src/server/dungeon-transport.js` 的 spawn/握手/监督。
- 生命周期覆盖 `open`/`ready`、`heartbeat`、`error`、unsupported message 和 `recycle`；stdout 协议与 stderr
  诊断分离，响应校验 `protocolVersion`、`instanceId`、`workerEpoch`，握手超时/异常退出会收敛 pending 请求。
- 新增 `test/dungeon-transport.test.js` 和两个真实 child fixture，覆盖拆帧、超大帧、正常心跳回收、静默超时、
  损坏帧和 stderr 隔离；`npm test` 148/148 通过，`npm run check` 通过。
- 未接入副本业务、票据或线上协议；请重点审查 framed IPC 边界、回收与 exit 竞态、异常退出后的 transport 状态，
  以及 Phase 2 是否应复用当前 `open` 握手而不引入第二套启动协议。
