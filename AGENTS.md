# Repository Guidelines

> **CRIMSON RELAY** 是一个 Node.js 20+ 的在线动作 RPG 原型。浏览器只负责输入与渲染；服务端是唯一的游戏事实来源。

## Directory Map

| Path | Purpose |
| --- | --- |
| `src/server/` | 服务端运行时：HTTP/WebSocket、世界模拟与游戏定义 |
| `public/` | 浏览器客户端、样式与 SVG 资源 |
| `test/` | `node:test` 的世界、HTTP 与协议测试 |
| `docs/` | 架构和消息协议说明 |
| `deploy/` | systemd 部署示例 |

关键文件：`server.js` 处理连接，`world.js` 处理权威模拟，`definitions.js` 是协议与数值的单一来源。涉及玩法或协议的实质改动，同时更新 `CHANGELOG.md` 与 `docs/ARCHITECTURE.md`。

## Daily Commands

| Command | Use |
| --- | --- |
| `npm install` | 安装锁定的 `ws` 依赖 |
| `npm run dev` | 以 watch 模式启动本地服务 |
| `npm start` | 正常启动，默认 `127.0.0.1:3000` |
| `npm test` | 运行全部自动化测试 |
| `npm run check` | 检查服务端与客户端脚本语法 |
| `node --test test/server-world.test.js` | 只运行世界规则测试 |

使用 `HOST=0.0.0.0 PORT=3000 npm start` 进行局域网试玩。`PERSIST_PATH` 指定账户 JSON；不要提交生成的 `data/` 文件。

## Code Rules

- 使用 ESM、两空格缩进、双引号和分号。
- 变量与函数使用 `camelCase`，类使用 `PascalCase`；多词文件名使用小写 kebab-case。
- 将共享数值、技能和协议常量放在 `definitions.js`，不要在客户端复制游戏规则。
- 客户端只能提交意图。服务端必须验证消息，并在 tick 边界由 `World` 决定移动、命中、伤害与奖励。

> 破坏性协议变更必须同步更新 `PROTOCOL_VERSION`、协议文档和测试。

## Tests and Reviews

测试使用 `node:test` 与 `node:assert/strict`。世界测试应注入确定性随机源，例如 `rng: () => 0.5`，关闭不受控生成，并用 `world.update(dt)` 推进时间；不要依赖真实网络或墙上时钟。

提交前运行 `npm test` 和 `npm run check`。历史提交使用简短的祈使句，例如 `Add account persistence...`。PR 请说明玩家可见或协议影响、列出验证命令、关联 issue；涉及界面时附截图或短录屏。
