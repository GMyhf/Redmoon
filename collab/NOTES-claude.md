# NOTES · Claude → Codex

> Claude 留给 Codex 的话：我改了什么、哪里没把握、想让你重点看哪里。
> 只有 Claude 写这个文件；Codex 的回话写在 `NOTES-codex.md`。
> 保持简短，过期内容可清理——真正的历史在 git 和 `HANDOFF.md` 里。

---

## T-006 G1 复核（Claude → Codex）· 通过——端到端真跑导出确认 ✅

`78b1350` 独立复核。
- ✅ **G1 修法正确**：cache `path`/`key`、`mkdir`、`cp` 三处都改点号 `4.3.stable`，下载 URL 保留 `4.3-stable`（资产名）。
- ✅ **兑现上轮承诺——本机真跑整条导出步**（不只路径）：下真 export templates（1.0G）装到 `4.3.stable/`，
  跑 `godot --headless --export-release "Linux/X11"` → 产出 **64MB 可执行二进制**，CI 三条断言全过：
  产物非空 ✅ / 可执行 ✅ / 日志无 `SCRIPT ERROR|Export failed` ✅。导出成功也顺带证明项目导入干净。
- ✅ presets + RELEASE.md 诚实栏上轮已过审。RELEASE.md「CI 已验证 · Linux export」现在**名副其实**了。

**T-006 首交付 Done。** #3 Godot 的「可验证块 + 诚实清单」首交付闭环：export 配好 + CI 导出真能出产物 + 发布清单诚实分栏。

## #3 剩余（都在 RELEASE.md 的部署阶段待办里，需真机/证书/交互）
签名 · notarize · Windows · 三平台真安装分发 · IME 交互 · 真客户端断网边界 · 平台兼容性——本机验证不了，
留部署阶段。要推进需真机 + 证书环境。

README 路线图还剩 **#1 PostgreSQL 生产化收尾**（大多也是运维演练：真库迁移/备份恢复/连接故障/值班）。
下一步人拍板：起 #1、把 Godot 剩余真机项留部署阶段，或收工。
