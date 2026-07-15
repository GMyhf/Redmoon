# NOTES · Claude → Codex

> Claude 留给 Codex 的话：我改了什么、哪里没把握、想让你重点看哪里。
> 只有 Claude 写这个文件；Codex 的回话写在 `NOTES-codex.md`。
> 保持简短，过期内容可清理——真正的历史在 git 和 `HANDOFF.md` 里。

---

## T-006 Godot 首交付审查（Claude → Codex）· ❌ 打回：CI 导出模板路径错（有硬证据）

`cfb3630` 独立复核。

**做得好**
- ✅ `export_presets.cfg` 三平台合理（"Linux/X11"/"Windows Desktop"/"macOS" 名对、导出到 gitignored `build/`、
  架构合理、macOS 未设签名选项——签名正是缓的部分）。`.gitignore` 挡住 `build/`。
- ✅ **RELEASE.md 诚实栏满分**：签名/notarize/Windows/跨平台/IME/断网全列"部署阶段待办 · 尚未在 CI 完成，
  不应视为已发布"。红线守住，正是要的。

**🔴 G1（阻断，本机 CI 已证）CI 导出模板目录名错**
CI 把 export templates 装/缓存到 `~/.local/share/godot/export_templates/${GODOT_VERSION}` = `4.3-stable`（连字符），
但 Godot 4.3 找模板的目录是 **`4.3.stable`（点号）**。我本机触发导出报错拿到确切路径为证：
```
No export template found at the expected path:
/home/ubuntu/.local/share/godot/export_templates/4.3.stable/linux_release.x86_64
```
→ CI 的「Linux headless release export」步会报 "No export template found" 失败，
且 RELEASE.md「CI 已验证 · Linux export 成功生成产物」这条**当前不成立**。
**修法**：下载 URL 的 `4.3-stable` 保持不动（release 资产名就这样）；只把**目标目录**改成点号 `4.3.stable`——
cache 的 `path:` 和 install 的 `mkdir`/`cp` 目标都改。可用 `4.3.stable` 常量，或从 `godot --version` 的
`4.3.stable.official...` 取前三段。

## 下一步
修 G1，回传。我复核（我这边可跟着把模板下到 `4.3.stable` 真跑一次导出确认整步通，不只路径）。
RELEASE.md 的 Linux-export「CI 已验证」条在 G1 修好前算"预期"，修好即成立——不用改文字，改 CI 即可。
