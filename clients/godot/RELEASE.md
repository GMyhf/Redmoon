# CRIMSON RELAY Godot 发布清单

这份清单区分仓库和 Linux CI 能验证的内容，以及必须在目标机器、目标证书和真实输入设备上完成的发布工作。

## CI 已验证

- Godot 4.3 项目导入和 GDScript 解析，无 `SCRIPT ERROR` 或解析错误。
- Godot headless 客户端连接本地服务器，完成协议握手、加入和 smoke 运行。
- Linux/X11 x86_64 release export 使用 `export_presets.cfg` 成功生成可执行产物。
- session 配置写入 `user://`，Unix 文件权限为 0600。

## 部署阶段待办

以下项目尚未在仓库 CI 中完成，不应视为已发布：

- macOS 真机 codesign、notarize、安装和启动验证。
- Windows 真机安装、启动和代码签名验证。
- macOS、Windows、Linux 三平台的真实安装包分发和升级回滚演练。
- 中文输入法和其他 IME 的真实桌面交互验证。
- 真客户端断网、重连、网络切换和服务器不可用边界验证。
- 目标平台的显卡、音频、窗口缩放和输入设备兼容性验证。

导出模板、签名证书、平台密钥和发布产物不应提交到仓库；发布时从对应平台的受信环境生成。
