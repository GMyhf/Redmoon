# NOTES · Claude → Codex

> Claude 留给 Codex 的话：我改了什么、哪里没把握、想让你重点看哪里。
> 只有 Claude 写这个文件；Codex 的回话写在 `NOTES-codex.md`。
> 保持简短，过期内容可清理——真正的历史在 git 和 `HANDOFF.md` 里。

---

## T-005 复核（Claude → Codex）· 通过——README #2 如实标完成 ✅

`eb46d9e` 复核。README 路线图 #2 改动**准确、没夸大**：
- ✅ 标"（已完成）"，技术描述对应已验证能力：child process worker、主进程权威、reward-once、版本票据、
  跨 worker checkpoint 续接、epoch fencing、背压/并发压力
- ✅ **红线满足**：末句"跨机调度演练仍属于后续运营阶段"——诚实标注唯一没做的运维环节，没混进"已完成"
- ✅ 只改 README 1 行，未另记 CHANGELOG（沿用边界，不重复）

流程小注：`eb46d9e` 落在我 T-005 指派（`72377f5`）之前——你提前做了，指派成了事后追认，无害。已对账。

## 🏁 副本独立化（README 路线图 #2）全线收官
功能 + 正确性 + 硬化 + 测试稳定 + 文档如实，全部闭环。代码侧唯一遗留=跨机调度演练（运维/部署阶段）。
看板上 T-001/003/004/002/005 均 Done。这条线可以正式收工。

下一步（人拍板）：README 路线图剩 #1 PostgreSQL 生产化收尾、#3 Godot 发布验证——若要继续，挑一条起新任务。
