# NOTES · Claude → Codex

> Claude 留给 Codex 的话：我改了什么、哪里没把握、想让你重点看哪里。
> 只有 Claude 写这个文件；Codex 的回话写在 `NOTES-codex.md`。
> 保持简短，过期内容可清理——真正的历史在 git 和 `HANDOFF.md` 里。

---

## T-006 任务简报（Claude → Codex）· #3 Godot 发布验证 — 可验证块 + 诚实清单

人指派、范围已拍板：**只做能在仓库/CI 验证的部分，本机验证不了的（签名/输入法/真跨平台）如实列为部署阶段待办，
绝不冒充已完成**（和跨机演练同一条红线）。

### 现状（我侦察过）
- 本机有 Godot **4.3 headless**；CI（`.github/workflows/ci.yml` 的 `godot` job）已跑：`check:godot` 导入+解析、
  联机 headless 烟测、session.cfg 0600 校验。
- `clients/godot/` **没有 `export_presets.cfg`**——打包尚未配置。这是首交付的核心缺口。

### 首交付（就这三样）
1. **`clients/godot/export_presets.cfg`**：Linux/X11 x86_64、Windows Desktop x86_64、macOS 三个预设，参数对齐
   `project.godot`（4.3）。导出模板/产物别入库——按需加 `.gitignore`。
2. **CI 加一步 Linux headless 导出烟测**：在 `ci.yml` 的 `godot` job 里，下载 4.3 **export templates**（像 godot 二进制
   那样 cache）、跑 `godot --headless --export-release "Linux/X11" <out>`，断言产出二进制 + 日志无 `SCRIPT ERROR`/导出错误。
   这是把"能导出"变成 CI 可验证的关键一步。
3. **`clients/godot/RELEASE.md` 发布清单**，**分两栏**：
   - ✅ **CI 已验证**：导入/解析、联机 headless 烟测、Linux headless 导出。
   - ⏳ **部署阶段待办（真机/证书/交互，未做）**：macOS codesign + notarize、Windows 签名、输入法(IME)交互验证、
     三平台真安装/启动、真客户端断网边界。**明确标"未完成/需真机"，别写成已完成。**

### 红线
- **诚实**：RELEASE.md 的 ⏳ 栏是重点——它是给运维/发布的老实清单，不是"已全绿"。我审时会重点核这栏没被写成完成态。
- **本机导出可能验不了**：export templates（~GB）可能没装。若你本机跑不了导出，就配好 presets + CI 步骤，
  **如实说明"本机未跑导出、靠 CI 验证"**（别声称本机通过）。CI 那步能不能在 workflow 里 lint/dry-run 就尽量。
- 这次是真项目能力（打包 + CI），**记一条 `CHANGELOG.md`**（与脚手架流程改动不同，这属于游戏可发布性/架构）。

### 交回
`npm run check:godot` 跑一下确认没弄坏导入；`npm run handoff -- --from codex --to claude` 丢回来，我审 presets 合理性 +
CI 步骤 + **RELEASE.md 诚实栏**。体量可拆（先 presets+RELEASE，再 CI 导出步）分开回传也行。
