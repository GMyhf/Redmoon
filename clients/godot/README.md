# CRIMSON RELAY — Godot 最小客户端

Godot 4.3+ 原生客户端原型，走与浏览器客户端完全相同的 v2 协议
（契约见 `src/server/protocol.js`）。当前范围：

- 连接 `ws://127.0.0.1:3000/ws`，校验 `welcome` 协议版本；
- 主画面：职业列表（来自服务器 `archetypes`）、呼号输入、在线名册（`roster`）；
- `join` 携带 `protocol` 与本机会话令牌（`user://session.cfg`，`session` 消息下发时保存）；
- 快照渲染：玩家/怪物/掉落/投射物/传送门/安全区，位置平滑插值，镜头跟随；
- 输入：WASD/方向键移动、Shift 奔跑、左键点地移动、右键普攻、Q/E/R/C/F 技能，20Hz `input`；
- Esc 或按钮 `leave` 返回主画面。

渲染是俯视 2D 示意图（服务器坐标直绘），不是浏览器端的等距美术——本客户端
的目标是验证协议与手感链路，不是像素级复刻。

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
