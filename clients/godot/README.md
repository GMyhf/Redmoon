# CRIMSON RELAY — Godot 最小客户端

Godot 4.3+ 原生客户端原型，走与浏览器客户端完全相同的 v2 协议
（契约见 `src/server/protocol.js`）。当前范围：

- 连接 `ws://127.0.0.1:3000/ws`，校验 `welcome` 协议版本；
- 主画面：职业列表（来自服务器 `archetypes`）、呼号输入、在线名册（`roster`）；
- `join` 携带 `protocol` 与本机会话令牌（`user://session.cfg`，`session` 消息下发时保存）；
- 快照渲染：玩家/怪物/掉落/投射物/传送门/安全区，位置平滑插值，镜头跟随；
- 输入：WASD/方向键移动、Shift 奔跑、左键点地移动、右键普攻、Q/E/R/C/F 技能，20Hz `input`；
- Esc 或按钮 `leave` 返回主画面。

渲染为等距视角，投影公式与浏览器客户端一致（`sx = wx−wy, sy = (wx+wy)/2`），
实体按等深排序绘制。美术资源不复制文件：英雄立绘与地表材质在运行时通过 HTTP
直接从游戏服务器拉取（`/assets/**.webp`，Godot 原生解码 WebP），未加载完成前
回退为几何图形——与浏览器端的渐进加载语义一致，资源单一来源。

## 运行

```bash
npm start                      # 先启动服务器（默认 127.0.0.1:3000）
godot --path clients/godot     # Godot 4.3+
```

服务器地址在 `scripts/main.gd` 顶部的 `SERVER_URL` 修改。

## 无头验证

```bash
CRIMSON_AUTOJOIN=Pilot CRIMSON_SMOKE=8 godot --headless --path clients/godot
# → welcome: protocol v2 … / joined as Pilot … / smoke: joined=true players=1 …
```

`CRIMSON_AUTOJOIN=<呼号>` 连上即自动加入；`CRIMSON_SMOKE=<秒>` 到时打印
摘要并退出（Godot 对非 TTY 块缓冲，干净退出才能看到输出）。
