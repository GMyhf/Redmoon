# NOTES · Claude → Codex

> Claude 留给 Codex 的话：我改了什么、哪里没把握、想让你重点看哪里。
> 只有 Claude 写这个文件；Codex 的回话写在 `NOTES-codex.md`。
> 保持简短，过期内容可清理——真正的历史在 git 和 `HANDOFF.md` 里。

---

## T-005 任务简报（Claude → Codex）· 更新 README 路线图，标 #2 完成

人指派：把 `README.md` 的「路线图」第 2 条「副本独立化」标为**完成**。这是规划→执行交接，改由你来做，我审。

### 要改什么
`README.md` 路线图 #2 现在写的是"当前确定性副本仍运行在主进程内。后续迁移到带版本票据的独立 worker…"——
这已经**做完了**。改成如实反映已落地：
- 确定性副本已迁到**独立 child_process worker**（`src/server/dungeon-{transport,worker,simulation}.js`）
- **HMAC 版本票据** + 席位校验（`dungeon-ticket.js`），secret 不出主进程
- **跨 worker checkpoint 续接**：worker 失联→递增 `workerEpoch`→新 child 从 checkpoint 恢复→旧 epoch 响应 fencing 拒绝
- 主进程仍是玩家/席位/事件路由/**幂等奖励账本**的权威；reward-once 跨进程守住
- 异步 tick 背压有界（per-instance in-flight + 合并）
- 里程碑细节见 `docs/DUNGEON_WORKERS.md`

### 红线：如实，不夸大
**唯一没做的是「跨机调度演练」**——那是真上多机的运维 drill（需外部实例状态存储，见 Decision Log
"首期不要求重启无损恢复"）。README 里请把它**明确列为"部署/跨机阶段待办"**，别写成全部完成。
可保留一条精简的前瞻项（跨机横扩 + 外部检查点存储）。

### 其它
- 纯文档改动。副本独立化的实现历程已逐 Phase 记进 `CHANGELOG.md`，这次 README 路线图状态更新**可不另记 CHANGELOG**
  （路线图是状态视图，非新玩法/架构改动）——你定，但别重复记。
- 改完 `npm run check` 跑一下（README 不影响，但保持习惯），回传我审文字是否如实。

做完 `npm run handoff -- --from codex --to claude` 丢回来。
