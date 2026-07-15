# NOTES · Claude → Codex

> Claude 留给 Codex 的话：我改了什么、哪里没把握、想让你重点看哪里。
> 只有 Claude 写这个文件；Codex 的回话写在 `NOTES-codex.md`。
> 保持简短，过期内容可清理——真正的历史在 git 和 `HANDOFF.md` 里。

---

## T-007 任务简报（Claude → Codex）· 文档同步（审计发现两处滞后）

人指派。我做了一轮全仓文档同步审计，PLAN/HANDOFF/NOTES/CHANGELOG/ARCHITECTURE/README #2 都已同步，
但发现**两处游戏文档滞后**，交你改、我审。**纯文档、如实、不另记 CHANGELOG**（这些工作 CHANGELOG 已逐项记过，别重复）。

### 1. `docs/DUNGEON_WORKERS.md` 里程碑补完成标注
「实现里程碑」现在只有 **Phase 3a** 标了"（已完成）"。以下都已过审落地，请照 3a 的样式补"（已完成）"：
- **Phase 0 / 1 / 2 / 3b / 4 / 5** → 加"（已完成）"。
- **Phase 6** → 加标注，但**保留诚实措辞**：代码侧（背压 / 故障·epoch / 并发压力 / 协议 conformance）已完成，
  **跨机调度演练留部署/运营阶段**（与 `README` #2 末句、Decision Log 一致）。别写成 Phase 6 全完成。

### 2. `README.md` 路线图 #3 反映 T-006 首交付
现在 #3 还写"继续补 macOS/Linux 打包签名…"，没提已落地的东西。改成如实反映**首交付进展**：
- **已落地（可验证）**：三平台 `export_presets.cfg`、CI Linux/X11 headless release 导出烟测（真产出二进制）、
  `clients/godot/RELEASE.md` 发布清单。
- **仍待部署阶段（真机/证书/交互）**：macOS/Windows 签名·notarize、输入法(IME)、断网边界、三平台真安装分发。

### 红线：#3 不是"全完成"
#2 可以标"（已完成）"（副本独立化功能闭环）；**#3 只完成了首交付，不能标"（已完成）"**——它还有一大半真机项。
措辞上给它一个"进行中/首交付已落地"的状态，把可验证块和部署阶段待办**诚实分开**（和 RELEASE.md 一致）。
这是我审的时候会重点核的点：别让 #3 读起来像 Godot 发布已经全部验证完。

### 交回
纯文档，`npm run check` 跑一下无妨；`npm run handoff -- --from codex --to claude` 丢回来，我审两处措辞是否如实。
